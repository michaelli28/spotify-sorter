import { describe, expect, it } from "vitest";
import {
  creditsTitle,
  freshRows,
  onSpotifyTitle,
  printTarget,
  printedTitle,
  runStatus,
  sleeveStates,
  writtenPlaylists,
} from "@/src/components/apply/print-run";
import type { ApplyResult } from "@/src/lib/pipeline/apply";

const rows = [{ name: "Dusk" }, { name: "Rain" }, { name: "Haze" }];

function result(over: Partial<ApplyResult> = {}): ApplyResult {
  return {
    created: 3,
    updated: 0,
    tracks_added: 9,
    tracks_removed: 0,
    playlists: [],
    ...over,
  };
}

describe("sleeveStates", () => {
  it("shows every sleeve as a proof before the write", () => {
    expect(
      sleeveStates({ view: "ready", rows: 3, progress: null, printed: 0 }),
    ).toEqual(["proof", "proof", "proof"]);
  });

  it("leaves every slot blank until the first playlist is written", () => {
    expect(
      sleeveStates({ view: "running", rows: 3, progress: null, printed: 0 }),
    ).toEqual(["pending", "pending", "pending"]);
  });

  // onProgress("category", i) fires before playlist i is written (apply.ts).
  it("prints sleeve i-1 on event i and marks sleeve i as on the press", () => {
    expect(
      sleeveStates({
        view: "running",
        rows: 3,
        progress: { done: 2, total: 3 },
        printed: 2,
      }),
    ).toEqual(["printed", "printed", "current"]);
  });

  it("never prints a sleeve the pacer hasn't reached yet", () => {
    expect(
      sleeveStates({
        view: "running",
        rows: 3,
        progress: { done: 2, total: 3 },
        printed: 1,
      }),
    ).toEqual(["printed", "pending", "current"]);
  });

  it("marks where an error stopped the run, and nothing after it", () => {
    expect(
      sleeveStates({
        view: "error",
        rows: 3,
        progress: { done: 1, total: 3 },
        printed: 1,
      }),
    ).toEqual(["printed", "failed", "pending"]);
  });

  // Nothing was written, so the manifest's proofs stay: Try again writes them.
  it("keeps the proofs when the write stopped before it started", () => {
    expect(
      sleeveStates({ view: "error", rows: 3, progress: null, printed: 0 }),
    ).toEqual(["proof", "proof", "proof"]);
  });

  it("claims nothing about the playlist a dropped stream was writing", () => {
    expect(
      sleeveStates({
        view: "lost",
        rows: 3,
        progress: { done: 1, total: 3 },
        printed: 1,
      }),
    ).toEqual(["printed", "pending", "pending"]);
  });

  // Registration is the cover: in register only once Spotify took it.
  it("locks a sleeve into register only when its cover uploaded", () => {
    expect(
      sleeveStates({
        view: "done",
        rows: 3,
        progress: { done: 3, total: 3 },
        printed: 3,
        written: [true, true, false],
        registered: [true, false, false],
      }),
    ).toEqual(["registered", "printed", "pending"]);
  });

  it("keeps a registered cover's sleeve blank until the pacer prints it", () => {
    expect(
      sleeveStates({
        view: "done",
        rows: 2,
        progress: null,
        printed: 1,
        written: [true, true],
        registered: [true, true],
      }),
    ).toEqual(["registered", "pending"]);
  });
});

describe("printTarget", () => {
  it("prints nothing before the write", () => {
    expect(printTarget({ view: "ready", rows: 3, progress: null })).toBe(0);
  });

  it("follows what the stream says is written", () => {
    const progress = { done: 2, total: 3 };
    expect(printTarget({ view: "running", rows: 3, progress })).toBe(2);
    expect(printTarget({ view: "error", rows: 3, progress })).toBe(2);
    expect(printTarget({ view: "lost", rows: 3, progress })).toBe(2);
    expect(printTarget({ view: "running", rows: 3, progress: null })).toBe(0);
  });

  it("prints every row once the write is done", () => {
    expect(printTarget({ view: "done", rows: 3, progress: null })).toBe(3);
  });
});

describe("runStatus", () => {
  it("says Starting… before the first playlist", () => {
    expect(runStatus(null, rows)).toBe("Starting…");
  });

  it("names the playlist being written", () => {
    expect(runStatus({ done: 1, total: 3 }, rows)).toBe(
      "Writing 2 of 3 · Rain",
    );
  });

  it("drops the name once the last one is written", () => {
    expect(runStatus({ done: 3, total: 3 }, rows)).toBe("Writing 3 of 3");
  });

  it("groups thousands", () => {
    expect(runStatus({ done: 1200, total: 1500 }, [])).toBe(
      "Writing 1,201 of 1,500",
    );
  });
});

