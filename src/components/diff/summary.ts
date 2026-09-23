import type { Cache } from "@/src/lib/cache/schema";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";

/** The parts of GET /api/cache the re-run checkpoint reads. */
export type LibraryCache = Pick<
  Cache,
  "tracks" | "assignments" | "artists" | "categories" | "config"
>;

export type WaitingTrack = { id: string; title: string; artist: string };

export type LibrarySummary = {
  categories: number;
  /** Tracks with no category: what a classify run pays for. */
  unsorted: number;
  /** The most recently scanned of those, newest first. */
  newest: WaitingTrack[];
  prefix: string;
  /** Whether Apply has made any playlist on Spotify yet. */
  applied: boolean;
};

export function summariseLibrary(
  cache: LibraryCache,
  shown = 8,
): LibrarySummary {
  const unsorted = unsortedTrackIds(cache);
  const seen = new Map(
    unsorted.map((id) => [id, Date.parse(cache.tracks[id]!.first_seen)]),
  );
  // A scan stamps all its new tracks at once; the stable sort keeps those in
  // the order Spotify listed them.
  const newest = [...unsorted]
    .sort((a, b) => seen.get(b)! - seen.get(a)!)
    .slice(0, shown)
    .map((id) => {
      const track = cache.tracks[id]!;
      return {
        id,
        title: track.title,
        artist: cache.artists[track.artist_id]?.name ?? "",
      };
    });
  return {
    categories: Object.keys(cache.categories).length,
    unsorted: unsorted.length,
    newest,
    prefix: cache.config.prefix,
    applied: Object.values(cache.categories).some(
      (c) => c.spotify_playlist_id !== null,
    ),
  };
}
