import { describe, it, expect } from "vitest";
import {
  ProposeResponseSchema,
  ClassifyResponseSchema,
} from "@/src/lib/llm/schemas";

describe("ProposeResponseSchema", () => {
  it("accepts a valid propose payload", () => {
    const ok = {
      categories: [
        {
          name: "Aesthetic Rap",
          description: "Cloud-rap",
          example_track_ids: ["t1", "t2"],
        },
      ],
    };
    expect(ProposeResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects category with empty name", () => {
    expect(
      ProposeResponseSchema.safeParse({
        categories: [{ name: "", description: "x", example_track_ids: [] }],
      }).success,
    ).toBe(false);
  });

  it("rejects when categories key missing", () => {
    expect(ProposeResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("ClassifyResponseSchema", () => {
  it("accepts numbered tracks with matches", () => {
    const ok = {
      tracks: [
        {
          n: 1,
          matches: [
            { category: "Aesthetic Rap", score: 87 },
            { category: "Sad Slow", score: 62 },
          ],
        },
      ],
    };
    expect(ClassifyResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects rows keyed by track_id instead of a line number", () => {
    const bad = {
      tracks: [{ track_id: "t1", matches: [{ category: "A", score: 50 }] }],
    };
    expect(ClassifyResponseSchema.safeParse(bad).success).toBe(false);
  });
});
