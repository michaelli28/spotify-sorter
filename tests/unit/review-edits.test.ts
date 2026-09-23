import { describe, expect, it } from "vitest";
import {
  categoryEdits,
  deleteCategory,
  describeEdits,
  duplicateNameKeys,
  mergeCategory,
  nameKey,
  undoEdit,
} from "@/src/lib/categories/edits";
import { estimateRescoreCost } from "@/src/lib/categories/rescore-cost";
import type { DraftCategory } from "@/src/lib/categories/merge";

const cat = (
  id: string,
  name: string,
  examples: string[] = [],
  description = `about ${name}`,
): DraftCategory => ({ id, name, description, example_track_ids: examples });

const SAVED = [
  cat("a", "Emo Rap", ["t1"]),
  cat("b", "Dream Pop", ["t2", "t3"]),
  cat("c", "Trance", ["t4"]),
];

describe("categoryEdits", () => {
  it("reports nothing when the draft is what was saved", () => {
    const e = categoryEdits(SAVED, SAVED);
    expect(e).toMatchObject({ added: [], removed: [], renamed: [] });
    expect(e.edited).toBe(0);
    expect(describeEdits(e)).toBeNull();
  });

  it("names deletions, renames and additions", () => {
    const draft = [
      { ...SAVED[0]!, name: "Emo Rap Heartbreak" },
      SAVED[1]!,
      cat("d", "Late Night"),
    ];
    const e = categoryEdits(SAVED, draft);
    expect(e.removed.map((c) => c.name)).toEqual(["Trance"]);
    expect(e.added.map((c) => c.name)).toEqual(["Late Night"]);
    expect(e.renamed).toEqual([
      { id: "a", from: "Emo Rap", to: "Emo Rap Heartbreak" },
    ]);
    expect(describeEdits(e)).toBe("1 deleted · 1 renamed · 1 new");
  });

  // A merge target gains sample tracks; a description edit steers future
  // sorting. Both are unsaved changes the user should see counted.
  it("counts description and sample changes as edits, apart from renames", () => {
    const draft = [
      { ...SAVED[0]!, description: "sadder" },
      { ...SAVED[1]!, example_track_ids: ["t2", "t3", "t9"] },
      { ...SAVED[2]!, name: "Uplifting Trance", description: "euphoric" },
    ];
    const e = categoryEdits(SAVED, draft);
    expect(e.edited).toBe(2);
    expect(e.redescribed.map((c) => c.id)).toEqual(["a", "c"]);
    expect(describeEdits(e)).toBe("1 renamed · 2 edited");
  });
});

describe("duplicateNameKeys", () => {
  it("matches names regardless of case and surrounding spaces", () => {
    const draft = [
      cat("a", "Dream Pop"),
      cat("b", " dream pop "),
      cat("c", "Trance"),
    ];
    expect(duplicateNameKeys(draft)).toEqual(new Set([nameKey("Dream Pop")]));
  });

  it("ignores names still being typed from scratch", () => {
    expect(duplicateNameKeys([cat("a", ""), cat("b", " ")]).size).toBe(0);
  });
});

describe("deleteCategory / undoEdit", () => {
  it("removes the category and can put it back where it was", () => {
    const result = deleteCategory(SAVED, "b")!;
    expect(result.draft.map((c) => c.id)).toEqual(["a", "c"]);
    expect(result.undo).toMatchObject({ kind: "delete", index: 1 });
    expect(undoEdit(result.draft, result.undo)).toEqual(SAVED);
  });

  // Undo is surgical: a rename made after the delete survives it.
  it("keeps later edits to other categories when undoing", () => {
    const { draft, undo } = deleteCategory(SAVED, "a")!;
    const renamed = draft.map((c) =>
      c.id === "c" ? { ...c, name: "Uplifting Trance" } : c,
    );
    expect(undoEdit(renamed, undo).map((c) => c.name)).toEqual([
      "Emo Rap",
      "Dream Pop",
      "Uplifting Trance",
    ]);
  });

  it("returns null for an unknown id", () => {
    expect(deleteCategory(SAVED, "zz")).toBeNull();
  });
});

describe("mergeCategory / undoEdit", () => {
  it("merges the source into the target and splits them again on undo", () => {
    const result = mergeCategory(SAVED, "a", "b")!;
    expect(result.draft.map((c) => c.id)).toEqual(["b", "c"]);
    expect(result.draft[0]!.example_track_ids).toEqual(["t2", "t3", "t1"]);
    expect(result.undo).toMatchObject({
      kind: "merge",
      index: 0,
      targetName: "Dream Pop",
    });
    expect(undoEdit(result.draft, result.undo)).toEqual(SAVED);
  });

  it("only takes back the samples the merge brought in", () => {
    const shared = [cat("a", "A", ["t1", "t2"]), cat("b", "B", ["t2"])];
    const { draft, undo } = mergeCategory(shared, "a", "b")!;
    expect(undoEdit(draft, undo)).toEqual(shared);
  });

  it("refuses to merge a category into itself or a missing one", () => {
    expect(mergeCategory(SAVED, "a", "a")).toBeNull();
    expect(mergeCategory(SAVED, "a", "zz")).toBeNull();
  });
});

describe("estimateRescoreCost", () => {
  it("is free when nothing would be re-scored", () => {
    expect(estimateRescoreCost(0, 2)).toEqual({ low: 0, high: 0 });
    expect(estimateRescoreCost(3172, 0)).toEqual({ low: 0, high: 0 });
  });

  // One Claude call per new category, every placed track in each prompt.
  it("prices one call per new category over every placed track", () => {
    const one = estimateRescoreCost(3172, 1);
    expect(one.low).toBeGreaterThan(0.05);
    expect(one.high).toBeGreaterThan(one.low);
    expect(one.high).toBeLessThan(0.2);
    const two = estimateRescoreCost(3172, 2);
    expect(two.low).toBeCloseTo(one.low * 2);
    expect(two.high).toBeCloseTo(one.high * 2);
  });
});
