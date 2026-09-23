import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));

import { SuccessCredits } from "@/src/components/apply/SuccessCredits";
import type { ApplyResult } from "@/src/lib/pipeline/apply";

function playlist(name: string, track_count: number, created = true) {
  return { id: `pl-${name}`, name: `✨ ${name}`, track_count, created };
}

function result(over: Partial<ApplyResult> = {}): ApplyResult {
  return {
    created: 3,
    updated: 0,
    tracks_added: 12194,
    playlists: [
      playlist("Rain", 40),
      playlist("Dusk", 310),
      playlist("Ambient Dark Soundscapes", 1200),
    ],
    ...over,
  };
}

function title() {
  return screen.getByRole("heading", { level: 1 });
}

beforeEach(() => {
  motion.reduced = false;
});

describe("SuccessCredits", () => {
  it("names a run that only created playlists", () => {
    render(<SuccessCredits result={result()} prefix="✨" tracks={20000} />);
    expect(title()).toHaveTextContent(/^3 new playlists$/);
  });

  // A mixed run used to read "3 new playlists" above a list of 41.
  it("names a mixed run by both counts", () => {
    render(
      <SuccessCredits
        result={result({ created: 3, updated: 38 })}
        prefix="✨"
        tracks={20000}
      />,
    );
    expect(title()).toHaveTextContent(/^3 new, 38 updated$/);
  });

  it("names a run that only updated playlists", () => {
    render(
      <SuccessCredits
        result={result({ created: 0, updated: 38 })}
        prefix="✨"
        tracks={20000}
      />,
    );
    expect(title()).toHaveTextContent(/^38 playlists updated$/);
  });

  // It used to say "Updated. / 0 tracks placed."
  it("says nothing changed when nothing did, with no track count", () => {
    render(
      <SuccessCredits
        result={result({ created: 0, updated: 0, tracks_added: 0 })}
        prefix="✨"
        tracks={20000}
      />,
    );
    expect(title()).toHaveTextContent(/^Already up to date\.$/);
    expect(screen.queryByText(/placed/)).toBeNull();
  });

  it("says playlist and track, not playlists and tracks, for one", () => {
    render(
      <SuccessCredits
        result={result({ created: 1, tracks_added: 1 })}
        prefix="✨"
        tracks={20000}
      />,
    );
    expect(title()).toHaveTextContent(/^1 new playlist$/);
    expect(screen.getByText("1 track placed.")).toBeInTheDocument();
  });

  // tests/e2e/happy-path.spec.ts finds "2 tracks placed." by its text.
  it("keeps the count and 'tracks placed.' in one text node, grouped", () => {
    render(<SuccessCredits result={result()} prefix="✨" tracks={20000} />);
    const line = screen.getByText("12,194 tracks placed.");
    expect(line.childNodes).toHaveLength(1);
  });

  // tracks_added counts placements: a song in four playlists adds four. The
  // library has 3,172 songs; "12,194 tracks placed." read as duplicates.
  it("counts a song placed in several playlists once", () => {
    render(<SuccessCredits result={result()} prefix="✨" tracks={3172} />);
    expect(screen.getByText("3,172 tracks placed.")).toBeInTheDocument();
  });

  it("counts only what this run added when it topped up", () => {
    render(
      <SuccessCredits
        result={result({ created: 0, updated: 3, tracks_added: 50 })}
        prefix="✨"
        tracks={3172}
      />,
    );
    expect(screen.getByText("50 tracks placed.")).toBeInTheDocument();
  });

  it("lists the playlists biggest first, without the prefix", () => {
    render(<SuccessCredits result={result()} prefix="✨" tracks={20000} />);
    const names = screen
      .getAllByRole("listitem")
      .map((li) => within(li).getByRole("link").textContent);
    expect(names).toEqual(["Ambient Dark Soundscapes", "Dusk", "Rain"]);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("1,200");
  });

  it("opens each playlist in Spotify", () => {
    render(<SuccessCredits result={result()} prefix="✨" tracks={20000} />);
    expect(screen.getByRole("link", { name: "Dusk" })).toHaveAttribute(
      "href",
      "spotify:playlist:pl-Dusk",
    );
  });

  // A mark on every row tells you nothing.
  it("marks new playlists only when the run mixed new and existing ones", () => {
    const { unmount } = render(
      <SuccessCredits result={result()} prefix="✨" tracks={20000} />,
    );
    expect(screen.queryByText("new")).toBeNull();
    unmount();
    render(
      <SuccessCredits
        result={result({
          created: 1,
          updated: 2,
          playlists: [
            playlist("Rain", 40, false),
            playlist("Dusk", 310, true),
            playlist("Ambient", 1200, false),
          ],
        })}
        prefix="✨"
        tracks={20000}
      />,
    );
    expect(screen.getAllByText("new")).toHaveLength(1);
    expect(
      within(screen.getByText("new").closest("li")!).getByRole("link"),
    ).toHaveTextContent("Dusk");
  });

  it("ends with the folder step, Open Spotify and Home", () => {
    render(<SuccessCredits result={result()} prefix="♫" tracks={20000} />);
    expect(
      screen.getByText(/select the ♫ playlists → right-click → Add to Folder/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Spotify" })).toHaveAttribute(
      "href",
      "spotify:",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows every row at once under reduced motion", () => {
    motion.reduced = true;
    render(<SuccessCredits result={result()} prefix="✨" tracks={20000} />);
    for (const li of screen.getAllByRole("listitem")) {
      expect(li.style.opacity).not.toBe("0");
    }
    expect(title().style.opacity).not.toBe("0");
  });

  it("rolls the rows in otherwise", () => {
    render(<SuccessCredits result={result()} prefix="✨" tracks={20000} />);
    expect(screen.getAllByRole("listitem")[0]!.style.opacity).toBe("0");
  });
});
