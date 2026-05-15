import { readFile } from "node:fs/promises";
import { CacheSchema, EXPECTED_CACHE_VERSION, type Cache } from "./schema";

export class CacheVersionMismatch extends Error {
  constructor(found: number) {
    super(
      `Cache version mismatch: file is v${found}, expected v${EXPECTED_CACHE_VERSION}`,
    );
    this.name = "CacheVersionMismatch";
  }
}

export function defaultCache(): Cache {
  return {
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
  };
}

export async function readCache(path: string): Promise<Cache> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultCache();
    throw err;
  }
  const parsed = JSON.parse(raw);
  if (
    typeof parsed?.version === "number" &&
    parsed.version !== EXPECTED_CACHE_VERSION
  ) {
    throw new CacheVersionMismatch(parsed.version);
  }
  return CacheSchema.parse(parsed);
}
