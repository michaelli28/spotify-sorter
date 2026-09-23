import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, CacheVersionMismatch } from "@/src/lib/cache";
import { EnvSchema } from "@/src/lib/config/env";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";

export type AppStatus = {
  configured: boolean;
  connected: boolean;
  tracks: number;
  categories: number;
  unsorted: number;
  applied: number;
  version_mismatch: boolean;
};

// The nav asks on every page and home asks on every render, so this only ever
// reads: withSpotify and ensureFreshToken re-save the cache and strip fields
// they don't know.
export async function readAppStatus(): Promise<AppStatus> {
  const configured = EnvSchema.safeParse(process.env).success;
  try {
    const cache = await readCache(join(dataDir(), "cache.json"));
    const categories = Object.values(cache.categories);
    return {
      configured,
      connected: Boolean(cache.auth?.refresh_token),
      tracks: Object.keys(cache.tracks).length,
      categories: categories.length,
      unsorted: unsortedTrackIds(cache).length,
      applied: categories.filter((c) => c.spotify_playlist_id !== null).length,
      version_mismatch: false,
    };
  } catch (err) {
    if (!(err instanceof CacheVersionMismatch)) throw err;
    return {
      configured,
      connected: false,
      tracks: 0,
      categories: 0,
      unsorted: 0,
      applied: 0,
      version_mismatch: true,
    };
  }
}
