export const HAIKU_PRICING = {
  input_per_mtok: 1.0,
  output_per_mtok: 5.0,
  cache_read_multiplier: 0.1,
  cache_write_multiplier: 1.25,
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function costFromUsage(u: Usage): number {
  const inputCost = (u.input_tokens / 1e6) * HAIKU_PRICING.input_per_mtok;
  const outputCost = (u.output_tokens / 1e6) * HAIKU_PRICING.output_per_mtok;
  const readCost =
    ((u.cache_read_input_tokens ?? 0) / 1e6) *
    HAIKU_PRICING.input_per_mtok *
    HAIKU_PRICING.cache_read_multiplier;
  const writeCost =
    ((u.cache_creation_input_tokens ?? 0) / 1e6) *
    HAIKU_PRICING.input_per_mtok *
    HAIKU_PRICING.cache_write_multiplier;
  return inputCost + outputCost + readCost + writeCost;
}

interface EstimateOpts {
  tracks: number;
  categories: number;
  phase: "propose";
}

const TOKENS_PER_TRACK_LINE = 30;
const PROPOSE_OUTPUT_TOKENS = 4_000;

export function estimateCostUSD(opts: EstimateOpts): number {
  return costFromUsage({
    input_tokens: opts.tracks * TOKENS_PER_TRACK_LINE + 1_500,
    output_tokens: PROPOSE_OUTPUT_TOKENS,
  });
}

// Min and max per-track cost across the 57 full 50-track batches of the
// 2026-09-18 re-classify (41 categories, temperature 0; $1.675 for 2,875
// tracks). Check against the next real run before trusting the range.
export const CLASSIFY_USD_PER_TRACK = { low: 0.000551, high: 0.000635 };

// Measured, not modelled: the old estimate assumed 25 output tokens per track
// and cached prompts (real: ~186 and never cached), and came out 6x low.
export function estimateClassifyCost(tracks: number): {
  low: number;
  high: number;
} {
  return {
    low: tracks * CLASSIFY_USD_PER_TRACK.low,
    high: tracks * CLASSIFY_USD_PER_TRACK.high,
  };
}
