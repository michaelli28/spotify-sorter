import { describe, it, expect } from "vitest";
import {
  buildLayouts,
  neighborOverlap,
} from "@/src/lib/analysis/context-layout";

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `t${String(i).padStart(3, "0")}`);

// track id -> [batch index, position index]
function where(layout: string[][]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  layout.forEach((batch, b) => batch.forEach((t, p) => out.set(t, [b, p])));
  return out;
}

describe("buildLayouts", () => {
  it("splits A into ceil(n / batchSize) batches whose sizes differ by at most 1", () => {
    const { A, B, C } = buildLayouts({ trackIds: ids(103), seed: "s" });
    expect(A.map((b) => b.length)).toEqual([35, 34, 34]);
    for (const layout of [A, B, C]) {
      expect(layout.map((b) => b.length)).toEqual([35, 34, 34]);
      expect(layout.flat().sort()).toEqual(ids(103));
    }
  });

  it("uses 50-track batches by default: 300 tracks make 6 full batches", () => {
    const { A } = buildLayouts({ trackIds: ids(300), seed: "s" });
    expect(A.map((b) => b.length)).toEqual([50, 50, 50, 50, 50, 50]);
  });

  it("keeps every track at its line position in B and C", () => {
    const { A, B, C } = buildLayouts({ trackIds: ids(300), seed: "s" });
    const a = where(A);
    for (const layout of [B, C]) {
      for (const [t, [, p]] of where(layout)) expect(p).toBe(a.get(t)![1]);
    }
  });

  it("moves every track to another batch in B and C", () => {
    const { A, B, C, unmoved } = buildLayouts({
      trackIds: ids(300),
      seed: "s",
    });
    const a = where(A);
    for (const layout of [B, C]) {
      for (const [t, [b]] of where(layout)) expect(b).not.toBe(a.get(t)![0]);
    }
    expect(unmoved).toEqual([]);
  });

  it("reports the sole track in a single-entry position column as unmoved", () => {
    // 7 tracks at batch size 3 -> sizes [3, 2, 2]: position 2 exists only in batch 0.
    const { A, B, C, unmoved } = buildLayouts({
      trackIds: ids(7),
      seed: "s",
      batchSize: 3,
    });
    expect(unmoved).toEqual([A[0]![2]]);
    const a = where(A);
    for (const layout of [B, C]) {
      for (const [t, [b]] of where(layout)) {
        if (t === A[0]![2]) expect(b).toBe(0);
        else expect(b).not.toBe(a.get(t)![0]);
      }
    }
  });

  it("leaves a single batch unchanged and reports every track unmoved", () => {
    const { A, B, C, unmoved } = buildLayouts({
      trackIds: ids(3),
      seed: "s",
    });
    expect(B).toEqual(A);
    expect(C).toEqual(A);
    expect([...unmoved].sort()).toEqual(ids(3));
  });

  it("draws B and C independently", () => {
    const { B, C } = buildLayouts({ trackIds: ids(300), seed: "s" });
    expect(B).not.toEqual(C);
  });

  it("is deterministic in the seed and ignores input order", () => {
    const one = buildLayouts({ trackIds: ids(120), seed: "s" });
    const two = buildLayouts({ trackIds: [...ids(120)].reverse(), seed: "s" });
    expect(two).toEqual(one);
    const other = buildLayouts({ trackIds: ids(120), seed: "t" });
    expect(other.A).not.toEqual(one.A);
  });

  it("refuses duplicate track ids", () => {
    expect(() =>
      buildLayouts({ trackIds: ["x", "y", "x"], seed: "s" }),
    ).toThrow(/duplicate/i);
  });

  it("keeps about 1/(k-1) of each track's A-neighbors", () => {
    const layouts = buildLayouts({ trackIds: ids(300), seed: "s" });
    // k = 6 batches: a neighbor lands in the same new batch with p = 1/5.
    expect(layouts.neighborOverlap.B).toBeCloseTo(0.2, 1);
    expect(layouts.neighborOverlap.C).toBeCloseTo(0.2, 1);
    expect(layouts.neighborOverlap.B).toBe(
      neighborOverlap(layouts.A, layouts.B),
    );
    expect(layouts.neighborOverlap.C).toBe(
      neighborOverlap(layouts.A, layouts.C),
    );
  });
});

describe("neighborOverlap", () => {
  it("averages, per track, the share of its base neighbors still beside it", () => {
    const base = [
      ["a", "b", "c"],
      ["d", "e", "f"],
    ];
    const other = [
      ["a", "b", "f"],
      ["d", "e", "c"],
    ];
    // a, b, d, e keep 1 of 2 neighbors; c and f keep none: (4 * 0.5) / 6.
    expect(neighborOverlap(base, other)).toBeCloseTo(1 / 3, 12);
    expect(neighborOverlap(base, base)).toBe(1);
  });
});
