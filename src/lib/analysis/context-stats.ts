import { trackPassesThreshold } from "@/src/lib/classification/threshold";
import { seededRandom } from "@/src/lib/labeling/rng";

export interface Match {
  category_id: string;
  score: number;
}
// track_id -> that run's top-5 matches. A missing key means not answered.
export type RunMatches = Record<string, Match[]>;

export const PLACEMENT_RULES = ["ge65", "top1", "top2"] as const;
export type PlacementRule = (typeof PLACEMENT_RULES)[number];

type RunId = "A1" | "A2" | "B" | "C" | "L";
type RunPair = readonly [RunId, RunId];
// The noise pair comes first; the rest are the cross-context pairs.
const MAIN_PAIRS: RunPair[] = [
  ["A1", "A2"],
  ["A1", "B"],
  ["A1", "C"],
  ["A2", "B"],
  ["A2", "C"],
  ["B", "C"],
];
// The Day-3 library run differs in neighbors AND line position (and day).
const LIBRARY_PAIRS: RunPair[] = [
  ["A1", "A2"],
  ["L", "A1"],
  ["L", "A2"],
  ["L", "B"],
  ["L", "C"],
];
const BOOTSTRAP_RESAMPLES = 2_000;

type N = number | null;
interface Contrast<T> {
  noise: T;
  neighbor: T;
  neighbor_excess: T;
}
interface Point {
  variance: {
    noise: N;
    cross: N;
    // cross - noise, unclamped: it can come out negative.
    neighbor: N;
    neighbor_share: N;
    // Share of (track, category) pairs in some run's top 5 but not all:
    // those pairs are censored out of the variance, which biases it.
    dropout_share: N;
  };
  flips: Record<
    PlacementRule,
    {
      flip_share: Contrast<N>;
      per_decision: Contrast<N>;
      tracks_changed: Contrast<N>;
    }
  >;
  jaccard: Contrast<N>;
}
export interface Est {
  value: N;
  // 95% percentile bootstrap over tracks; null when no resample is defined.
  lo: N;
  hi: N;
}
type Estimated<T> = T extends N ? Est : { [K in keyof T]: Estimated<T[K]> };
export type ContrastStats = {
  tracks: number;
  pairs: number;
} & Estimated<Point>;

interface Coverage {
  answered: number;
  missing: number;
}
export interface ContextStats {
  tracks: number;
  categories: number;
  coverage: Record<"A1" | "A2" | "B" | "C", Coverage> & { L?: Coverage };
  main: ContrastStats;
  library: ContrastStats | null;
}

export function placement(rule: PlacementRule, matches: Match[]): string[] {
  if (rule === "ge65") {
    return trackPassesThreshold(
      { matches, classified_at: new Date(0).toISOString(), override: null },
      65,
    );
  }
  return [...matches]
    .sort((a, b) => b.score - a.score)
    .slice(0, rule === "top1" ? 1 : 2)
    .map((m) => m.category_id);
}

// One track's contribution to every ratio of sums; arrays follow the pairs.
interface TrackTerms {
  pairs: number;
  union: number;
  noiseSq: number;
  crossSq: number;
  flips: Record<
    PlacementRule,
    { delta: number[]; union: number[]; changed: number[] }
  >;
  jaccard: number[];
}

function setStats(a: Set<string>, b: Set<string>) {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return { delta: a.size + b.size - 2 * both, union: a.size + b.size - both };
}

function trackTerms(byRun: Map<RunId, Match[]>, pairs: RunPair[]): TrackTerms {
  const scores = new Map(
    [...byRun].map(([run, ms]) => [
      run,
      new Map(ms.map((m) => [m.category_id, m.score])),
    ]),
  );
  const maps = [...scores.values()];
  const union = new Set(maps.flatMap((s) => [...s.keys()]));
  const inAll = [...union].filter((c) => maps.every((s) => s.has(c)));
  const halfSq = ([a, b]: RunPair, c: string) =>
    (scores.get(a)!.get(c)! - scores.get(b)!.get(c)!) ** 2 / 2;
  const cross = pairs.slice(1);

  const flips = Object.fromEntries(
    PLACEMENT_RULES.map((rule) => {
      const placed = new Map(
        [...byRun].map(([run, ms]) => [run, new Set(placement(rule, ms))]),
      );
      const per = pairs.map(([a, b]) =>
        setStats(placed.get(a)!, placed.get(b)!),
      );
      return [
        rule,
        {
          delta: per.map((p) => p.delta),
          union: per.map((p) => p.union),
          changed: per.map((p) => (p.delta > 0 ? 1 : 0)),
        },
      ];
    }),
  ) as TrackTerms["flips"];

  return {
    pairs: inAll.length,
    union: union.size,
    noiseSq: inAll.reduce((s, c) => s + halfSq(pairs[0]!, c), 0),
    crossSq: inAll.reduce(
      (s, c) => s + cross.reduce((t, p) => t + halfSq(p, c), 0) / cross.length,
      0,
    ),
    flips,
    jaccard: pairs.map(([a, b]) => {
      const { delta, union: u } = setStats(
        new Set(scores.get(a)!.keys()),
        new Set(scores.get(b)!.keys()),
      );
      return u === 0 ? 1 : (u - delta) / u;
    }),
  };
}

const ratio = (a: N, b: N): N =>
  a === null || b === null || b === 0 ? null : a / b;
const minus = (a: N, b: N): N => (a === null || b === null ? null : a - b);
const meanOf = (xs: N[]): N =>
  xs.length === 0 || xs.some((x) => x === null)
    ? null
    : (xs as number[]).reduce((s, x) => s + x, 0) / xs.length;

