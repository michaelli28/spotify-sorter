// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultCache,
  readCache,
  writeCache,
  type Cache,
} from "@/src/lib/cache";
import { CategorySchema } from "@/src/lib/cache/schema";
import { TEMPERATURES } from "@/src/lib/sleeves/temperature";

// The owner's colour override. Optional, so it needs no cache version bump —
// but it has to be IN the schema, or readCache's parse strips it.

const ISO = "2026-09-23T00:00:00.000Z";
const category = (over: Record<string, unknown> = {}) => ({
  name: "Bedroom Pop",
  description: "soft",
  spotify_playlist_id: null,
  created_at: ISO,
  example_track_ids: [],
  ...over,
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-temp-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("category temperature", () => {
  it("is the four temperatures, in lexicon tie order", () => {
    expect(TEMPERATURES).toEqual(["dusk", "charge", "glow", "haze"]);
  });

  it("survives a round trip through writeCache and readCache", async () => {
    const path = join(dir, "cache.json");
    const cache: Cache = {
      ...defaultCache(),
      categories: {
        c1: CategorySchema.parse(category({ temperature: "glow" })),
      },
    };
    await writeCache(path, cache);
    const back = await readCache(path);
    expect(back.categories.c1!.temperature).toBe("glow");
  });

  it("stays absent (not undefined, not null) when never set", async () => {
    const path = join(dir, "cache.json");
    await writeCache(path, {
      ...defaultCache(),
      categories: { c1: CategorySchema.parse(category()) },
    });
    const raw = JSON.parse(await readFile(path, "utf-8"));
    expect(raw.categories.c1).not.toHaveProperty("temperature");
    const back = await readCache(path);
    expect(back.categories.c1).not.toHaveProperty("temperature");
  });

  it("rejects a value that is not one of the four", () => {
    expect(
      CategorySchema.safeParse(category({ temperature: "sunny" })).success,
    ).toBe(false);
    expect(
      CategorySchema.safeParse(category({ temperature: null })).success,
    ).toBe(false);
  });

  it("makes writeCache refuse a cache carrying an unknown value", async () => {
    const bad = {
      ...defaultCache(),
      categories: { c1: category({ temperature: "sunny" }) },
    } as unknown as Cache;
    await expect(writeCache(join(dir, "cache.json"), bad)).rejects.toThrow();
  });
});
