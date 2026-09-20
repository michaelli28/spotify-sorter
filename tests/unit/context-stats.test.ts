import { describe, it, expect } from "vitest";
import {
  contextStats,
  placement,
  type RunMatches,
} from "@/src/lib/analysis/context-stats";
import { trackPassesThreshold } from "@/src/lib/classification/threshold";
import { seededRandom } from "@/src/lib/labeling/rng";

const m = (...pairs: Array<[string, number]>) =>
  pairs.map(([category_id, score]) => ({ category_id, score }));

// Hand-computed below. 4 categories; t2's c4 drops out of B and c1 enters it.
const A1: RunMatches = {
  t1: m(["c1", 80], ["c2", 60]),
  t2: m(["c3", 90], ["c4", 50]),
};
const A2: RunMatches = {
  t1: m(["c1", 78], ["c2", 60]),
  t2: m(["c3", 90], ["c4", 50]),
};
const B: RunMatches = {
  t1: m(["c1", 70], ["c2", 66]),
  t2: m(["c3", 90], ["c1", 64]),
};
const C: RunMatches = {
  t1: m(["c1", 76], ["c2", 60]),
  t2: m(["c3", 88], ["c4", 52]),
};
const base = { trackIds: ["t1", "t2"], categories: 4, seed: "boot" };

describe("top1_in_top3 when the top pick moves out of the other run's top 3", () => {
  const steady: RunMatches = {
    t9: m(["c1", 90], ["c2", 80], ["c3", 70], ["c4", 60]),
  };
  const moved: RunMatches = {
    t9: m(["c4", 90], ["c5", 80], ["c6", 70], ["c1", 10]),
  };
  const s = contextStats({
    trackIds: ["t9"],
    categories: 6,
    seed: "boot",
    runs: { A1: steady, A2: steady, B: moved, C: steady },
  });

  it("scores each direction and averages the cross pairs", () => {
    // A1 top1 c1 is not in moved's top 3 {c4,c5,c6}; moved's top1 c4 is not in
    // {c1,c2,c3}: both directions 0. Pairs A1B, A2B, BC are 0; A1C, A2C are 1.
    expect(s.main.top1_in_top3.noise.value).toBe(1);
    expect(s.main.top1_in_top3.neighbor.value).toBeCloseTo(0.4, 12);
    expect(s.main.top1_in_top3.neighbor_excess.value).toBeCloseTo(-0.6, 12);
  });
});

