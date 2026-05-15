import { describe, it, expect } from "vitest";
import {
  mergeCategories,
  type DraftCategory,
} from "@/src/lib/categories/merge";

const cat = (id: string, name: string, examples: string[]): DraftCategory => ({
  id,
  name,
  description: `desc-${name}`,
  example_track_ids: examples,
});

describe("mergeCategories", () => {
  it("removes source, keeps target, unions example tracks", () => {
    const before = [cat("a", "A", ["t1", "t2"]), cat("b", "B", ["t2", "t3"])];
    const after = mergeCategories(before, "a", "b");
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe("b");
    expect(after[0]!.example_track_ids.sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("noop when source === target", () => {
    const before = [cat("a", "A", ["t1"])];
    expect(mergeCategories(before, "a", "a")).toEqual(before);
  });

  it("returns same array when target id missing", () => {
    const before = [cat("a", "A", ["t1"])];
    expect(mergeCategories(before, "a", "missing")).toEqual(before);
  });
});
