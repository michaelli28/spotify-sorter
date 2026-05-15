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
  phase: "propose" | "classify";
}

const TOKENS_PER_TRACK_LINE = 30;
const PROPOSE_OUTPUT_TOKENS = 4_000;
const CLASSIFY_OUTPUT_TOKENS_PER_TRACK = 25;

export function estimateCostUSD(opts: EstimateOpts): number {
  if (opts.phase === "propose") {
    return costFromUsage({
      input_tokens: opts.tracks * TOKENS_PER_TRACK_LINE + 1_500,
      output_tokens: PROPOSE_OUTPUT_TOKENS,
    });
  }
  const batches = Math.ceil(opts.tracks / 50);
  const systemPromptTokens = 1_500 + opts.categories * 60;
  return costFromUsage({
    input_tokens: batches * (50 * TOKENS_PER_TRACK_LINE),
    output_tokens: opts.tracks * CLASSIFY_OUTPUT_TOKENS_PER_TRACK,
    cache_read_input_tokens: (batches - 1) * systemPromptTokens,
    cache_creation_input_tokens: systemPromptTokens,
  });
}