// Every statistic is a ratio of weighted per-track sums, so a bootstrap
// resample is just a different weight vector (copies of each track).
function aggregate(
  terms: TrackTerms[],
  w: number[],
  categories: number,
  runPairs: number,
): Point {
  const sum = (f: (t: TrackTerms) => number) =>
    terms.reduce((s, t, i) => (w[i] ? s + w[i]! * f(t) : s), 0);
  const tracks = sum(() => 1);
  const pairCount = sum((t) => t.pairs);
  const unionCount = sum((t) => t.union);
  const noise = ratio(
    sum((t) => t.noiseSq),
    pairCount,
  );
  const cross = ratio(
    sum((t) => t.crossSq),
    pairCount,
  );
  const neighbor = minus(cross, noise);

  // Neighbor = the mean of the per-pair values over the cross-context pairs.
  const contrast = (perPair: (k: number) => N): Contrast<N> => {
    const noiseValue = perPair(0);
    const neighborValue = meanOf(
      Array.from({ length: runPairs - 1 }, (_, i) =>
        perPair(i + 1),
      ),
    );
    return {
      noise: noiseValue,
      neighbor: neighborValue,
      neighbor_excess: minus(neighborValue, noiseValue),
    };
  };

  const flips = Object.fromEntries(
    PLACEMENT_RULES.map((rule) => {
      const delta = (k: number) => sum((t) => t.flips[rule].delta[k]!);
      return [
        rule,
        {
          flip_share: contrast((k) =>
            ratio(
              delta(k),
              sum((t) => t.flips[rule].union[k]!),
            ),
          ),
          per_decision: contrast((k) => ratio(delta(k), tracks * categories)),
          tracks_changed: contrast((k) =>
            ratio(
              sum((t) => t.flips[rule].changed[k]!),
              tracks,
            ),
          ),
        },
      ];
    }),
  ) as Point["flips"];

  return {
    variance: {
      noise,
      cross,
      neighbor,
      neighbor_share: ratio(neighbor, cross),
      dropout_share: ratio(unionCount - pairCount, unionCount),
    },
    flips,
    jaccard: contrast((k) =>
      ratio(
        sum((t) => t.jaccard[k]!),
        tracks,
      ),
    ),
  };
}

function quantile(sorted: number[], q: number): number {
  const h = (sorted.length - 1) * q;
  const i = Math.floor(h);
  const next = sorted[Math.min(i + 1, sorted.length - 1)]!;
  return sorted[i]! + (h - i) * (next - sorted[i]!);
}

// Resamples where a ratio is undefined (zero denominator) are left out.
function withIntervals(point: unknown, samples: unknown[]): unknown {
  if (point === null || typeof point === "number") {
    const xs = samples
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      .sort((a, b) => a - b);
    return {
      value: point,
      lo: xs.length > 0 ? quantile(xs, 0.025) : null,
      hi: xs.length > 0 ? quantile(xs, 0.975) : null,
    };
  }
  const obj = point as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(obj).map((key) => [
      key,
      withIntervals(
        obj[key],
        samples.map((s) => (s as Record<string, unknown>)[key]),
      ),
    ]),
  );
}

function contrastStats(opts: {
  runs: Partial<Record<RunId, RunMatches>>;
  pairs: RunPair[];
  trackIds: string[];
  categories: number;
  rand: () => number;
  resamples: number;
}): ContrastStats {
  const involved = [...new Set(opts.pairs.flat())];
  const terms = opts.trackIds.flatMap((t) => {
    const byRun = new Map<RunId, Match[]>();
    for (const run of involved) {
      const ms = opts.runs[run]?.[t];
      if (!ms) return [];
      byRun.set(run, ms);
    }
    return [trackTerms(byRun, opts.pairs)];
  });
  const n = terms.length;
  const point = aggregate(
    terms,
    terms.map(() => 1),
    opts.categories,
    opts.pairs.length,
  );
  const samples: Point[] = [];
  for (let r = 0; n > 0 && r < opts.resamples; r++) {
    const w = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) w[Math.floor(opts.rand() * n)]!++;
    samples.push(aggregate(terms, w, opts.categories, opts.pairs.length));
  }
  return {
    tracks: n,
    pairs: terms.reduce((s, t) => s + t.pairs, 0),
    ...(withIntervals(point, samples) as Estimated<Point>),
  };
}

export function contextStats(input: {
  trackIds: string[];
  categories: number;
  runs: Record<"A1" | "A2" | "B" | "C", RunMatches> & { L?: RunMatches };
  seed: string;
  resamples?: number;
}): ContextStats {
  const resamples = input.resamples ?? BOOTSTRAP_RESAMPLES;
  const coverageOf = (run: RunMatches): Coverage => {
    const answered = input.trackIds.filter((t) => run[t] !== undefined).length;
    return { answered, missing: input.trackIds.length - answered };
  };
  const { L } = input.runs;
  return {
    tracks: input.trackIds.length,
    categories: input.categories,
    coverage: {
      A1: coverageOf(input.runs.A1),
      A2: coverageOf(input.runs.A2),
      B: coverageOf(input.runs.B),
      C: coverageOf(input.runs.C),
      ...(L ? { L: coverageOf(L) } : {}),
    },
    main: contrastStats({
      runs: input.runs,
      pairs: MAIN_PAIRS,
      trackIds: input.trackIds,
      categories: input.categories,
      rand: seededRandom(`${input.seed}:main`),
      resamples,
    }),
    library: L
      ? contrastStats({
          runs: input.runs,
          pairs: LIBRARY_PAIRS,
          trackIds: input.trackIds,
          categories: input.categories,
          rand: seededRandom(`${input.seed}:library`),
          resamples,
        })
      : null,
  };
}
