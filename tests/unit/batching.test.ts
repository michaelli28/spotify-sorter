import { describe, it, expect } from "vitest";
import { chunkInto } from "@/src/lib/llm/batching";

describe("chunkInto", () => {
  it("splits into size-50 chunks", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const chunks = chunkInto(items, 50);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[2]).toHaveLength(20);
  });

  it("returns empty array for empty input", () => {
    expect(chunkInto([], 50)).toEqual([]);
  });

  it("returns single chunk smaller than batch size", () => {
    expect(chunkInto([1, 2, 3], 50)).toEqual([[1, 2, 3]]);
  });
});
