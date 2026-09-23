import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeCrate } from "@/src/components/home/HomeCrate";
import type { ShelfEntry } from "@/src/components/home/shelf";
import { specFor } from "@/src/lib/sleeves/spec";

const tid = (n: number) => `track${String(n).padStart(17, "0")}`;
function entry(
  id: string,
  catalogueNo: number,
  name: string,
  count: number,
  records: ShelfEntry["records"] = [],
): ShelfEntry {
  return {
    id,
    catalogueNo,
    name,
    count,
    temperature: "haze",
    spec: specFor({ id, name }),
    onSpotify: false,
    records,
  };
}

// Front (largest) to back, as buildShelf orders them.
const ENTRIES = [
  entry("c2", 2, "Bedroom Pop Intimacy", 1442, [
    { id: tid(1), title: "drive", artist: "Current Blue" },
    { id: tid(2), title: "the perfect pair", artist: "beabadoobee" },
  ]),
  entry("c1", 1, "Emo Rap Heartbreak", 618, [
    { id: tid(3), title: "Casin", artist: "glue70" },
  ]),
  entry("c3", 3, "Stutter House Rhythmic", 14),
];

const tabs = () =>
  within(
    screen.getByRole("group", { name: "Flip through categories" }),
  ).getAllByRole("button");
const pressed = () =>
  tabs().find((t) => t.getAttribute("aria-pressed") === "true");
const sleeveLink = () => screen.getByRole("link", { name: /in Categories$/ });

