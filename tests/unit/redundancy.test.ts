import { describe, it, expect } from "vitest";
import { pairStats } from "@/src/lib/analysis/redundancy";

describe("pairStats", () => {
  it("computes Jaccard, lift and containment for every category pair", () => {
    // N = 10 tracks. A = {1,2,3,4}, B = {3,4,5}, C = {9}.
    const members = new Map([
      ["A", new Set(["1", "2", "3", "4"])],
      ["B", new Set(["3", "4", "5"])],
      ["C", new Set(["9"])],
    ]);
    const stats = pairStats(members, 10);
    const ab = stats.find((s) => s.a === "A" && s.b === "B")!;
    expect(ab).toEqual({
      a: "A",
      b: "B",
      sizeA: 4,
      sizeB: 3,
      overlap: 2,
      jaccard: 2 / 5, // |A∩B| / |A∪B|
      lift: 2 / ((4 * 3) / 10), // observed / expected under independence
      containment: 2 / 3, // share of the smaller set inside the larger
    });
    expect(stats).toHaveLength(3); // C(3,2) unordered pairs
    expect(stats.find((s) => s.a === "A" && s.b === "C")!.overlap).toBe(0);
  });

  it("sorts pairs by Jaccard, highest first", () => {
    const members = new Map([
      ["A", new Set(["1", "2"])],
      ["B", new Set(["1", "2"])],
      ["C", new Set(["1", "3"])],
    ]);
    const stats = pairStats(members, 4);
    expect(stats.map((s) => `${s.a}-${s.b}`)).toEqual(["A-B", "A-C", "B-C"]);
  });
});
