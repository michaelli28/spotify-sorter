import type { Cache } from "@/src/lib/cache/schema";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";

/** The parts of GET /api/cache the re-run checkpoint reads. */
export type LibraryCache = Pick<
  Cache,
  "tracks" | "assignments" | "artists" | "categories" | "config"
>;

export type WaitingTrack = { id: string; title: string; artist: string };

/** GET /api/library/unsorted, newest scan first. `total` counts every
 *  unsorted track; `tracks` leaves out the labelling sample's songs, so it can
 *  list fewer. */
export type UnsortedList = { total: number; tracks: WaitingTrack[] };

export type Library = {
  categories: number;
  /** Tracks with no category: what a classify run pays for. */
  unsorted: number;
  prefix: string;
  /** Whether Apply has made any playlist on Spotify yet. */
  applied: boolean;
};

export function readLibrary(cache: LibraryCache): Library {
  return {
    categories: Object.keys(cache.categories).length,
    unsorted: unsortedTrackIds(cache).length,
    prefix: cache.config.prefix,
    applied: Object.values(cache.categories).some(
      (c) => c.spotify_playlist_id !== null,
    ),
  };
}
