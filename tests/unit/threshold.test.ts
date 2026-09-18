import { describe, it, expect } from "vitest";
import {
  trackPassesThreshold,
  categoryMembers,
} from "@/src/lib/classification/threshold";
import type { Assignment } from "@/src/lib/cache";

const a = (matches: Array<[string, number]>): Assignment => ({
  matches: matches.map(([category_id, score]) => ({ category_id, score })),
  classified_at: "2026-05-13T00:00:00.000Z",
  override: null,
});

describe("trackPassesThreshold", () => {
  it("returns categories with score >= threshold", () => {
    const result = trackPassesThreshold(
      a([
        ["c1", 90],
        ["c2", 60],
        ["c3", 30],
      ]),
      65,
    );
    expect(result).toEqual(["c1"]);
  });

  it("returns highest-match (force-fit) when none clears threshold", () => {
    const result = trackPassesThreshold(
      a([
        ["c1", 50],
        ["c2", 30],
      ]),
      80,
    );
    expect(result).toEqual(["c1"]);
  });

  it("returns empty when assignment has zero matches", () => {
    expect(trackPassesThreshold(a([]), 50)).toEqual([]);
  });

  it("respects override regardless of threshold", () => {
    const withOverride: Assignment = {
      ...a([["c1", 90]]),
      override: { category_id: "manual", set_at: "2026-05-13T00:00:00.000Z" },
    };
    expect(trackPassesThreshold(withOverride, 65)).toEqual(["manual"]);
  });
});

describe("categoryMembers", () => {
  it("produces id -> Set<trackId>", () => {
    const assignments = {
      t1: a([
        ["c1", 90],
        ["c2", 60],
      ]),
      t2: a([["c2", 75]]),
    };
    const map = categoryMembers(assignments, 70);
    expect(map.get("c1")!).toEqual(new Set(["t1"]));
    expect(map.get("c2")!).toEqual(new Set(["t2"]));
  });
});
