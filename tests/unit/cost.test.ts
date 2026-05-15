import { describe, it, expect } from "vitest";
import {
  estimateCostUSD,
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

  it("estimateCostUSD scales linearly with track count", () => {
    const a = estimateCostUSD({
      tracks: 1000,
      categories: 30,
      phase: "classify",
    });
    const b = estimateCostUSD({
      tracks: 2000,
      categories: 30,
      phase: "classify",
    });
    expect(b).toBeGreaterThan(a);
    expect(b / a).toBeGreaterThan(1.5);
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