describe("<HomeCrate>", () => {
  it("stands the dividers front to back and pulls the front one", () => {
    render(<HomeCrate entries={ENTRIES} />);
    expect(tabs().map((t) => t.getAttribute("aria-label"))).toEqual([
      "02 Bedroom Pop Intimacy, 1,442 tracks",
      "01 Emo Rap Heartbreak, 618 tracks",
      "03 Stutter House Rhythmic, 14 tracks",
    ]);
    expect(pressed()).toHaveAccessibleName(/^02 Bedroom Pop/);
    expect(sleeveLink()).toHaveAttribute("href", "/review#c2");
    expect(
      screen.getByRole("link", { name: "02 Bedroom Pop Intimacy" }),
    ).toHaveAttribute("href", "/review#c2");
    expect(screen.getByText("1,442")).toBeInTheDocument();
  });

  it("is one Tab stop: only the pulled divider's tab takes focus", () => {
    render(<HomeCrate entries={ENTRIES} />);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it("flips with the arrow keys, Home and End, moving the Tab stop along", async () => {
    const user = userEvent.setup();
    render(<HomeCrate entries={ENTRIES} />);
    tabs()[0]!.focus();
    await user.keyboard("{ArrowUp}");
    expect(pressed()).toHaveAccessibleName(/^01 Emo Rap/);
    expect(pressed()).toHaveFocus();
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    await user.keyboard("{End}");
    expect(pressed()).toHaveAccessibleName(/^03 Stutter/);
    await user.keyboard("{ArrowLeft}");
    expect(pressed()).toHaveAccessibleName(/^01 Emo Rap/);
    await user.keyboard("{Home}");
    expect(pressed()).toHaveAccessibleName(/^02 Bedroom/);
    expect(pressed()).toHaveFocus();
  });

  it("pulls a divider when its tab is clicked, and names it under the crate", async () => {
    const user = userEvent.setup();
    render(<HomeCrate entries={ENTRIES} />);
    await user.click(tabs()[1]!);
    expect(pressed()).toHaveAccessibleName(/^01 Emo Rap/);
    expect(
      screen.getByRole("link", { name: "01 Emo Rap Heartbreak" }),
    ).toHaveAttribute("href", "/review#c1");
    await waitFor(() =>
      expect(sleeveLink()).toHaveAttribute("href", "/review#c1"),
    );
    await waitFor(() => expect(screen.getByText("Casin")).toBeInTheDocument());
    expect(screen.queryByText("drive")).toBeNull();
  });

  it("steps with ‹ and ›, which stop at the front and the back", async () => {
    const user = userEvent.setup();
    render(<HomeCrate entries={ENTRIES} />);
    const prev = screen.getByRole("button", {
      name: "Previous category (larger)",
    });
    const next = screen.getByRole("button", {
      name: "Next category (smaller)",
    });
    expect(prev).toHaveAttribute("aria-disabled", "true");
    await user.click(prev);
    expect(pressed()).toHaveAccessibleName(/^02 Bedroom/);
    await user.click(next);
    await user.click(next);
    expect(pressed()).toHaveAccessibleName(/^03 Stutter/);
    expect(next).toHaveAttribute("aria-disabled", "true");
    // Still focused at the end, so the keyboard doesn't fall back to the page.
    expect(next).toHaveFocus();
    await user.click(next);
    expect(pressed()).toHaveAccessibleName(/^03 Stutter/);
    await user.click(prev);
    expect(pressed()).toHaveAccessibleName(/^01 Emo Rap/);
    expect(next).toHaveAttribute("aria-disabled", "false");
  });

  it("previews a hovered tab's name and dims the records it doesn't own", async () => {
    const user = userEvent.setup();
    render(<HomeCrate entries={ENTRIES} />);
    const records = screen.getByRole("list", {
      name: "Tracks in Bedroom Pop Intimacy",
    });
    await user.hover(tabs()[2]!);
    expect(screen.getByTestId("crate-peek")).toHaveTextContent(
      "03 Stutter House Rhythmic",
    );
    expect(records.parentElement).toHaveAttribute("data-dimmed", "true");
    // Hover doesn't pull: the sleeve and the name stay the front divider's.
    expect(pressed()).toHaveAccessibleName(/^02 Bedroom/);
    await user.unhover(
      screen.getByRole("group", { name: "Flip through categories" }),
    );
    expect(screen.queryByTestId("crate-peek")).toBeNull();
    expect(records.parentElement).not.toHaveAttribute("data-dimmed");
  });

  it("lists the pulled category's records with their art, and nothing per song but title and artist", () => {
    render(<HomeCrate entries={ENTRIES} />);
    const list = screen.getByRole("list", {
      name: "Tracks in Bedroom Pop Intimacy",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]!).getByRole("link", { name: "drive" }),
    ).toHaveAttribute("href", `spotify:track:${tid(1)}`);
    expect(rows[0]).toHaveTextContent(/^driveCurrent Blue$/);
  });

  it("keeps the pulled divider when fresh counts reorder the crate", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<HomeCrate entries={ENTRIES} />);
    await user.click(tabs()[1]!);
    rerender(<HomeCrate entries={[ENTRIES[1]!, ENTRIES[0]!, ENTRIES[2]!]} />);
    expect(pressed()).toHaveAccessibleName(/^01 Emo Rap/);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it("prints no records list for a category with none to show", async () => {
    const user = userEvent.setup();
    render(<HomeCrate entries={ENTRIES} />);
    await user.click(tabs()[2]!);
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: /^Tracks in/ })).toBeNull(),
    );
  });

  // The sleeve and slats stack at z 60/70; the price tag's Dialog is z-50 and
  // renders inline, so without its own stacking context the crate paints over it.
  it("keeps its layers inside the figure, under the page's dialogs", () => {
    render(<HomeCrate entries={ENTRIES} />);
    // CrateFigure is its own stacking context: the sleeve (z 60) and slats
    // (z 70) can't paint over the z-30 strip or a z-50 dialog.
    expect(
      screen.getByRole("group", { name: "Flip through categories" })
        .parentElement,
    ).toHaveClass("isolate");
  });

  it("drops a hover preview once the pointer leaves the tab for the sleeve", async () => {
    const user = userEvent.setup();
    render(<HomeCrate entries={ENTRIES} />);
    await user.hover(tabs()[2]!);
    expect(screen.getByTestId("crate-peek")).toBeInTheDocument();
    // Still inside the crate, onto the sleeve that opens the pulled category
    // (user-event's own move leaves the whole crate, so move by hand).
    fireEvent.pointerOut(tabs()[2]!, { relatedTarget: sleeveLink() });
    fireEvent.pointerOver(sleeveLink(), { relatedTarget: tabs()[2]! });
    expect(screen.queryByTestId("crate-peek")).toBeNull();
  });

  // The focused tab's label already names a keyboard flip; ‹ › leave focus on
  // themselves, so only they need the live line.
  it("announces a flip by ‹ ›, and leaves a keyboard flip to the focused tab", async () => {
    const user = userEvent.setup();
    render(<HomeCrate entries={ENTRIES} />);
    const said = screen.getByRole("status");
    expect(said).toHaveTextContent("");
    await user.click(
      screen.getByRole("button", { name: "Next category (smaller)" }),
    );
    expect(said).toHaveTextContent("01 Emo Rap Heartbreak");
    pressed()!.focus();
    await user.keyboard("{ArrowUp}");
    expect(pressed()).toHaveAccessibleName(/^03 Stutter/);
    expect(said).toHaveTextContent("");
  });

  describe("at phone width", () => {
    beforeEach(() => {
      vi.stubGlobal("matchMedia", (media: string) => ({
        matches: media === "(max-width: 720px)",
        media,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it("takes the tabs out of the tab order and flips with ‹ › instead", async () => {
      const user = userEvent.setup();
      render(<HomeCrate entries={ENTRIES} />);
      expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, -1]);
      await user.click(
        screen.getByRole("button", { name: "Next category (smaller)" }),
      );
      expect(pressed()).toHaveAccessibleName(/^01 Emo Rap/);
      expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, -1]);
    });
  });

  describe("the entrance", () => {
    beforeEach(() => window.sessionStorage.clear());
    afterEach(() => window.sessionStorage.clear());

    const sleeveOpacity = () =>
      Number(sleeveLink().parentElement!.style.opacity || "1");

    it("plays once, then remembers it for the session", async () => {
      render(<HomeCrate entries={ENTRIES} />);
      // The sleeve waits behind the slats while the dividers settle (0.3s),
      // where a skipped entrance has it there within a frame or two.
      await new Promise((r) => setTimeout(r, 150));
      expect(sleeveOpacity()).toBeLessThan(1);
      expect(window.sessionStorage.getItem("sorter:home-crate-entrance")).toBe(
        "1",
      );
    });

    it("doesn't play again in the same session: the sleeve is simply there", async () => {
      window.sessionStorage.setItem("sorter:home-crate-entrance", "1");
      render(<HomeCrate entries={ENTRIES} />);
      await waitFor(() => expect(sleeveOpacity()).toBe(1), { timeout: 150 });
    });
  });

  it("stands empty dividers, with no sticker, when nothing is placed yet", () => {
    render(
      <HomeCrate
        entries={[entry("a", 1, "Rain", 0), entry("b", 2, "Night", 0)]}
      />,
    );
    expect(tabs().map((t) => t.getAttribute("aria-label"))).toEqual([
      "01 Rain",
      "02 Night",
    ]);
    expect(screen.queryByText(/tracks$/)).toBeNull();
  });
});
