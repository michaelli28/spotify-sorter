import { describe, it, expect } from "vitest";
import { CacheSchema, EXPECTED_CACHE_VERSION } from "@/src/lib/cache/schema";

describe("CacheSchema", () => {
  const minimalValid = {
    version: EXPECTED_CACHE_VERSION,
    auth: null,
    config: {
      prefix: "✨",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    artists: {},
    tracks: {},
    categories: {},
    assignments: {},
    runs: [],
    playlist_snapshots: {},
    liked_songs_fingerprint: null,
  };

  it("accepts a minimal valid cache", () => {
    const result = CacheSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
  });

  it("rejects cache missing required version", () => {
    const { version, ...withoutVersion } = minimalValid;
    expect(CacheSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it("rejects threshold outside 0-100", () => {
    const bad = {
      ...minimalValid,
      config: { ...minimalValid.config, confidence_threshold: 150 },
    };
    expect(CacheSchema.safeParse(bad).success).toBe(false);
  });

  it("round-trips a populated cache losslessly", () => {
    const populated = {
      ...minimalValid,
      auth: { refresh_token: "rt_abc", expires_at: "2026-05-13T18:00:00.000Z" },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Self Care",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {
        c1: {
          name: "Aesthetic Rap",
          description: "Dreamy",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
          example_track_ids: [],
        },
      },
      assignments: {
        t1: {
          matches: [{ category_id: "c1", score: 87 }],
          classified_at: "2026-05-13T00:00:00.000Z",
          override: null,
        },
      },
    };
    const parsed = CacheSchema.parse(populated);
    expect(parsed).toEqual(populated);
  });
});
