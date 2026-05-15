import type { NormalizedTrack } from "./tracks";

export function dedupeTracks(tracks: NormalizedTrack[]): NormalizedTrack[] {
  const seen = new Set<string>();
  const out: NormalizedTrack[] = [];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
