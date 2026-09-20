import { seededRandom, shuffled } from "./rng";
import {
  LabelSampleSchema,
  PAIRS_PER_BIN,
  PAIR_BINS,
  RANDOM_TRACKS,
  RELABEL_TRACKS,
  GoldSampleSchema,
  SampleDesignSchema,
  type GoldSample,
  type LabelSample,
  type PairBinId,
  type SampleDesign,
} from "./schema";

export interface DrawSampleInput {
  track_ids: readonly string[];
  category_ids: readonly string[];
  assignments: Readonly<
    Record<
      string,
      { matches: ReadonlyArray<{ category_id: string; score: number }> }
    >
  >;
  seed: string;
  created_at: string;
  assignments_sha256: string;
}

type Pair = { track_id: string; category_id: string };

// Code-unit order, not localeCompare: the draw must not depend on the locale.
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byPair = (a: Pair, b: Pair) =>
  byCodeUnit(a.track_id, b.track_id) ||
  byCodeUnit(a.category_id, b.category_id);

function scoreBin(score: number): PairBinId {
  const bin = PAIR_BINS.find(
    (b) => b.lo !== null && b.hi !== null && score >= b.lo && score < b.hi,
  );
  if (!bin) throw new Error(`score ${score} falls in no pair bin`);
  return bin.id;
}

function checkInput(
  tracks: string[],
  categories: Set<string>,
  input: DrawSampleInput,
) {
  if (tracks.length < RANDOM_TRACKS) {
    throw new Error(
      `need at least ${RANDOM_TRACKS} tracks, got ${tracks.length}`,
    );
  }
  // Every track is either sampled (random set) or needs scores to be binned.
  const unassigned = tracks.filter((id) => !input.assignments[id]);
  if (unassigned.length > 0) {
    throw new Error(
      `${unassigned.length} tracks have no assignment (e.g. ${unassigned.slice(0, 3).join(", ")})`,
    );
  }
  for (const id of tracks) {
    const unknown = input.assignments[id]!.matches.find(
      (m) => !categories.has(m.category_id),
    );
    if (unknown) {
      throw new Error(
        `track ${id} matches unknown category ${unknown.category_id}`,
      );
    }
  }
}

// One seeded stream, consumed in this fixed order so the draw reproduces:
// 1. shuffle sorted tracks -> first RANDOM_TRACKS are the random set (drawn order)
// 2. shuffle the sorted random set -> first RELABEL_TRACKS are relabeled
// 3. per bin, in PAIR_BINS order: shuffle its sorted pairs, take PAIRS_PER_BIN
//    whose track is still unused (one pair per track overall)
// 4. shuffle the sorted drawn pairs, then number them p001.. so neither the
//    position nor the id reveals the bin.
export function drawSample(input: DrawSampleInput): {
  sample: LabelSample;
  design: SampleDesign;
} {
  const tracks = [...input.track_ids].sort(byCodeUnit);
  const categories = [...input.category_ids].sort(byCodeUnit);
  checkInput(tracks, new Set(categories), input);
  const rand = seededRandom(input.seed);

  const random = shuffled(tracks, rand).slice(0, RANDOM_TRACKS);
  const relabel = shuffled([...random].sort(byCodeUnit), rand).slice(
    0,
    RELABEL_TRACKS,
  );

  const inRandom = new Set(random);
  const population = new Map<PairBinId, Pair[]>(
    PAIR_BINS.map((b) => [b.id, []]),
  );
  for (const track_id of tracks) {
    if (inRandom.has(track_id)) continue;
    const scores = new Map(
      input.assignments[track_id]!.matches.map((m) => [m.category_id, m.score]),
    );
    for (const category_id of categories) {
      const score = scores.get(category_id);
      const bin = score === undefined ? "not_top5" : scoreBin(score);
      population.get(bin)!.push({ track_id, category_id });
    }
  }

  const used = new Set<string>();
  const drawn: Array<Pair & { bin_id: PairBinId; inclusion_prob: number }> = [];
  const bins: SampleDesign["bins"] = [];
  for (const { id } of PAIR_BINS) {
    const pairs = [...population.get(id)!].sort(byPair);
    const picked: Pair[] = [];
    for (const p of shuffled(pairs, rand)) {
      if (picked.length === PAIRS_PER_BIN) break;
      if (used.has(p.track_id)) continue;
      used.add(p.track_id);
      picked.push(p);
    }
    if (picked.length < PAIRS_PER_BIN) {
      throw new Error(
        `pair bin ${id} filled ${picked.length}/${PAIRS_PER_BIN} (${pairs.length} pairs in population)`,
      );
    }
    // Approximate: the one-pair-per-track rule makes true odds depend on earlier bins.
    const inclusion_prob = picked.length / pairs.length;
    drawn.push(...picked.map((p) => ({ ...p, bin_id: id, inclusion_prob })));
    bins.push({ id, population_pairs: pairs.length, sampled: picked.length });
  }

  const ordered = shuffled([...drawn].sort(byPair), rand).map((p, i) => ({
    ...p,
    pair_id: `p${String(i + 1).padStart(3, "0")}`,
  }));

  const sample = LabelSampleSchema.parse({
    seed: input.seed,
    created_at: input.created_at,
    random_track_ids: random,
    pairs: ordered.map(({ pair_id, track_id, category_id }) => ({
      pair_id,
      track_id,
      category_id,
    })),
    relabel_track_ids: relabel,
  });
  const design = SampleDesignSchema.parse({
    seed: input.seed,
    created_at: input.created_at,
    assignments_sha256: input.assignments_sha256,
    population: { tracks: tracks.length, categories: categories.length },
    bins,
    pairs: ordered.map(({ pair_id, bin_id, inclusion_prob }) => ({
      pair_id,
      bin_id,
      inclusion_prob,
    })),
  });
  return { sample, design };
}

export interface DrawGoldSampleInput {
  // Every track whose artist carries no genre tags.
  no_genre_ids: readonly string[];
  // Tracks already in the first sample: they get labeled there, not redrawn.
  already_sampled: ReadonlySet<string>;
  count: number;
  seed: string;
  created_at: string;
}

// A plain uniform draw: no score enters it, so there is nothing to reweight
// and no design file. Sorted first, so the result doesn't depend on input order.
export function drawGoldSample(input: DrawGoldSampleInput): GoldSample {
  const pool = [...new Set(input.no_genre_ids)].sort(byCodeUnit);
  const eligible = pool.filter((id) => !input.already_sampled.has(id));
  if (eligible.length < input.count) {
    throw new Error(
      `need ${input.count} eligible no-genre tracks, got ${eligible.length}`,
    );
  }
  const rand = seededRandom(input.seed);
  return GoldSampleSchema.parse({
    seed: input.seed,
    created_at: input.created_at,
    pool: {
      no_genre: pool.length,
      already_sampled: pool.length - eligible.length,
      eligible: eligible.length,
    },
    track_ids: shuffled(eligible, rand).slice(0, input.count),
  });
}
