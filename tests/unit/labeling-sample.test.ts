import { describe, it, expect } from "vitest";
import {
  drawGoldSample,
  drawSample,
  type DrawSampleInput,
} from "@/src/lib/labeling/sample";
import { seededRandom, shuffled } from "@/src/lib/labeling/rng";
import {
  LabelSampleSchema,
  PAIRS_PER_BIN,
  PAIR_BINS,
  GoldSampleSchema,
  RANDOM_TRACKS,
  RELABEL_TRACKS,
  SampleDesignSchema,
  type PairBinId,
} from "@/src/lib/labeling/schema";

type Scores = DrawSampleInput["assignments"];

const pad = (n: number, width: number) => String(n).padStart(width, "0");

// 400 tracks x 12 categories; each track scores 5 random categories in
// [lo, hi]. Inputs are passed unsorted to prove the sampler sorts them.
function fixture({
  tracks = 400,
  lo = 30,
  hi = 99,
  seed = "seed-1",
}: { tracks?: number; lo?: number; hi?: number; seed?: string } = {}) {
  const rand = seededRandom("fixture");
  const track_ids = Array.from({ length: tracks }, (_, i) => `t${pad(i, 4)}`);
  const category_ids = Array.from({ length: 12 }, (_, i) => `c${pad(i, 2)}`);
  const assignments: Scores = Object.fromEntries(
    track_ids.map((id) => [
      id,
      {
        matches: shuffled(category_ids, rand)
          .slice(0, 5)
          .map((category_id) => ({
            category_id,
            score: lo + Math.floor(rand() * (hi - lo + 1)),
          })),
      },
    ]),
  );
  return {
    track_ids: shuffled(track_ids, rand),
    category_ids: [...category_ids].reverse(),
    assignments,
    seed,
    created_at: "2026-09-19T12:00:00.000Z",
    assignments_sha256: "f".repeat(64),
  } satisfies DrawSampleInput;
}

// Recomputed here, independent of the sampler: hi is exclusive.
function trueBin(input: DrawSampleInput, track: string, category: string) {
  const m = input.assignments[track]!.matches.find(
    (x) => x.category_id === category,
  );
  if (!m) return "not_top5";
  const bin = PAIR_BINS.find(
    (b) => b.lo !== null && b.hi !== null && m.score >= b.lo && m.score < b.hi,
  );
  return bin!.id;
}

