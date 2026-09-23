import type { Cache } from "@/src/lib/cache";
import { trackPassesThreshold } from "@/src/lib/classification/threshold";
import { effectiveTemperature } from "@/src/lib/sleeves/lexicon";
import { catalogueSpecs, type SleeveSpec } from "@/src/lib/sleeves/spec";
import type { Temperature } from "@/src/lib/sleeves/temperature";
import { orderBySize } from "@/src/components/graphics/crate-geometry";

// Home's crate and press list (brief §3 Home, spec §3.8), built on the server
// from the cache and the status's per-category counts. Pure: page.tsx reads.

export type ShelfCache = Pick<
  Cache,
  "config" | "categories" | "assignments" | "tracks" | "artists"
>;

export interface ShelfRecord {
  id: string;
  title: string;
  artist: string;
}

export interface ShelfEntry {
  id: string;
  /** 1-based, in cache order: the number on its tab, press row and review tab. */
  catalogueNo: number;
  name: string;
  /** Tracks at the saved cutoff (Apply's rule). */
  count: number;
  temperature: Temperature;
  spec: SleeveSpec;
  onSpotify: boolean;
  /** Up to three example tracks, never one from the labelling sample. */
  records: ShelfRecord[];
}

export interface Shelf {
  /** Front (largest) to back: the crate's dividers and the press list's rows. */
  entries: ShelfEntry[];
  /** Playlist adds at the cutoff: a track in four playlists counts four. 0 = just proposed. */
  adds: number;
  /** Apply writes one per category, an empty one included, so it can exceed `entries`. */
  playlists: number;
  threshold: number;
  /** Sorted tracks whose every category is gone: Apply writes them nowhere. */
  fitNone: number;
}

const RECORDS = 3;

/**
 * `blind` is the labelling sample's track ids; null means it couldn't be read,
 * and then no record is shown at all rather than one that might be sampled.
 */
export function buildShelf(
  cache: ShelfCache,
  counts: Readonly<Record<string, number>>,
  blind: ReadonlySet<string> | null,
): Shelf {
  const threshold = cache.config.confidence_threshold;
  const catalogue = Object.entries(cache.categories).map(([id, c]) => ({
    id,
    ...c,
  }));
  const specs = catalogueSpecs(catalogue);
  const all: ShelfEntry[] = catalogue.map((c, i) => ({
    id: c.id,
    catalogueNo: i + 1,
    name: c.name,
    count: counts[c.id] ?? 0,
    temperature: effectiveTemperature(c),
    spec: specs.get(c.id)!,
    onSpotify: c.spotify_playlist_id !== null,
    records:
      blind === null
        ? []
        : c.example_track_ids
            .filter((t) => t in cache.tracks && !blind.has(t))
            .slice(0, RECORDS)
            .map((t) => {
              const track = cache.tracks[t]!;
              return {
                id: t,
                title: track.title,
                artist: cache.artists[track.artist_id]?.name ?? "",
              };
            }),
  }));
  const adds = all.reduce((sum, e) => sum + e.count, 0);
  return {
    // Just proposed: every divider stands, empty. Otherwise a category with
    // no tracks yet (just added) waits for Classify (brief §3 States).
    entries: orderBySize(adds === 0 ? all : all.filter((e) => e.count > 0)),
    adds,
    playlists: all.length,
    threshold,
    fitNone: Object.keys(cache.tracks).filter((t) => {
      const a = cache.assignments[t];
      return (
        a !== undefined &&
        !trackPassesThreshold(a, threshold).some((id) => id in cache.categories)
      );
    }).length,
  };
}
