import { describe, it, expect } from "vitest";
import { categoryDelta } from "@/src/lib/categories/delta";

describe("categoryDelta", () => {
  it("returns added/removed/unchanged by id", () => {
    const before = [
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
    ];
    const after = [
      { id: "c1", name: "A" },
      { id: "c3", name: "C" },
    ];
    expect(categoryDelta(before, after)).toEqual({
      added: [{ id: "c3", name: "C" }],
      removed: [{ id: "c2", name: "B" }],
      unchanged: [{ id: "c1", name: "A" }],
    });
  });

  it("detects rename as unchanged (same id, new name)", () => {
    expect(
      categoryDelta([{ id: "c1", name: "Old" }], [{ id: "c1", name: "New" }])
        .unchanged,
    ).toEqual([{ id: "c1", name: "New" }]);
  });
});
