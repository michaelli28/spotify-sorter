import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));

import { CreditsFoot, CreditsHead } from "@/src/components/apply/Credits";
import { outOfRegister, printSlide } from "@/src/components/apply/CreditSleeve";
import { PrintRun } from "@/src/components/apply/PrintRun";
import { registrationShift } from "@/src/components/graphics/Sleeve";
import type { SleeveSpec } from "@/src/lib/sleeves/spec";
import { planApply } from "@/src/components/apply/plan";
import type { SleeveState } from "@/src/components/apply/print-run";
import type { ApplyResult } from "@/src/lib/pipeline/apply";

function playlist(name: string, track_count: number, created = true) {
  return {
    id: `pl-${name}`,
    category_id: `c-${name}`,
    name: `✨ ${name}`,
    track_count,
    created,
  };
}

function result(over: Partial<ApplyResult> = {}): ApplyResult {
  return {
    created: 3,
    updated: 0,
    tracks_added: 12194,
    tracks_removed: 0,
    playlists: [
      playlist("Rain", 40),
      playlist("Dusk", 310),
      playlist("Ambient Dark Soundscapes", 1200),
    ],
    ...over,
  };
}

function head(r: ApplyResult = result(), tracks = 20000) {
  return render(
    <CreditsHead
      result={r}
      tracks={tracks}
      notice={null}
      onRetryCovers={() => {}}
    />,
  );
}

function title() {
  return screen.getByRole("heading", { level: 1 });
}

const AT = "2026-09-01T00:00:00.000Z";
const category = (name: string) => ({
  name,
  description: "",
  spotify_playlist_id: null,
  created_at: AT,
  example_track_ids: [],
});

// Three rows in the order the write walks them.
const rows = planApply({
  config: { prefix: "✨", confidence_threshold: 65, anthropic_model: "m" },
  categories: {
    c1: category("Rain"),
    c2: category("Dusk"),
    c3: category("Ambient Dark Soundscapes"),
  },
  tracks: {},
  assignments: {},
}).rows;

function credits(
  over: Partial<Parameters<typeof PrintRun>[0]> = {},
  states: SleeveState[] = ["printed", "printed", "printed"],
) {
  return render(<PrintRun rows={rows} states={states} {...over} />);
}

beforeEach(() => {
  motion.reduced = false;
});

