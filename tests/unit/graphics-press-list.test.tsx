import { describe, it, expect, vi } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "framer-motion";

// next/link, marked, so a test can tell it from a plain <a> (a full page reload).
vi.mock("next/link", async (importOriginal) => {
  const { default: Link } = await importOriginal<typeof import("next/link")>();
  return {
    default: (props: ComponentProps<typeof Link>) => (
      <Link {...props} data-next-link="" />
    ),
  };
});
import reference from "@/tests/fixtures/sleeve-reference.json";
import { PressList, type PressRow } from "@/src/components/graphics/PressList";
import { orderBySize } from "@/src/components/graphics/crate-geometry";
import { catalogueSpecs } from "@/src/lib/sleeves/spec";

const SPECS = catalogueSpecs(reference.categories);
const ROWS: PressRow[] = orderBySize(
  reference.categories.map((c, i) => ({
    id: c.id,
    catalogueNo: i + 1,
    name: c.name,
    count: c.tracks,
    spec: SPECS.get(c.id)!,
  })),
);

const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("<PressList>", () => {
  it("prints every row in the order given: sleeve, catalogue number, name, count", () => {
    render(<PressList rows={ROWS} />);
    const items = rows();
    expect(items).toHaveLength(41);
    const first = items[0];
    expect(first).toHaveTextContent("02");
    expect(first).toHaveTextContent("Bedroom Pop Intimacy");
    expect(first).toHaveTextContent("1,442");
    const sleeve = first.querySelector("svg[data-motif]")!;
    expect(sleeve).toHaveAttribute("width", "36");
    expect(items[40]).toHaveTextContent("Stutter House Rhythmic");
  });

  it("links each row to its category, with client-side navigation", () => {
    render(<PressList rows={ROWS} />);
    const link = within(rows()[0]).getByRole("link");
    expect(link).toHaveAttribute("href", `/review#${ROWS[0].id}`);
    expect(link).toHaveAttribute("data-next-link");
  });

  it("leaves a row unlinked when its href is null", () => {
    render(<PressList rows={ROWS.map((r) => ({ ...r, href: null }))} />);
    expect(within(rows()[0]).queryByRole("link")).toBeNull();
  });

  it("draws each bar on one scale: count / the largest", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <PressList rows={ROWS} />
      </MotionConfig>,
    );
    const bar = (i: number) =>
      rows()[i].querySelector("[data-bar]") as HTMLElement;
    // The largest bar is full length: scaleX(1), which framer writes as the identity.
    await waitFor(() => expect(bar(0).style.transform).toBe("none"));
    await waitFor(() =>
      expect(bar(40).style.transform).toBe(`scaleX(${14 / 1442})`),
    );
  });

  it("draws no bar for an empty row and never runs a bar past the scale", async () => {
    const [a, b] = ROWS;
    render(
      <MotionConfig reducedMotion="always">
        <PressList
          rows={[
            { ...a, count: 2000 },
            { ...b, count: 0 },
          ]}
          max={1442}
        />
      </MotionConfig>,
    );
    const bar = (i: number) =>
      rows()[i].querySelector("[data-bar]") as HTMLElement | null;
    await waitFor(() => expect(bar(0)!.style.transform).toBe("none"));
    expect(bar(1)).toBeNull();
    // The row still says its count; it just has no bar to draw.
    expect(rows()[1]).toHaveTextContent(`${b.name}0`);
  });

  it("can hold the scale fixed", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <PressList rows={ROWS.slice(1)} max={1442} />
      </MotionConfig>,
    );
    const bar = rows()[0].querySelector("[data-bar]") as HTMLElement;
    await waitFor(() =>
      expect(bar.style.transform).toBe(`scaleX(${1411 / 1442})`),
    );
  });

  describe("on Spotify", () => {
    const some = new Set([ROWS[0].id, ROWS[3].id]);

    it("marks only the rows already on Spotify when some are", () => {
      render(<PressList rows={ROWS} onSpotify={some} />);
      expect(screen.getAllByText("on Spotify")).toHaveLength(2);
      expect(within(rows()[0]).getByText("on Spotify")).toBeInTheDocument();
      expect(within(rows()[1]).queryByText("on Spotify")).toBeNull();
    });

    it("prints no marks when every row is on Spotify (they would all say the same)", () => {
      render(
        <PressList rows={ROWS} onSpotify={new Set(ROWS.map((r) => r.id))} />,
      );
      expect(screen.queryByText("on Spotify")).toBeNull();
    });
  });

  describe("phones", () => {
    it("hides rows past the top 12 behind Show all", async () => {
      render(<PressList rows={ROWS} />);
      const toggle = screen.getByRole("button", { name: "Show all 41" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(rows()[11].className).not.toContain("max-[720px]:hidden");
      expect(rows()[12].className).toContain("max-[720px]:hidden");

      await userEvent.click(toggle);
      expect(
        screen.getByRole("button", { name: "Show the top 12" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(rows()[12].className).not.toContain("max-[720px]:hidden");
    });

    it("needs no toggle for a short list", () => {
      render(<PressList rows={ROWS.slice(0, 12)} />);
      expect(screen.queryByRole("button")).toBeNull();
    });

    it("takes its own limit", () => {
      render(<PressList rows={ROWS} phoneLimit={5} />);
      expect(
        screen.getByRole("button", { name: "Show all 41" }),
      ).toBeInTheDocument();
      expect(rows()[5].className).toContain("max-[720px]:hidden");
    });
  });

  describe("slots (the apply credits)", () => {
    it("lets a page print its own sleeve and a trailing note per row", () => {
      render(
        <PressList
          rows={ROWS.slice(0, 3)}
          renderSleeve={(row, i) => (
            <span data-testid={`sleeve-${i}`}>{row.catalogueNo}</span>
          )}
          renderTrailing={(row) => <span>printed {row.name}</span>}
        />,
      );
      expect(screen.getByTestId("sleeve-0")).toHaveTextContent("2");
      expect(rows()[0].querySelector("svg[data-motif]")).toBeNull();
      expect(
        within(rows()[2]).getByText(`printed ${ROWS[2].name}`),
      ).toBeInTheDocument();
    });
  });
});