describe("contextStats on a hand-computed 2-track fixture", () => {
  const s = contextStats({ ...base, runs: { A1, A2, B, C } });

  it("decomposes score variance over pairs in all four top 5s", () => {
    // Pairs: (t1,c1) (t1,c2) (t2,c3). Noise: (80-78)^2/2 = 2 -> 2/3.
    // Cross means over A1B A1C A2B A2C BC: 22, 10.8, 1.2 -> 34/3.
    expect(s.main.pairs).toBe(3);
    expect(s.main.variance.noise.value).toBeCloseTo(2 / 3, 12);
    expect(s.main.variance.cross.value).toBeCloseTo(34 / 3, 12);
    expect(s.main.variance.neighbor.value).toBeCloseTo(32 / 3, 12);
    expect(s.main.variance.neighbor_share.value).toBeCloseTo(16 / 17, 12);
    // Union 5 pairs (t1: 2, t2: c3 c4 c1), 2 not in every run.
    expect(s.main.variance.dropout_share.value).toBeCloseTo(0.4, 12);
  });

  it("counts ge65 placement flips per run pair and averages the cross pairs", () => {
    // t1 ge65: A1 {c1}, A2 {c1}, B {c1,c2}, C {c1}. t2: {c3} everywhere.
    // A1B, A2B, BC: 1 flip over 3 placements; A1C, A2C: 0 -> mean 1/5.
    const f = s.main.flips.ge65;
    expect(f.flip_share.noise.value).toBe(0);
    expect(f.flip_share.neighbor.value).toBeCloseTo(0.2, 12);
    expect(f.flip_share.neighbor_excess.value).toBeCloseTo(0.2, 12);
    // 1 flip over 2 tracks x 4 categories in 3 of 5 pairs.
    expect(f.per_decision.neighbor.value).toBeCloseTo(3 / 40, 12);
    expect(f.tracks_changed.neighbor.value).toBeCloseTo(0.3, 12);
  });

  it("counts top1 and top2 flips", () => {
    expect(s.main.flips.top1.flip_share.neighbor.value).toBe(0);
    // t2 top2: {c3,c4} vs B's {c3,c1}: 2 flips over 2 + 3 placements.
    expect(s.main.flips.top2.flip_share.neighbor.value).toBeCloseTo(6 / 25, 12);
  });

  it("holds under the loose rule: the top pick stays inside the other run's top 3", () => {
    // Every track here has at most 2 matches, so each run's top 3 is its whole
    // top 5: the loose rule can never fail on this fixture.
    expect(s.main.top1_in_top3.noise.value).toBe(1);
    expect(s.main.top1_in_top3.neighbor.value).toBe(1);
    expect(s.main.top1_in_top3.neighbor_excess.value).toBe(0);
  });

  it("compares top-5 sets by Jaccard", () => {
    expect(s.main.jaccard.noise.value).toBe(1);
    // t1: 1; t2: mean(1/3, 1, 1/3, 1, 1/3) = 0.6.
    expect(s.main.jaccard.neighbor.value).toBeCloseTo(0.8, 12);
    expect(s.main.jaccard.neighbor_excess.value).toBeCloseTo(-0.2, 12);
  });

  it("reports coverage and no library comparison without an L run", () => {
    expect(s.coverage.A1).toEqual({ answered: 2, missing: 0 });
    expect(s.coverage.L).toBeUndefined();
    expect(s.main.tracks).toBe(2);
    expect(s.library).toBeNull();
  });
});

