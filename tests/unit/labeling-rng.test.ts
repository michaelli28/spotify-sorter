import { describe, it, expect } from "vitest";
import { seededRandom, shuffled } from "@/src/lib/labeling/rng";

const draws = (seed: string, n: number) => {
  const rand = seededRandom(seed);
  return Array.from({ length: n }, () => rand());
};

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    expect(draws("a", 50)).toEqual(draws("a", 50));
  });

  it("gives a different sequence for a different seed", () => {
    expect(draws("a", 50)).not.toEqual(draws("b", 50));
  });

  it("returns values in [0, 1)", () => {
    for (const x of draws("range", 10_000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("shuffled", () => {
  it("returns a permutation of its input", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = shuffled(items, seededRandom("perm"));
    expect(out).toHaveLength(items.length);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(out).not.toEqual(items);
  });

  it("does not mutate its input", () => {
    const items = Object.freeze(["a", "b", "c", "d", "e"]);
    shuffled(items, seededRandom("frozen"));
    expect(items).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("is deterministic for the same seed and input", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shuffled(items, seededRandom("x"))).toEqual(
      shuffled(items, seededRandom("x")),
    );
  });

  it("handles empty and single-item inputs", () => {
    expect(shuffled([], seededRandom("e"))).toEqual([]);
    expect(shuffled(["only"], seededRandom("e"))).toEqual(["only"]);
  });

  it("puts each item first about equally often", () => {
    const items = [0, 1, 2, 3, 4];
    const rand = seededRandom("uniform");
    const counts = [0, 0, 0, 0, 0];
    const n = 10_000;
    for (let i = 0; i < n; i++) counts[shuffled(items, rand)[0]!]!++;
    // Expected 2,000 each; sd ~40, so +/-200 is a 5-sigma band.
    for (const c of counts)
      expect(Math.abs(c - n / items.length)).toBeLessThan(200);
  });
});
