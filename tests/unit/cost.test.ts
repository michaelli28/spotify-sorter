import { describe, it, expect } from "vitest";
import {
  estimateCostUSD,
  estimateClassifyCost,
  CLASSIFY_USD_PER_TRACK,
  costFromUsage,
  HAIKU_PRICING,
} from "@/src/lib/llm/cost";

describe("cost", () => {
  it("costFromUsage applies per-million pricing", () => {
    const usd = costFromUsage({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(
      HAIKU_PRICING.input_per_mtok + HAIKU_PRICING.output_per_mtok,
    );
  });

  it("estimateCostUSD treats prompt cache reads at 10% of input price", () => {
    const cached = costFromUsage({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cached).toBeCloseTo(HAIKU_PRICING.input_per_mtok * 0.1);
  });

  it("classify estimate is a range: tracks × the measured per-track cost spread", () => {
    const est = estimateClassifyCost(2875);
    expect(est.low).toBeCloseTo(2875 * CLASSIFY_USD_PER_TRACK.low, 10);
    expect(est.high).toBeCloseTo(2875 * CLASSIFY_USD_PER_TRACK.high, 10);
    expect(est.low).toBeLessThan(est.high);
  });

  it("classify estimate is zero when nothing is left to classify", () => {
    expect(estimateClassifyCost(0)).toEqual({ low: 0, high: 0 });
  });

  it("propose cost is independent of category count", () => {
    const a = estimateCostUSD({
      tracks: 2000,
      categories: 20,
      phase: "propose",
    });
    const b = estimateCostUSD({
      tracks: 2000,
      categories: 40,
      phase: "propose",
    });
    expect(a).toBeCloseTo(b, 1);
  });
});
