import { paginate } from "./pagination";
import { spotifyApi } from "./urls";

export interface NormalizedTrack {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
}

interface RawTrack {
  id: string | null;
  name: string;
  is_local: boolean;
  artists: Array<{ id: string; name: string }>;
  linked_from?: { id: string };
}

export interface PlaylistRow {
  item?: unknown;
  track?: unknown;
}

// Since Feb 2026, playlist rows key the track as `item` (a leftover `track` may
// be a boolean); older apps' playlist rows and saved-track rows use `track`.
export function rowTrack<T>(row: PlaylistRow): T | null {
  for (const value of [row.item, row.track]) {
    if (value && typeof value === "object") return value as T;
  }
  return null;
}

function normalize(rows: PlaylistRow[]): NormalizedTrack[] {
  const out: NormalizedTrack[] = [];
  for (const row of rows) {
    const t = rowTrack<RawTrack>(row);
    if (!t || !t.id || t.is_local) continue;
    const primary = t.artists[0];
    if (!primary) continue;
    out.push({
      id: t.linked_from?.id ?? t.id,
      title: t.name,
      artist_id: primary.id,
      artist_name: primary.name,
    });
  }
  return out;
}

export async function fetchPlaylistTracks(
  playlistId: string,
  accessToken: string,
): Promise<NormalizedTrack[]> {
  // No `fields` filter: its documented examples still use the pre-rename keys.
  const url = spotifyApi(`/playlists/${playlistId}/items?limit=50`);
  const rows = await paginate<PlaylistRow>(url, { accessToken });
  return normalize(rows);
}

export async function fetchLikedSongs(
  accessToken: string,
): Promise<NormalizedTrack[]> {
  const url = spotifyApi(
    `/me/tracks?limit=50&fields=items(track(id,name,is_local,artists(id,name),linked_from(id))),next`,
  );
  const rows = await paginate<PlaylistRow>(url, { accessToken });
  return normalize(rows);
}

export interface LikedSongsFingerprintInfo {
  total: number;
  latest_added_at: string | null;
}

export async function fetchLikedSongsFingerprint(
  accessToken: string,
): Promise<LikedSongsFingerprintInfo | null> {
  const url = spotifyApi("/me/tracks?limit=1&fields=total,items(added_at)");
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch liked songs fingerprint: ${res.status}`);
  }
  const data = (await res.json()) as {
    total?: number;
    items?: Array<{ added_at?: string }>;
  };
  if (typeof data.total !== "number") return null;
  return {
    total: data.total,
    latest_added_at: data.items?.[0]?.added_at ?? null,
  };
}
