// @vitest-environment node
import { describe, it, expect } from "vitest";
import { fnv1a32, mulberry32 } from "@/src/lib/sleeves/hash";
import { pyFixed } from "@/src/lib/sleeves/format";

// Vectors from docs/design/record-shop/covers.py and an independent UTF-16
// FNV-1a (scratchpad build/F2-graphics/vectors.py).

describe("fnv1a32", () => {
  it("matches the reference on plain and CJK text", () => {
    expect(fnv1a32("")).toBe(2166136261);
    expect(fnv1a32("a")).toBe(3826002220);
    expect(fnv1a32("foobar")).toBe(3214735720);
    expect(fnv1a32("81ad1a75ce6b333d|Emo Rap Heartbreak")).toBe(3057231967);
    expect(fnv1a32("古风|Gufeng")).toBe(3378942539);
  });

  it("hashes UTF-16 code units, so an emoji counts as its surrogate pair", () => {
    // covers.py hashes code points (3047389345 here); the brief specifies
    // charCodeAt, and the TS port follows the brief.
    expect(fnv1a32("x|🎵 Beats")).toBe(867365691);
  });

  it("returns an unsigned 32-bit integer", () => {
    const h = fnv1a32("anything at all");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe("mulberry32", () => {
  it("replays the reference sequence", () => {
    const r = mulberry32(0x5eed);
    expect([r(), r(), r(), r()]).toEqual([
      0.7100320369936526, 0.286336648510769, 0.9519026265479624,
      0.10175976227037609,
    ]);
  });

  it("accepts a seed XORed past the signed range", () => {
    // seed ^ 0x9E3779B9 is negative in JS; the reference sees it unsigned.
    const r = mulberry32(3057231967 ^ 0x9e3779b9);
    expect([r(), r()]).toEqual([0.030194194288924336, 0.7424723352305591]);
  });

  it("starts from zero like the reference", () => {
    const r = mulberry32(0);
    expect(r()).toBe(0.26642920868471265);
  });
});

describe("pyFixed", () => {
  it("rounds exact binary ties to even, as Python's format does", () => {
    expect([0.25, 0.75, -0.25, 2.25].map((v) => pyFixed(v, 1))).toEqual([
      "0.2",
      "0.8",
      "-0.2",
      "2.2",
    ]);
    expect([0.125, 0.375, 0.625].map((v) => pyFixed(v, 2))).toEqual([
      "0.12",
      "0.38",
      "0.62",
    ]);
  });

  it("agrees with toFixed away from ties", () => {
    expect(
      [0.35, 0.15, -0.04, 10, 99.95, 1.05].map((v) => pyFixed(v, 1)),
    ).toEqual(["0.3", "0.1", "-0.0", "10.0", "100.0", "1.1"]);
  });
});