describe("contextStats", () => {
  it("finds zero variance and zero flips when all runs are identical", () => {
    const s = contextStats({ ...base, runs: { A1, A2: A1, B: A1, C: A1 } });
    expect(s.main.variance.noise.value).toBe(0);
    expect(s.main.variance.cross.value).toBe(0);
    expect(s.main.variance.neighbor.value).toBe(0);
    expect(s.main.variance.neighbor_share.value).toBeNull();
    expect(s.main.variance.dropout_share.value).toBe(0);
    for (const rule of ["ge65", "top1", "top2"] as const) {
      const f = s.main.flips[rule];
      expect(f.flip_share.noise.value).toBe(0);
      expect(f.flip_share.neighbor.value).toBe(0);
      expect(f.per_decision.neighbor.value).toBe(0);
      expect(f.tracks_changed.neighbor.value).toBe(0);
    }
    expect(s.main.jaccard.neighbor.value).toBe(1);
  });

  it("uses the app's ge65 rule, including its top-1 fallback", () => {
    // Nothing reaches 65, so each run falls back to its own top category.
    const low: RunMatches = { t1: m(["c1", 60], ["c2", 50]) };
    const flipped: RunMatches = { t1: m(["c2", 62], ["c1", 58]) };
    const s = contextStats({
      trackIds: ["t1"],
      categories: 4,
      seed: "boot",
      runs: { A1: low, A2: flipped, B: low, C: low },
    });
    expect(s.main.flips.ge65.flip_share.noise.value).toBe(1);
    expect(s.main.flips.ge65.tracks_changed.noise.value).toBe(1);
  });

  it("matches trackPassesThreshold(·, 65) placement for placement", () => {
    const rand = seededRandom("placements");
    for (let i = 0; i < 200; i++) {
      const matches = ["c1", "c2", "c3", "c4", "c5"]
        .slice(0, 1 + Math.floor(rand() * 5))
        .map((category_id) => ({
          category_id,
          score: Math.floor(rand() * 101),
        }));
      expect(placement("ge65", matches)).toEqual(
        trackPassesThreshold(
          {
            matches,
            classified_at: "2026-09-19T00:00:00.000Z",
            override: null,
          },
          65,
        ),
      );
    }
  });

  it("compares only tracks every run answered, and counts the rest as missing", () => {
    const { t2: _dropped, ...onlyT1 } = B;
    const s = contextStats({ ...base, runs: { A1, A2, B: onlyT1, C } });
    expect(s.coverage.B).toEqual({ answered: 1, missing: 1 });
    expect(s.main.tracks).toBe(1);
    expect(s.main.pairs).toBe(2);
  });

  it("reports the library run separately, against all four context runs", () => {
    const L: RunMatches = {
      t1: m(["c2", 90], ["c1", 50]),
      t2: m(["c3", 90], ["c4", 50]),
    };
    const s = contextStats({ ...base, runs: { A1, A2, B, C, L } });
    expect(s.coverage.L).toEqual({ answered: 2, missing: 0 });
    expect(s.library).not.toBeNull();
    // t1's top1 is c2 in L and c1 in every context run; t2 never flips.
    expect(s.library!.flips.top1.flip_share.neighbor.value).toBeCloseTo(
      2 / 3,
      12,
    );
    expect(s.library!.flips.top1.flip_share.noise.value).toBe(0);
    expect(s.main.flips.top1.flip_share.neighbor.value).toBe(0);
  });

  describe("bootstrap intervals", () => {
    // 60 tracks with noisy scores so every interval has width.
    const trackIds = Array.from({ length: 60 }, (_, i) => `t${i}`);
    const cats = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"];
    const rand = seededRandom("fixture");
    const truth = Object.fromEntries(
      trackIds.map((t) => [t, cats.map(() => 40 + Math.floor(rand() * 50))]),
    );
    const run = (jitter: number): RunMatches =>
      Object.fromEntries(
        trackIds.map((t) => [
          t,
          cats
            .map((category_id, i) => ({
              category_id,
              score: Math.min(
                100,
                Math.max(
                  0,
                  truth[t]![i]! + Math.round((rand() - 0.5) * 2 * jitter),
                ),
              ),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5),
        ]),
      );
    const runs = { A1: run(3), A2: run(3), B: run(8), C: run(8) };
    const input = { trackIds, categories: cats.length, seed: "boot", runs };
    const s = contextStats(input);

    it("contains each point estimate", () => {
      const ests = [
        s.main.variance.noise,
        s.main.variance.cross,
        s.main.variance.neighbor,
        s.main.flips.ge65.flip_share.noise,
        s.main.flips.ge65.flip_share.neighbor,
        s.main.flips.ge65.flip_share.neighbor_excess,
        s.main.flips.top1.tracks_changed.neighbor,
        s.main.jaccard.neighbor_excess,
      ];
      for (const e of ests) {
        expect(e.lo).not.toBeNull();
        expect(e.lo!).toBeLessThanOrEqual(e.value!);
        expect(e.hi!).toBeGreaterThanOrEqual(e.value!);
        expect(e.hi!).toBeGreaterThan(e.lo!);
      }
    });

    it("pairs neighbor_excess within each resample", () => {
      // Subtracting the two intervals would give exactly the summed widths;
      // differencing inside each resample cancels the shared track draw.
      const f = s.main.flips.ge65.flip_share;
      const width = (e: { lo: number | null; hi: number | null }) =>
        e.hi! - e.lo!;
      expect(f.neighbor_excess.value).toBeCloseTo(
        f.neighbor.value! - f.noise.value!,
        12,
      );
      expect(width(f.neighbor_excess)).toBeLessThan(
        width(f.noise) + width(f.neighbor),
      );
    });

    it("is deterministic in the seed", () => {
      expect(contextStats(input)).toEqual(s);
      const other = contextStats({ ...input, seed: "other" });
      expect(other.main.variance.noise.value).toBe(s.main.variance.noise.value);
      expect(other.main.variance.noise.lo).not.toBe(s.main.variance.noise.lo);
    });
  });
});
