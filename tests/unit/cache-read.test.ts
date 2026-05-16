import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCache, defaultCache } from "@/src/lib/cache/read";
import { EXPECTED_CACHE_VERSION } from "@/src/lib/cache/schema";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readCache", () => {
  it("returns defaultCache when file does not exist", async () => {
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.version).toBe(EXPECTED_CACHE_VERSION);
    expect(cache.tracks).toEqual({});
    expect(cache.config.prefix).toBe("✨");
  });

  it("reads and validates a valid cache file", async () => {
    const path = join(dir, "cache.json");
    await writeFile(path, JSON.stringify(defaultCache()), "utf-8");
    const cache = await readCache(path);
    expect(cache.version).toBe(EXPECTED_CACHE_VERSION);
  });

  it("throws CacheVersionMismatch on stale cache", async () => {
    const path = join(dir, "cache.json");
    await writeFile(
      path,
      JSON.stringify({ ...defaultCache(), version: 999 }),
      "utf-8",
    );
    await expect(readCache(path)).rejects.toThrow(/version mismatch/i);
  });

  it("throws on malformed JSON", async () => {
    const path = join(dir, "cache.json");
    await writeFile(path, "{not valid json", "utf-8");
    await expect(readCache(path)).rejects.toThrow();
  });

  it("migrates v1 cache forward to v2 by adding playlist_snapshots", async () => {
    const path = join(dir, "cache.json");
    const v1Cache = {
      version: 1,
      auth: null,
      config: {
        prefix: "✨",
        confidence_threshold: 65,
        anthropic_model: "claude-haiku-4-5-20251001",
      },
      scope: {
        included_playlist_ids: ["p1"],
        excluded_playlist_ids: [],
        include_liked_songs: true,
      },
      artists: { a1: { name: "Mac Miller", genres: ["hip hop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Self Care",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {},
      assignments: {},
      runs: [],
    };
    await writeFile(path, JSON.stringify(v1Cache), "utf-8");
    const cache = await readCache(path);
    expect(cache.version).toBe(2);
    expect(cache.playlist_snapshots).toEqual({});
    expect(cache.liked_songs_fingerprint).toBeNull();
    expect(cache.tracks["t1"]?.title).toBe("Self Care");
    expect(cache.artists["a1"]?.name).toBe("Mac Miller");
    expect(cache.scope.included_playlist_ids).toEqual(["p1"]);
  });
});
