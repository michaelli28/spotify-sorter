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
  it("accepts top-5 matches per track", () => {
    const ok = {
      tracks: [
        {
          track_id: "t1",
          matches: [
            { category: "Aesthetic Rap", score: 87 },
            { category: "Sad Slow", score: 62 },
            { category: "X", score: 41 },
            { category: "Y", score: 35 },
            { category: "Z", score: 28 },
          ],
        },
      ],
    };
    expect(ClassifyResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects score > 100", () => {
    const bad = {
      tracks: [
        {
          track_id: "t1",
          matches: [{ category: "A", score: 150 }],
        },
      ],
    };
    expect(ClassifyResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 5 matches", () => {
    const bad = {
      tracks: [
        {
          track_id: "t1",
          matches: Array.from({ length: 6 }, (_, i) => ({
            category: `c${i}`,
            score: 50,
          })),
        },
      ],
    };
    expect(ClassifyResponseSchema.safeParse(bad).success).toBe(false);
  });
});
