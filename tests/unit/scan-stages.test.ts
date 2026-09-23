import { describe, expect, it } from "vitest";
import { stageRows, type StageId } from "@/src/components/scan/stages";

const ALL: StageId[] = ["playlists", "liked", "artists"];
const states = (rows: ReturnType<typeof stageRows>) =>
  rows.map((r) => `${r.id}:${r.state}`);

// runScan reports: playlists 0/(N+1) once, then playlists k/N per playlist,
// liked 1/1 only after Liked Songs is read, artists 0/M and M/M only when the
// scan found tracks it had not seen.
describe("stageRows", () => {
  it("starts on the first source before any word from the server", () => {
    expect(
      states(stageRows({ visible: ALL, last: null, finished: false })),
    ).toEqual(["playlists:active", "liked:pending", "artists:pending"]);
  });

  it("counts only once a playlist has actually been read", () => {
    const opening = stageRows({
      visible: ALL,
      last: { stage: "playlists", current: 0, total: 106 },
      finished: false,
    });
    expect(opening[0]).toMatchObject({ state: "active", count: null });

    const reading = stageRows({
      visible: ALL,
      last: { stage: "playlists", current: 38, total: 105 },
      finished: false,
    });
    expect(reading[0]).toMatchObject({
      state: "active",
      count: { current: 38, total: 105 },
    });
  });

  // Liked Songs sends nothing until it is finished, so it is known to be
  // running once the playlists are done.
  it("moves to Liked Songs when the last playlist is in", () => {
    const rows = stageRows({
      visible: ALL,
      last: { stage: "playlists", current: 105, total: 105 },
      finished: false,
    });
    expect(states(rows)).toEqual([
      "playlists:done",
      "liked:active",
      "artists:pending",
    ]);
    expect(rows.every((r) => r.count === null)).toBe(true);
  });

  // Artist genres only runs when there are new tracks: never assume it.
  it("does not claim artist genres are being read before they are", () => {
    expect(
      states(
        stageRows({
          visible: ALL,
          last: { stage: "liked", current: 1, total: 1 },
          finished: false,
        }),
      ),
    ).toEqual(["playlists:done", "liked:done", "artists:pending"]);
    expect(
      states(
        stageRows({
          visible: ["playlists", "artists"],
          last: { stage: "playlists", current: 105, total: 105 },
          finished: false,
        }),
      ),
    ).toEqual(["playlists:done", "artists:pending"]);
  });

  it("shows artist genres as active, uncounted until the server counts", () => {
    const rows = stageRows({
      visible: ALL,
      last: { stage: "artists", current: 0, total: 1476 },
      finished: false,
    });
    expect(states(rows)).toEqual([
      "playlists:done",
      "liked:done",
      "artists:active",
    ]);
    expect(rows[2]!.count).toBeNull();
  });

  it("marks artist genres skipped when the scan finished without them", () => {
    expect(
      states(
        stageRows({
          visible: ALL,
          last: { stage: "liked", current: 1, total: 1 },
          finished: true,
        }),
      ),
    ).toEqual(["playlists:done", "liked:done", "artists:skipped"]);
    expect(
      states(stageRows({ visible: ALL, last: null, finished: true })),
    ).toEqual(["playlists:done", "liked:done", "artists:skipped"]);
  });

  it("marks every stage done when the scan finished after artist genres", () => {
    expect(
      states(
        stageRows({
          visible: ALL,
          last: { stage: "artists", current: 1476, total: 1476 },
          finished: true,
        }),
      ),
    ).toEqual(["playlists:done", "liked:done", "artists:done"]);
  });

  // A Liked-Songs-only scope still gets one playlists 0/1 event first.
  it("starts on Liked Songs when no playlist is in scope", () => {
    expect(
      states(
        stageRows({
          visible: ["liked", "artists"],
          last: { stage: "playlists", current: 0, total: 1 },
          finished: false,
        }),
      ),
    ).toEqual(["liked:active", "artists:pending"]);
  });
});
