import type { Cache } from "@/src/lib/cache/schema";

// The same rule src/lib/pipeline/classify.ts pays for: tracks with no
// assignment. Counted from tracks, so orphan assignment keys can't hide one.
export function unsortedTrackIds(
  cache: Pick<Cache, "tracks" | "assignments">,
): string[] {
  return Object.keys(cache.tracks).filter((id) => !cache.assignments[id]);
}