describe("the close", () => {
  it("says how many playlists are on Spotify", () => {
    head();
    expect(title()).toHaveTextContent(/^3 playlists on Spotify\.$/);
  });

  // The close already counts them, so the line doesn't count them again.
  it("names a run that only created playlists", () => {
    head();
    expect(screen.getByText("All new")).toBeInTheDocument();
  });

  // A mixed run used to read "3 new playlists" above a list of 41.
  it("names a mixed run by both counts", () => {
    head(result({ created: 3, updated: 38 }));
    expect(screen.getByText("3 new, 38 updated")).toBeInTheDocument();
  });

  it("names a run that only updated playlists", () => {
    head(result({ created: 0, updated: 38 }));
    expect(screen.getByText("38 playlists updated")).toBeInTheDocument();
  });

  // It used to say "Updated. / 0 tracks placed."
  it("says nothing changed when nothing did, with no track count", () => {
    head(result({ created: 0, updated: 0, tracks_added: 0 }));
    expect(screen.getByText("Already up to date.")).toBeInTheDocument();
    expect(screen.queryByText(/placed/)).toBeNull();
  });

  it("says playlist and track, not playlists and tracks, for one", () => {
    head(
      result({
        created: 1,
        tracks_added: 1,
        playlists: [playlist("Rain", 1)],
      }),
    );
    expect(title()).toHaveTextContent(/^1 playlist on Spotify\.$/);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("1 track placed.")).toBeInTheDocument();
  });

  // tests/e2e/happy-path.spec.ts finds "2 tracks placed." by its text.
  it("keeps the count and 'tracks placed.' in one text node, grouped", () => {
    head();
    const line = screen.getByText("12,194 tracks placed.");
    expect(line.childNodes).toHaveLength(1);
  });

  // tracks_added counts placements: a song in four playlists adds four. The
  // library has 3,172 songs; "12,194 tracks placed." read as duplicates.
  it("counts a song placed in several playlists once", () => {
    head(result(), 3172);
    expect(screen.getByText("3,172 tracks placed.")).toBeInTheDocument();
  });

  it("counts only what this run added when it topped up", () => {
    head(result({ created: 0, updated: 3, tracks_added: 50 }), 3172);
    expect(screen.getByText("50 tracks placed.")).toBeInTheDocument();
  });

  // Spec §8.1: Apply now makes each playlist match, so it can take tracks out.
  const closeLine = () =>
    screen.getAllByText(/placed|removed|up to date/)[0]!.closest("p");

  it("adds what the sync took out after what it placed", () => {
    head(
      result({ created: 0, updated: 3, tracks_added: 50, tracks_removed: 12 }),
      3172,
    );
    expect(closeLine()).toHaveTextContent(
      /^All updated · 50 tracks placed · 12 removed\.$/,
    );
  });

  it("names the tracks when the sync only took some out", () => {
    head(
      result({ created: 0, updated: 3, tracks_added: 0, tracks_removed: 1 }),
    );
    expect(closeLine()).toHaveTextContent(/^All updated · 1 track removed\.$/);
  });

  it("prints no removed part when nothing was removed", () => {
    head(result({ created: 0, updated: 3, tracks_added: 50 }), 3172);
    expect(closeLine()).toHaveTextContent(/^All updated · 50 tracks placed\.$/);
    expect(screen.getByText("50 tracks placed.").childNodes).toHaveLength(1);
  });

  // A server from before the sync sends no tracks_removed at all.
  it("reads a done event without tracks_removed as nothing removed", () => {
    const old: Partial<ApplyResult> = result({ tracks_added: 50 });
    delete old.tracks_removed;
    head(old as ApplyResult, 3172);
    expect(screen.queryByText(/removed/)).toBeNull();
    expect(screen.getByText("50 tracks placed.")).toBeInTheDocument();
  });

  it("offers Retry covers for failed uploads", async () => {
    const retry = vi.fn();
    render(
      <CreditsHead
        result={result()}
        tracks={20000}
        notice={{ kind: "retry", text: "2 covers didn't upload." }}
        onRetryCovers={retry}
      />,
    );
    expect(screen.getByText("2 covers didn't upload.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry covers" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: "Reconnect" })).toBeNull();
  });

  it("offers only Reconnect when the covers need a new token", () => {
    render(
      <CreditsHead
        result={result()}
        tracks={20000}
        notice={{
          kind: "reconnect",
          text: "Reconnect Spotify to add covers, then apply again.",
        }}
        onRetryCovers={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "Reconnect" })).toHaveAttribute(
      "href",
      "/api/auth/login",
    );
    expect(screen.queryByRole("button", { name: "Retry covers" })).toBeNull();
  });

  // Home used to sit after all 41 rows, far below the fold.
  it("offers Home in the close, held like the nav while covers upload", () => {
    const { rerender } = render(
      <CreditsHead
        result={result()}
        tracks={20000}
        notice={null}
        onRetryCovers={() => {}}
        busy
      />,
    );
    expect(screen.getByText("Home").closest("[inert]")).not.toBeNull();
    rerender(
      <CreditsHead
        result={result()}
        tracks={20000}
        notice={null}
        onRetryCovers={() => {}}
      />,
    );
    expect(screen.getByText("Home").closest("[inert]")).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  // A live region only announces what changes inside it, so it is always there.
  it("announces the cover notice", () => {
    const props = { result: result(), tracks: 20000, onRetryCovers: () => {} };
    const { rerender } = render(<CreditsHead {...props} notice={null} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    rerender(
      <CreditsHead
        {...props}
        notice={{ kind: "retry", text: "2 covers didn't upload." }}
      />,
    );
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("2 covers didn't upload.");
  });

  // The pressed button stays where it was, so keyboard focus stays with it.
  it("keeps Retry covers in place, unavailable, while it retries", async () => {
    const retry = vi.fn();
    const props = { result: result(), tracks: 20000, onRetryCovers: retry };
    const { rerender } = render(
      <CreditsHead
        {...props}
        notice={{ kind: "retry", text: "2 covers didn't upload." }}
      />,
    );
    const button = screen.getByRole("button", { name: "Retry covers" });
    rerender(
      <CreditsHead
        {...props}
        notice={{ kind: "retrying", text: "Retrying covers…" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry covers" })).toBe(button);
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(retry).not.toHaveBeenCalled();
  });

  // "41 playlists on / Spotify." at 390.
  it("balances the close's lines", () => {
    head();
    expect(title()).toHaveClass("text-balance");
  });

  it("shows the close at once under reduced motion", () => {
    motion.reduced = true;
    head();
    expect(title().style.opacity).not.toBe("0");
  });

  it("brings the close in otherwise", () => {
    head();
    expect(title().style.opacity).toBe("0");
  });
});

describe("the credits", () => {
  // The same list as the manifest, so the sleeves print in place, top to bottom.
  it("lists the playlists in the order they were written, without the prefix", () => {
    credits();
    const items = within(
      screen.getByRole("region", { name: "Playlists" }),
    ).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "01Rain0",
      "02Dusk0",
      "03Ambient Dark Soundscapes0",
    ]);
  });

  it("opens each written playlist in Spotify", () => {
    credits({ playlists: new Map([["c2", "pl-Dusk"]]) });
    expect(screen.getByRole("link", { name: /Dusk/ })).toHaveAttribute(
      "href",
      "spotify:playlist:pl-Dusk",
    );
    // No playlist, no link.
    expect(screen.queryByRole("link", { name: /Rain/ })).toBeNull();
  });

  // A mark on every row tells you nothing.
  it("marks new playlists only when told the run mixed them", () => {
    const { unmount } = credits();
    expect(screen.queryByText("new")).toBeNull();
    unmount();
    credits({ fresh: new Set(["c2"]) });
    expect(screen.getAllByText("new")).toHaveLength(1);
    expect(screen.getByText("new").closest("li")).toHaveTextContent("Dusk");
    expect(
      screen.getByRole("img", { name: "New playlist" }).closest("li"),
    ).toHaveTextContent("Dusk");
  });

  // A taller row makes the press list's columns spill into a fourth one:
  // every mark sits in the sleeve slot, so every row keeps one height.
  it("keeps its marks inside the sleeve slot, never on a line of their own", () => {
    credits({ fresh: new Set(["c2"]), speak: "run" }, [
      "printed",
      "printed",
      "failed",
    ]);
    const slots = document.querySelectorAll("[data-state]");
    expect(slots[1]).toHaveTextContent("new");
    expect(slots[2]).toHaveAttribute("aria-label", "Stopped here");
    for (const li of screen.getAllByRole("listitem")) {
      expect(li.querySelector(".col-\\[2\\/4\\].min-w-0")).toBeNull();
    }
  });

  it("prints nothing into a slot before its playlist is written", () => {
    credits({}, ["printed", "current", "pending"]);
    const slots = document.querySelectorAll<HTMLElement>("[data-state]");
    const inked = (el: HTMLElement) =>
      (el.querySelector("span + span") as HTMLElement).style.opacity;
    expect(inked(slots[0]!)).toBe("1");
    expect(inked(slots[1]!)).toBe("0");
    expect(inked(slots[2]!)).toBe("0");
  });

  // After the write, only a cover that didn't go on differs from its neighbours.
  it("names the sleeves whose cover didn't go on, and only those", () => {
    credits({ speak: "covers", fresh: new Set(["c3"]) }, [
      "registered",
      "printed",
      "printed",
    ]);
    const imgs = screen.getAllByRole("img");
    expect(imgs.map((el) => el.getAttribute("aria-label"))).toEqual([
      "No cover",
      "New playlist. No cover",
    ]);
    expect(imgs[0]!.closest("li")).toHaveTextContent("Dusk");
  });

  it("speaks each slot's state only while asked to", () => {
    const { unmount } = credits({ speak: "run" }, [
      "printed",
      "current",
      "pending",
    ]);
    expect(screen.getByRole("img", { name: "Written" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Writing now" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.getByRole("img", { name: "Not written yet" }),
    ).toBeInTheDocument();
    unmount();
    credits();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

describe("the registration mark", () => {
  const spec = (dx: number, dy: number) =>
    ({ dx, dy }) as unknown as SleeveSpec;
  // Screen px drum B travels at `size` px when out of register.
  const travel = (s: SleeveSpec, size: number) => {
    const { x, y } = registrationShift(s, outOfRegister(s, size));
    return (Math.max(Math.abs(x), Math.abs(y)) * size) / 100;
  };

  // 4× the offset moved drum B under 3px at 36px: a sleeve with no cover
  // looked the same as one with a cover.
  it("pulls drum B about 5px out of register at the credits' size", () => {
    for (const s of [spec(2.4, 1.6), spec(-1.6, 1.6), spec(1.6, -2.4)]) {
      expect(travel(s, 36)).toBeCloseTo(5, 5);
    }
  });

  it("never prints it closer than the brief's 4× offset", () => {
    expect(outOfRegister(spec(2.4, 2.4), 400)).toBe(4);
  });

  it("slides drum A in from 6px left, whatever the size", () => {
    expect((printSlide(36) * 36) / 100).toBeCloseTo(-6, 5);
  });
});

describe("where the credits end", () => {
  it("ends with the folder step", () => {
    render(<CreditsFoot prefix="♫" />);
    expect(
      screen.getByText(/select the ♫ playlists → right-click → Add to Folder/),
    ).toBeInTheDocument();
  });
});
