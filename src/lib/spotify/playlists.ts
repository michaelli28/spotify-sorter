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
  owner: { id: string };
  tracks: { total: number };
  images: Array<{ url: string }>;
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
    .filter((p) => p.owner.id === me.id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      track_count: p.tracks.total,
      cover_url: p.images[0]?.url ?? null,
    }));
}
