import { describe, expect, it } from "vitest";
import {
  FIT_STEPS,
  fitColumns,
  libraryStats,
} from "@/src/components/review/stats";

// The review bin's counts, its "Tracks at each fit" chart and "Mostly" all
// come from the saved classification. Aggregate only: nothing here names or
// ranks a song.

const AT = "2026-09-01T00:00:00.000Z";
const assignment = (
  matches: [string, number][],
  override: string | null = null,
) => ({
  matches: matches.map(([category_id, score]) => ({ category_id, score })),
  classified_at: AT,
  override: override ? { category_id: override, set_at: AT } : null,
});
const track = (artist_id: string) => ({
  artist_id,
  title: "x",
  first_seen: AT,
});

const CACHE = {
  config: { confidence_threshold: 65 },
  artists: {
    a1: { name: "iann dior", genres: [] },
    a2: { name: "Juice WRLD", genres: [] },
    a3: { name: "Feng", genres: [] },
  },
  tracks: {
    t1: track("a1"),
    t2: track("a1"),
    t3: track("a2"),
    t4: track("a3"),
    t5: track("a2"),
  },
  categories: {
    c1: { name: "Melodic Rap" },
    c2: { name: "Dream Pop" },
    c3: { name: "Stutter House" },
  },
  assignments: {
    t1: assignment([
      ["c1", 90],
      ["c2", 70],
    ]),
    t2: assignment([["c1", 80]]),
    // Below the fit everywhere: still counts in its top match.
    t3: assignment([
      ["c1", 50],
      ["c2", 40],
    ]),
    // The owner's move wins at every fit.
    t4: assignment([["c1", 99]], "c2"),
    t5: assignment([["c2", 72]]),
    // Gone from the library since: never counted.
    gone: assignment([["c1", 99]]),
    // A deleted category's placements aren't a category's count.
    t6: assignment([["zz", 99]]),
  },
};

describe("libraryStats", () => {
  it("counts each category at the saved fit by Apply's rule", () => {
    const { fit, byCategory } = libraryStats(CACHE);
    expect(fit).toBe(65);
    expect(byCategory.c1!.count).toBe(3);
    expect(byCategory.c2!.count).toBe(3);
    expect(byCategory.c3!.count).toBe(0);
    expect(Object.keys(byCategory)).toEqual(["c1", "c2", "c3"]);
  });

  it("gives every category one count per chart column, lowest fit first", () => {
    const c2 = libraryStats(CACHE).byCategory.c2!;
    expect(c2.byFit.map((b) => b.fit)).toEqual([...FIT_STEPS]);
    const at = (f: number) => c2.byFit.find((b) => b.fit === f)!.count;
    expect(at(40)).toBe(4); // t1, t3 (a second match), t4, t5
    expect(at(65)).toBe(c2.count);
    expect(at(75)).toBe(2); // t4 (moved), t5 (its top match)
    expect(at(95)).toBe(2);
  });

  it("names the artists with the most tracks at the fit, most first", () => {
    const { byCategory } = libraryStats(CACHE);
    expect(byCategory.c1!.artists).toEqual(["iann dior", "Juice WRLD"]);
    // A tie reads alphabetically, so the line never reshuffles on reload.
    expect(byCategory.c2!.artists).toEqual(["Feng", "iann dior", "Juice WRLD"]);
    expect(byCategory.c3!.artists).toEqual([]);
  });

  it("keeps the largest count for the bars' shared scale", () => {
    expect(libraryStats(CACHE).max).toBe(3);
  });
});

describe("fitColumns", () => {
  it("is the ruler's fives from 40 to 95", () => {
    expect(fitColumns(65)).toEqual([...FIT_STEPS]);
  });

  // A fit set between the fives still gets its own "yours" column.
  it("adds the owner's fit when it falls between the fives", () => {
    expect(fitColumns(62)).toEqual([
      40, 45, 50, 55, 60, 62, 65, 70, 75, 80, 85, 90, 95,
    ]);
  });
});
