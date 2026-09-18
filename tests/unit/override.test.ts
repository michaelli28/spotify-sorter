import { describe, it, expect } from "vitest";
import {
  applyOverride,
  clearOverride,
} from "@/src/lib/classification/override";
import type { Assignment } from "@/src/lib/cache";

const a: Assignment = {
  matches: [{ category_id: "c1", score: 90 }],
  classified_at: "2026-05-13T00:00:00.000Z",
  override: null,
};

describe("applyOverride", () => {
  it("sets override.category_id and set_at ISO date", () => {
    const next = applyOverride(a, "manual-cat");
    expect(next.override).toMatchObject({ category_id: "manual-cat" });
    expect(new Date(next.override!.set_at).getTime()).toBeGreaterThan(0);
  });

  it("does not mutate input", () => {
    applyOverride(a, "manual-cat");
    expect(a.override).toBeNull();
  });
});

describe("clearOverride", () => {
  it("removes override", () => {
    const withOverride: Assignment = {
      ...a,
      override: { category_id: "x", set_at: "2026-05-13T00:00:00.000Z" },
    };
    expect(clearOverride(withOverride).override).toBeNull();
  });
});
