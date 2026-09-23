import { describe, expect, it } from "vitest";
import {
  BUMPS_PER_TICK,
  filingScale,
  flushFiling,
  placedCounts,
  projectedScale,
  receiveCounts,
  settleFiling,
  startFiling,
  tabCount,
} from "@/src/components/classify/filing";
import {
  CRATE,
  crateLayout,
  tracksPerU,
} from "@/src/components/graphics/crate-geometry";

const AT = "2026-09-01T00:00:00.000Z";
const match = (category_id: string, score: number) => ({ category_id, score });
const assigned = (...matches: ReturnType<typeof match>[]) => ({
  matches,
  classified_at: AT,
  override: null,
});

describe("receiveCounts", () => {
  it("queues every category whose count changed, and prints nothing yet", () => {
    const f = receiveCounts(startFiling({ a: 1, b: 2, c: 3 }), {
      a: 4,
      b: 2,
      c: 9,
    });
    expect([...f.queue].sort()).toEqual(["a", "c"]);
    expect(f.shown).toEqual({ a: 1, b: 2, c: 3 });
    expect(f.target).toEqual({ a: 4, b: 2, c: 9 });
  });

  // A category the page doesn't draw has no tab to bump.
  it("ignores categories it wasn't started with", () => {
    const f = receiveCounts(startFiling({ a: 1 }), { a: 1, ghost: 7 });
    expect(f.queue).toEqual([]);
    expect(f.target).toEqual({ a: 1 });
  });

  it("keeps a queued category in its place when its count moves again", () => {
    const first = receiveCounts(startFiling({ a: 0, b: 0, c: 0, d: 0 }), {
      a: 1,
      b: 1,
      c: 1,
      d: 0,
    });
    const again = receiveCounts(first, { a: 5, b: 1, c: 1, d: 2 });
    expect(again.queue.slice(0, 3)).toEqual(first.queue);
    expect(again.queue.at(-1)).toBe("d");
    expect(again.target.a).toBe(5);
  });

  // The brief wants a filing rhythm across the crate, not a sweep front to
  // back: new bumps come in a scrambled, but repeatable, order.
  it("scrambles each report's bumps the same way every time", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const zero = Object.fromEntries(ids.map((id) => [id, 0]));
    const one = Object.fromEntries(ids.map((id) => [id, 1]));
    const a = receiveCounts(startFiling(zero), one);
    const b = receiveCounts(startFiling(zero), one);
    expect(a.queue).toEqual(b.queue);
    expect(a.queue).not.toEqual(ids);
    expect([...a.queue].sort()).toEqual([...ids].sort());
  });
});

describe("flushFiling", () => {
  it("prints at most a tick's worth of counts, each with one bump", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const f = receiveCounts(
      startFiling(Object.fromEntries(ids.map((id) => [id, 0]))),
      Object.fromEntries(ids.map((id) => [id, 3])),
    );
    const next = flushFiling(f, BUMPS_PER_TICK);
    const printed = f.queue.slice(0, BUMPS_PER_TICK);
    expect(next.queue).toEqual(f.queue.slice(BUMPS_PER_TICK));
    for (const id of printed) {
      expect(next.shown[id]).toBe(3);
      expect(next.bumps[id]).toBe(1);
    }
    for (const id of next.queue) {
      expect(next.shown[id]).toBe(0);
      expect(next.bumps[id] ?? 0).toBe(0);
    }
  });

  // 250ms × 3 = the brief's cap of 12 bumps a second across the crate.
  it("caps a tick at three bumps", () => {
    expect(BUMPS_PER_TICK).toBe(3);
  });

  it("prints the latest count, not the one that queued it", () => {
    const f = receiveCounts(receiveCounts(startFiling({ a: 0 }), { a: 2 }), {
      a: 7,
    });
    expect(flushFiling(f, 3).shown.a).toBe(7);
  });

  it("returns the same object when nothing is waiting", () => {
    const f = startFiling({ a: 1 });
    expect(flushFiling(f, 3)).toBe(f);
  });
});

