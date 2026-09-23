import type { Assignment } from "@/src/lib/cache/schema";
import { trackPassesThreshold } from "@/src/lib/classification/threshold";

/** The Fit ruler's fives: the chart's columns. */
export const FIT_STEPS = [
  40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
] as const;

/** How many artists "Mostly" names. */
const TOP_ARTISTS = 4;

export interface FitCount {
  fit: number;
  count: number;
}

export interface CategoryStats {
  /** Tracks it holds at the saved fit. */
  count: number;
  /** One per chart column, lowest fit first. */
  byFit: FitCount[];
  /** The artists with the most tracks at the saved fit, most first. */
  artists: string[];
}

export interface LibraryStats {
  fit: number;
  byCategory: Record<string, CategoryStats>;
  /** The largest count: the bars' shared scale, as on home. */
  max: number;
}

/** What the stats read from GET /api/cache. */
export interface StatsSource {
  config: { confidence_threshold: number };
  artists: Record<string, { name: string }>;
  tracks: Record<string, { artist_id: string }>;
  categories: Record<string, unknown>;
  assignments: Record<string, Assignment>;
}

/** The fives, plus the owner's fit when it sits between them. */
export function fitColumns(fit: number): number[] {
  return [...new Set([...FIT_STEPS, fit])].sort((a, b) => a - b);
}

// Apply's rule (as src/lib/status.ts): existing categories only, only tracks
// still in the library, and a track under the fit still counts in its top match.
function members(source: StatsSource, fit: number): Map<string, string[]> {
  const out = new Map<string, string[]>(
    Object.keys(source.categories).map((id) => [id, []]),
  );
  for (const [trackId, a] of Object.entries(source.assignments)) {
    if (!(trackId in source.tracks)) continue;
    for (const id of trackPassesThreshold(a, fit)) out.get(id)?.push(trackId);
  }
  return out;
}

function topArtists(
  source: StatsSource,
  trackIds: readonly string[],
): string[] {
  const counts = new Map<string, number>();
  for (const id of trackIds) {
    const name = source.artists[source.tracks[id]!.artist_id]?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  // Ties alphabetically, so the line never reshuffles between loads.
  return [...counts]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, TOP_ARTISTS)
    .map(([name]) => name);
}

export function libraryStats(source: StatsSource): LibraryStats {
  const fit = source.config.confidence_threshold;
  const columns = fitColumns(fit).map((f) => ({
    fit: f,
    members: members(source, f),
  }));
  const atFit = columns.find((c) => c.fit === fit)!.members;
  const byCategory = Object.fromEntries(
    Object.keys(source.categories).map((id) => {
      const tracks = atFit.get(id)!;
      return [
        id,
        {
          count: tracks.length,
          byFit: columns.map((c) => ({
            fit: c.fit,
            count: c.members.get(id)!.length,
          })),
          artists: topArtists(source, tracks),
        },
      ];
    }),
  );
  const max = Math.max(0, ...Object.values(byCategory).map((s) => s.count));
  return { fit, byCategory, max };
}