describe("titles", () => {
  it("counts the print run as printed of total", () => {
    expect(printedTitle(12, 41)).toBe("12 of 41 printed.");
    expect(printedTitle(1200, 1500)).toBe("1,200 of 1,500 printed.");
  });

  it("closes on how many playlists are on Spotify", () => {
    expect(onSpotifyTitle(41)).toBe("41 playlists on Spotify.");
    expect(onSpotifyTitle(1)).toBe("1 playlist on Spotify.");
  });

  it("names a run by what it created and updated", () => {
    expect(creditsTitle(result())).toBe("3 new playlists");
    expect(creditsTitle(result({ created: 1 }))).toBe("1 new playlist");
    expect(creditsTitle(result({ created: 3, updated: 38 }))).toBe(
      "3 new, 38 updated",
    );
    expect(creditsTitle(result({ created: 0, updated: 38 }))).toBe(
      "38 playlists updated",
    );
    expect(creditsTitle(result({ created: 0, updated: 0 }))).toBe(
      "Already up to date.",
    );
  });

  // The close already counts them: "41 playlists on Spotify." over "41 new
  // playlists" printed the same fact twice.
  it("says All new or All updated instead of repeating the close's count", () => {
    const three = [
      { id: "p1", category_id: "c1", name: "✨ Dusk", track_count: 1, created: true },
      { id: "p2", category_id: "c2", name: "✨ Rain", track_count: 1, created: true },
      { id: "p3", category_id: "c3", name: "✨ Haze", track_count: 1, created: true },
    ];
    expect(creditsTitle(result({ playlists: three }))).toBe("All new");
    expect(
      creditsTitle(result({ created: 0, updated: 3, playlists: three })),
    ).toBe("All updated");
    const one = three.slice(0, 1);
    expect(creditsTitle(result({ created: 1, playlists: one }))).toBe("New");
    expect(
      creditsTitle(result({ created: 0, updated: 1, playlists: one })),
    ).toBe("Updated");
  });

  // An existing playlist with nothing new is neither created nor updated.
  it("keeps the count when only some playlists changed", () => {
    const pl = (created: boolean) => ({
      id: "p",
      category_id: "c",
      name: "✨ x",
      track_count: 1,
      created,
    });
    const playlists = [pl(true), pl(true), pl(false)];
    expect(creditsTitle(result({ created: 2, playlists }))).toBe(
      "2 new playlists",
    );
    expect(creditsTitle(result({ created: 0, updated: 2, playlists }))).toBe(
      "2 playlists updated",
    );
  });
});

describe("matching the result to the rows", () => {
  const plan = [
    { id: "c1", name: "Dusk" },
    { id: "c2", name: "Rain" },
    { id: "c3", name: "Haze" },
  ];
  const pl = (id: string, category_id: string, name: string, created = true) => ({
    id,
    category_id,
    name: `✨ ${name}`,
    track_count: 1,
    created,
  });

  it("finds each row's playlist by its category", () => {
    const written = writtenPlaylists(
      plan,
      result({ playlists: [pl("p1", "c1", "Dusk"), pl("p2", "c2", "Rain")] }),
    );
    expect([...written]).toEqual([
      ["c1", "p1"],
      ["c2", "p2"],
    ]);
  });

  // Renamed in another tab between page load and Apply: the playlist carries
  // the new name, and a name match left the row blank.
  it("still finds a row whose category was renamed after the page loaded", () => {
    const written = writtenPlaylists(
      plan,
      result({ playlists: [pl("p1", "c1", "Dusk, renamed")] }),
    );
    expect([...written]).toEqual([["c1", "p1"]]);
  });

  // A category added in another tab after this page loaded: not this run's row.
  it("ignores playlists the page never listed", () => {
    const written = writtenPlaylists(
      plan,
      result({ playlists: [pl("p9", "c9", "Elsewhere"), pl("p3", "c3", "Haze")] }),
    );
    expect([...written]).toEqual([["c3", "p3"]]);
  });

  it("marks new rows only when the run mixed new and existing playlists", () => {
    const all = result({
      playlists: [pl("p1", "c1", "Dusk"), pl("p2", "c2", "Rain")],
    });
    expect(freshRows(plan, all).size).toBe(0);
    const mixed = result({
      playlists: [pl("p1", "c1", "Dusk", false), pl("p2", "c2", "Rain", true)],
    });
    expect([...freshRows(plan, mixed)]).toEqual(["c2"]);
  });
});
