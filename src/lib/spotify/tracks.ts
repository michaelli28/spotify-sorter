import { paginate } from "./pagination";

export interface NormalizedTrack {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
}

interface RawItem {
  track: null | {
    id: string | null;
    name: string;
    is_local: boolean;
    artists: Array<{ id: string; name: string }>;
    linked_from?: { id: string };
  };
}

function normalize(items: RawItem[]): NormalizedTrack[] {
  const out: NormalizedTrack[] = [];
  for (const item of items) {
    const t = item.track;
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
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,is_local,artists(id,name),linked_from(id))),next`;
  const items = await paginate<RawItem>(url, { accessToken });
  return normalize(items);
}

export async function fetchLikedSongs(
  accessToken: string,
): Promise<NormalizedTrack[]> {
  const url = `https://api.spotify.com/v1/me/tracks?limit=50&fields=items(track(id,name,is_local,artists(id,name),linked_from(id))),next`;
  const items = await paginate<RawItem>(url, { accessToken });
  return normalize(items);
}
