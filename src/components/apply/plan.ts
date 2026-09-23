import type { Cache } from "@/src/lib/cache/schema";
import { parsePlaylistName } from "@/src/lib/categories/prefix";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";

export type ApplyCache = Pick<
  Cache,
  "config" | "categories" | "assignments" | "tracks"
>;

export interface ManifestRow {
  id: string;
  /** Without the playlist prefix. */
  name: string;
  /** Tracks this playlist will hold at the saved threshold. */
  count: number;
}

export interface ApplyPlan {
  prefix: string;
  /** In the order the write walks them (src/lib/pipeline/apply.ts). */
  rows: ManifestRow[];
  /** Distinct tracks placed: a track in four playlists counts once. */
  tracks: number;
  toCreate: number;
  toUpdate: number;
  unsorted: number;
}

// Mirrors runApplyFromCache: existing categories only, real tracks only.
export function planApply(cache: ApplyCache): ApplyPlan {
  const { prefix, confidence_threshold } = cache.config;
  const members = categoryMembers(cache.assignments, confidence_threshold);
  const entries = Object.entries(cache.categories).map(([id, category]) => ({
    id,
    category,
    trackIds: [...(members.get(id) ?? [])].filter((t) => t in cache.tracks),
  }));
  const toUpdate = entries.filter((e) => e.category.spotify_playlist_id).length;
  return {
    prefix,
    rows: entries.map(({ id, category, trackIds }) => ({
      id,
      name: parsePlaylistName(prefix, category.name).name,
      count: trackIds.length,
    })),
    tracks: new Set(entries.flatMap((e) => e.trackIds)).size,
    toCreate: entries.length - toUpdate,
    toUpdate,
    unsorted: unsortedTrackIds(cache).length,
  };
}
