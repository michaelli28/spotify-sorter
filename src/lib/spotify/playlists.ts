import { paginate } from "./pagination";
import { spotifyApi } from "./urls";

export interface OwnedPlaylist {
  id: string;
  name: string;
  track_count: number;
  cover_url: string | null;
}

interface Me {
  id: string;
}

interface RawPlaylist {
  id: string;
  name: string;
  owner: { id: string } | null;
  // `tracks` was renamed `items` in Feb 2026; older apps still get `tracks`.
  items?: { total: number } | null;
  tracks?: { total: number } | null;
  images: Array<{ url: string }> | null;
}

export interface PlaylistSnapshotInfo {
  snapshot_id: string;
  track_count: number;
}

export async function fetchPlaylistSnapshot(
  playlistId: string,
  accessToken: string,
): Promise<PlaylistSnapshotInfo> {
  const url = spotifyApi(
    `/playlists/${playlistId}?fields=snapshot_id,items(total),tracks(total)`,
  );
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch snapshot for playlist ${playlistId}: ${res.status}`,
    );
  }
  const data = (await res.json()) as Pick<RawPlaylist, "items" | "tracks"> & {
    snapshot_id: string;
  };
  return {
    snapshot_id: data.snapshot_id,
    track_count: data.items?.total ?? data.tracks?.total ?? 0,
  };
}

export async function listOwnedPlaylists(
  accessToken: string,
): Promise<OwnedPlaylist[]> {
  const meRes = await fetch(spotifyApi("/me"), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) throw new Error(`Failed to fetch /me: ${meRes.status}`);
  const me = (await meRes.json()) as Me;

  const all = await paginate<RawPlaylist>(
    spotifyApi("/me/playlists?limit=50"),
    { accessToken },
  );
  // /me/playlists is ordered by recently-modified, so a library that changes
  // between page fetches can serve one playlist on two pages. Keep the first.
  const seen = new Set<string>();
  return all
    .filter((p) => p?.owner?.id === me.id)
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      track_count: p.items?.total ?? p.tracks?.total ?? 0,
      cover_url: p.images?.[0]?.url ?? null,
    }));
}
