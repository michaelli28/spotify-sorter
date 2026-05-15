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
});
