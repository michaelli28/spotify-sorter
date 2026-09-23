import { describe, expect, it } from "vitest";
import { readLibrary, type LibraryCache } from "@/src/components/diff/summary";

const track = (first_seen: string, artist_id = "a") => ({
  artist_id,
  title: "t",
  first_seen,
});

const SCAN_1 = "2026-09-01T00:00:00.000Z";
const SCAN_2 = "2026-09-20T00:00:00.000Z";

describe("readLibrary", () => {
  function cache(over: Partial<LibraryCache> = {}): LibraryCache {
    return {
      tracks: { s: track(SCAN_1), u1: track(SCAN_2), u2: track(SCAN_2) },
      assignments: {
        s: {
          matches: [{ category_id: "c0", score: 80 }],
          classified_at: SCAN_1,
          override: null,
        },
      },
      artists: {},
      categories: {
        c0: {
          name: "Zero",
          description: "",
          spotify_playlist_id: null,
          created_at: SCAN_1,
          example_track_ids: [],
        },
      },
      config: {
        prefix: "🎧",
        confidence_threshold: 65,
        anthropic_model: "haiku",
      },
      ...over,
    } as LibraryCache;
  }

  it("counts categories and the tracks with no category", () => {
    expect(readLibrary(cache())).toEqual({
      categories: 1,
      unsorted: 2,
      prefix: "🎧",
      applied: false,
    });
  });

  it("knows once Apply has made any playlist", () => {
    const c = cache();
    const applied = cache({
      categories: {
        c0: { ...c.categories.c0!, spotify_playlist_id: "pl0" },
      },
    });
    expect(readLibrary(applied).applied).toBe(true);
  });
});