describe("drawSample", () => {
  const input = fixture();
  const { sample, design } = drawSample(input);

  it("returns a sample and design that parse with their schemas", () => {
    expect(LabelSampleSchema.parse(sample)).toEqual(sample);
    expect(SampleDesignSchema.parse(design)).toEqual(design);
    expect(sample.seed).toBe("seed-1");
    expect(design.created_at).toBe(input.created_at);
    expect(design.assignments_sha256).toBe(input.assignments_sha256);
    expect(design.population).toEqual({ tracks: 400, categories: 12 });
  });

  it("is deterministic and independent of input order", () => {
    expect(drawSample(input)).toEqual({ sample, design });
    const reordered = {
      ...input,
      track_ids: [...input.track_ids].reverse(),
      category_ids: [...input.category_ids].sort(),
    };
    expect(drawSample(reordered)).toEqual({ sample, design });
  });

  it("draws differently under a different seed", () => {
    const other = drawSample({ ...input, seed: "seed-2" }).sample;
    expect(other.random_track_ids).not.toEqual(sample.random_track_ids);
    expect(other.pairs).not.toEqual(sample.pairs);
  });

  it("consumes one stream: sorted tracks, then the sorted random set", () => {
    const rand = seededRandom(input.seed);
    const sorted = [...input.track_ids].sort();
    const random = shuffled(sorted, rand).slice(0, RANDOM_TRACKS);
    expect(sample.random_track_ids).toEqual(random);
    const relabel = shuffled([...random].sort(), rand).slice(0, RELABEL_TRACKS);
    expect(sample.relabel_track_ids).toEqual(relabel);
  });

  it("draws the configured counts", () => {
    expect(new Set(sample.random_track_ids).size).toBe(RANDOM_TRACKS);
    expect(new Set(sample.relabel_track_ids).size).toBe(RELABEL_TRACKS);
    expect(sample.pairs).toHaveLength(PAIR_BINS.length * PAIRS_PER_BIN);
    expect(design.bins.map((b) => b.id)).toEqual(PAIR_BINS.map((b) => b.id));
    for (const b of design.bins) expect(b.sampled).toBe(PAIRS_PER_BIN);
  });

  it("uses one pair per track, disjoint from the random set", () => {
    const pairTracks = sample.pairs.map((p) => p.track_id);
    expect(new Set(pairTracks).size).toBe(pairTracks.length);
    const random = new Set(sample.random_track_ids);
    expect(pairTracks.filter((t) => random.has(t))).toEqual([]);
  });

  it("relabels only tracks from the random set", () => {
    const random = new Set(sample.random_track_ids);
    expect(sample.relabel_track_ids.every((t) => random.has(t))).toBe(true);
  });

  it("records each pair's true bin in the design", () => {
    expect(design.pairs.map((p) => p.pair_id)).toEqual(
      sample.pairs.map((p) => p.pair_id),
    );
    sample.pairs.forEach((p, i) => {
      expect(design.pairs[i]!.bin_id).toBe(
        trueBin(input, p.track_id, p.category_id),
      );
    });
  });

  it("sets inclusion probability to sampled / population per bin", () => {
    const random = new Set(sample.random_track_ids);
    const population = new Map<PairBinId, number>();
    for (const t of input.track_ids.filter((id) => !random.has(id))) {
      for (const c of input.category_ids) {
        const bin = trueBin(input, t, c);
        population.set(bin, (population.get(bin) ?? 0) + 1);
      }
    }
    for (const b of design.bins) {
      expect(b.population_pairs).toBe(population.get(b.id) ?? 0);
    }
    const total = design.bins.reduce((s, b) => s + b.population_pairs, 0);
    expect(total).toBe((400 - RANDOM_TRACKS) * 12);
    for (const p of design.pairs) {
      expect(p.inclusion_prob).toBeCloseTo(
        PAIRS_PER_BIN / population.get(p.bin_id)!,
        12,
      );
    }
  });

  it("emits pairs shuffled across bins, with ids that follow that order", () => {
    expect(sample.pairs.map((p) => p.pair_id)).toEqual(
      sample.pairs.map((_, i) => `p${pad(i + 1, 3)}`),
    );
    // Grouped by bin there would be exactly 7 bin changes; shuffled, ~175.
    const bins = design.pairs.map((p) => p.bin_id);
    const changes = bins.filter((b, i) => i > 0 && b !== bins[i - 1]).length;
    expect(changes).toBeGreaterThan(100);
  });

  it("serves no score, rank or bin in the sample", () => {
    const json = JSON.stringify(sample);
    expect(json).not.toMatch(
      /"(score|rank|bin|bin_id|matches|inclusion_prob)"/,
    );
  });

  it("throws when a bin cannot fill with distinct tracks", () => {
    // Scores stop at 84, so the 85plus bin is empty.
    expect(() => drawSample(fixture({ hi: 84 }))).toThrow(/85plus/);
  });

  it("throws when a track has no assignment", () => {
    const assignments = Object.fromEntries(
      Object.entries(input.assignments).filter(([id]) => id !== "t0007"),
    );
    expect(() => drawSample({ ...input, assignments })).toThrow(
      /no assignment/,
    );
  });

  it("throws when a match names an unknown category", () => {
    const assignments = {
      ...input.assignments,
      t0003: { matches: [{ category_id: "gone", score: 70 }] },
    };
    expect(() => drawSample({ ...input, assignments })).toThrow(/gone/);
  });

  it("throws when there are too few tracks for the random set", () => {
    expect(() => drawSample(fixture({ tracks: RANDOM_TRACKS - 1 }))).toThrow(
      /tracks/,
    );
  });
});

describe("drawGoldSample", () => {
  const ids = Array.from(
    { length: 500 },
    (_, i) => `g${String(i).padStart(4, "0")}`,
  );
  const noGenre = ids.slice(0, 300);
  const already = new Set(noGenre.slice(0, 40));
  const input = {
    no_genre_ids: noGenre,
    already_sampled: already,
    count: 100,
    seed: "gold-seed",
    created_at: "2026-09-19T12:00:00.000Z",
  };

  it("draws the asked-for count only from eligible no-genre tracks", () => {
    const g = drawGoldSample(input);
    expect(g.track_ids).toHaveLength(100);
    expect(new Set(g.track_ids).size).toBe(100);
    for (const id of g.track_ids) {
      expect(noGenre).toContain(id);
      expect(already.has(id)).toBe(false);
    }
    expect(g.pool).toEqual({
      no_genre: 300,
      already_sampled: 40,
      eligible: 260,
    });
    expect(GoldSampleSchema.parse(g)).toEqual(g);
  });

  it("is deterministic in the seed and independent of input order", () => {
    const a = drawGoldSample(input);
    const b = drawGoldSample({
      ...input,
      no_genre_ids: [...noGenre].reverse(),
    });
    const other = drawGoldSample({ ...input, seed: "another" });
    expect(b.track_ids).toEqual(a.track_ids);
    expect(other.track_ids).not.toEqual(a.track_ids);
  });

  it("throws when the eligible pool is too small", () => {
    expect(() => drawGoldSample({ ...input, count: 261 })).toThrow(/eligible/);
  });
});
