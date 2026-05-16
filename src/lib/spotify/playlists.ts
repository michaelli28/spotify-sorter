import { paginate } from "./pagination";

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
  tracks: { total: number } | null;
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
  const url = `https://api.spotify.com/v1/playlists/${playlistId}?fields=snapshot_id,tracks(total)`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch snapshot for playlist ${playlistId}: ${res.status}`,
    );
  }
  const data = (await res.json()) as {
    snapshot_id: string;
    tracks: { total: number } | null;
  };
  return {
    snapshot_id: data.snapshot_id,
    track_count: data.tracks?.total ?? 0,
  };
}

export async function listOwnedPlaylists(
  accessToken: string,
): Promise<OwnedPlaylist[]> {
  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) throw new Error(`Failed to fetch /me: ${meRes.status}`);
  const me = (await meRes.json()) as Me;

  const all = await paginate<RawPlaylist>(
    "https://api.spotify.com/v1/me/playlists?limit=50",
    { accessToken },
  );
  return all
    .filter((p) => p?.owner?.id === me.id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      track_count: p.tracks?.total ?? 0,
      cover_url: p.images?.[0]?.url ?? null,
    }));
}
