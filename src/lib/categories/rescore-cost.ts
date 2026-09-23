import { costFromUsage } from "@/src/lib/llm/cost";

// Modelled from src/lib/llm/reclassify.ts, not measured (no re-score run has
// been logged): one call per new category, every placed track as one prompt
// line (59 characters on average in the 2026-09 cache), output capped by that
// file's max_tokens.
const TOKENS_PER_LINE = { low: 20, high: 30 };
const PROMPT_OVERHEAD_TOKENS = 150;
const TOKENS_PER_SCORE = 20;
const MAX_OUTPUT_TOKENS = 4_000;

/** What saving new categories spends re-scoring the tracks already placed. */
export function estimateRescoreCost(
  placedTracks: number,
  newCategories: number,
): { low: number; high: number } {
  if (placedTracks <= 0 || newCategories <= 0) return { low: 0, high: 0 };
  const output_tokens = Math.min(
    placedTracks * TOKENS_PER_SCORE,
    MAX_OUTPUT_TOKENS,
  );
  const perCall = (tokensPerLine: number) =>
    costFromUsage({
      input_tokens: placedTracks * tokensPerLine + PROMPT_OVERHEAD_TOKENS,
      output_tokens,
    });
  return {
    low: perCall(TOKENS_PER_LINE.low) * newCategories,
    high: perCall(TOKENS_PER_LINE.high) * newCategories,
  };
}