describe("settleFiling", () => {
  // Reduced motion: counts update in place, nothing bumps.
  it("prints every count at once without a bump", () => {
    const f = settleFiling(
      receiveCounts(startFiling({ a: 0, b: 0 }), { a: 4, b: 1 }),
    );
    expect(f.shown).toEqual({ a: 4, b: 1 });
    expect(f.queue).toEqual([]);
    expect(f.bumps).toEqual({});
  });
});

describe("placedCounts", () => {
  // The same rule /api/status uses, so the first report after a batch only
  // moves what the batch changed.
  it("counts each category at the cutoff, only tracks still in the library", () => {
    const counts = placedCounts(
      {
        categories: { a: {}, b: {}, c: {} },
        tracks: { t1: {}, t2: {} },
        assignments: {
          t1: assigned(match("a", 90), match("b", 70)),
          t2: assigned(match("b", 40)),
          gone: assigned(match("a", 99)),
        },
      },
      65,
    );
    expect(counts).toEqual({ a: 1, b: 2, c: 0 });
  });
});

describe("projectedScale", () => {
  const room = CRATE.FRONT_TOP - CRATE.BACK_TOP - (41 - 1) * CRATE.DIVIDER;

  // A re-run with most of the library sorted: the crate is drawn at the
  // scale it will have when the run ends, so the stacks grow into it.
  it("projects the run's end from how many playlists a sorted track lands in", () => {
    const counts = Array.from({ length: 41 }, () => 100); // 4,100 placed
    const perU = projectedScale(counts, { sorted: 1000, unsorted: 500 });
    // 4.1 placements per track → 4,100 + 500 × 4.1 = 6,150 at the end.
    expect(perU).toBeCloseTo((6150 * 40) / 41 / room, 6);
    expect(perU).toBeGreaterThan(tracksPerU(counts));
  });

  it("guesses three playlists a track on a first run", () => {
    const counts = Array.from({ length: 41 }, () => 0);
    expect(projectedScale(counts, { sorted: 0, unsorted: 410 })).toBeCloseTo(
      (410 * 3 * 40) / 41 / room,
      6,
    );
  });

  it("draws no stacks when nothing is placed or coming", () => {
    expect(projectedScale([0, 0], { sorted: 0, unsorted: 0 })).toBe(0);
    expect(projectedScale([], { sorted: 0, unsorted: 10 })).toBe(0);
  });
});

describe("filingScale", () => {
  const backStackTop = (counts: number[], perU: number) =>
    crateLayout(
      counts.map((count) => ({ count })),
      { perU },
    ).at(-1)!.stack.y;

  // A first run starts in catalogue order, so the back divider can be one of
  // the largest; tracksPerU leaves its records out and they rose over the rail.
  it("keeps the back divider's records under the back rail", () => {
    const counts = [...Array.from({ length: 40 }, () => 280), 840];
    const perU = filingScale(counts, 0);
    expect(perU).toBeGreaterThan(tracksPerU(counts));
    expect(backStackTop(counts, perU)).toBeGreaterThanOrEqual(
      CRATE.BACK_Y - 1e-9,
    );
  });

  // Largest first, the back divider is the smallest: nothing changes.
  it("is the fill scale when the back divider is small", () => {
    const counts = [...Array.from({ length: 40 }, () => 280), 14];
    expect(filingScale(counts, 0)).toBe(tracksPerU(counts));
  });

  it("holds the run's projection while the counts fit under it", () => {
    const counts = Array.from({ length: 41 }, () => 10);
    expect(filingScale(counts, 99)).toBe(99);
  });

  it("draws no stacks when nothing is placed", () => {
    expect(filingScale([0, 0, 0], 0)).toBe(0);
    expect(filingScale([], 0)).toBe(0);
  });
});

describe("tabCount", () => {
  // The narrowest crate tab (a 320px phone, the back divider) holds five
  // characters and no catalogue number.
  it("prints the count in full up to five characters", () => {
    expect(tabCount(0)).toBe("0");
    expect(tabCount(999)).toBe("999");
    expect(tabCount(1442)).toBe("1,442");
    expect(tabCount(9999)).toBe("9,999");
  });

  it("shortens five digits to thousands", () => {
    expect(tabCount(12192)).toBe("12k");
    expect(tabCount(10000)).toBe("10k");
  });
});
