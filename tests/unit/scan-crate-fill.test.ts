import { describe, expect, it } from "vitest";
import {
  EMPTY_CRATE,
  crateAfter,
  crateFull,
  sourcesRead,
  type CrateFill,
} from "@/src/components/scan/crate-fill";
import type { StageEvent } from "@/src/components/scan/stages";

const run = (events: StageEvent[], from: CrateFill = EMPTY_CRATE) =>
  events.reduce(crateAfter, from);
const playlists = (current: number, total: number): StageEvent => ({
  stage: "playlists",
  current,
  total,
});

describe("crateAfter", () => {
  it("fills by playlists read ÷ playlists in scope", () => {
    const fill = run([playlists(0, 40), playlists(10, 40)]);
    expect(fill).toMatchObject({ done: 10, total: 40, level: 0.25 });
  });

  it("starts empty: the opening event reads nothing", () => {
    expect(run([playlists(0, 40)])).toMatchObject({ done: 0, level: 0 });
  });

  // The playlists total used to count Liked Songs on the first event only
  // (0 of 106, then 1 of 105). The fill must never drop a record for it.
  it("never goes backwards when the total drifts", () => {
    const levels: number[] = [];
    [playlists(0, 106), playlists(10, 105), playlists(11, 200)].reduce(
      (fill, e) => {
        const next = crateAfter(fill, e);
        levels.push(next.level);
        return next;
      },
      EMPTY_CRATE,
    );
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    // 11 of 200 would be emptier than 10 of 105: the crate holds its level.
    expect(levels.at(-1)).toBeCloseTo(10 / 105);
  });

  it("never un-reads a playlist on a late event", () => {
    const fill = run([playlists(12, 40), playlists(9, 40)]);
    expect(fill).toMatchObject({ done: 12, level: 0.3 });
  });

  it("never reads more playlists than there are", () => {
    const fill = run([playlists(41, 40)]);
    expect(fill.level).toBe(1);
    expect(fill.total).toBeGreaterThanOrEqual(fill.done);
  });

  it("counts Liked Songs as a source read, once, without filling", () => {
    const liked: StageEvent = { stage: "liked", current: 1, total: 1 };
    const fill = run([playlists(40, 40), liked, liked]);
    expect(sourcesRead(fill)).toBe(41);
    expect(fill.level).toBe(1);
    expect(sourcesRead(run([playlists(3, 40)]))).toBe(3);
  });

  // runScan reads every playlist before Liked Songs and artist genres.
  it("is full once a later stage reports: every playlist is read by then", () => {
    expect(
      run([playlists(0, 0), { stage: "liked", current: 1, total: 1 }]).level,
    ).toBe(1);
    expect(run([{ stage: "artists", current: 612, total: 1480 }]).level).toBe(
      1,
    );
  });

  it("leaves the crate alone while artist genres are read", () => {
    const before = run([playlists(40, 40)]);
    const after = run(
      [
        { stage: "artists", current: 0, total: 1476 },
        { stage: "artists", current: 1476, total: 1476 },
      ],
      before,
    );
    expect(after).toEqual(before);
  });
});

describe("crateFull", () => {
  // A Liked-Songs-only scope sends playlists 0 of 0: the crate is full once
  // the whole library is read.
  it("fills the crate when the scan is done", () => {
    expect(crateFull(run([playlists(0, 0)])).level).toBe(1);
    expect(crateFull(run([playlists(40, 40)]))).toMatchObject({
      done: 40,
      total: 40,
      level: 1,
    });
  });
});
