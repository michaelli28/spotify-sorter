import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, CacheVersionMismatch, type Cache } from "@/src/lib/cache";
import { EnvSchema } from "@/src/lib/config/env";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { isLabelStudyOpen } from "@/src/lib/labeling/blind";

export type AppStatus = {
  configured: boolean;
  connected: boolean;
  tracks: number;
  categories: number;
  unsorted: number;
  applied: number;
  version_mismatch: boolean;
  /** category id → tracks it holds at the saved threshold. Aggregate only. */
  category_counts: Record<string, number>;
  /** Any label item still queued (or unsure): hide per-category artist hints. */
  label_study_open: boolean;
};

// Apply's rule (src/components/apply/plan.ts): existing categories only, and
// only tracks still in the library.
function categoryCounts(
  cache: Pick<Cache, "config" | "categories" | "assignments" | "tracks">,
): Record<string, number> {
  const members = categoryMembers(
    cache.assignments,
    cache.config.confidence_threshold,
  );
  return Object.fromEntries(
    Object.keys(cache.categories).map((id) => [
      id,
      [...(members.get(id) ?? [])].filter((t) => t in cache.tracks).length,
    ]),
  );
}

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
      category_counts: categoryCounts(cache),
      label_study_open: await isLabelStudyOpen(),
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
      category_counts: {},
      label_study_open: await isLabelStudyOpen(),
    };
  }
}
