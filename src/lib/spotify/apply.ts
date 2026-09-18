import { paginate } from "./pagination";
import { spotifyApi } from "./urls";
import { rowTrack, type PlaylistRow } from "./tracks";

export async function createPlaylist(
  accessToken: string,
  name: string,
): Promise<string> {
  const r = await fetch(spotifyApi("/me/playlists"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name,
      public: false,
      description: "Created by SpotifySorter",
    }),
  });
  if (!r.ok) throw new Error(`createPlaylist ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { id: string }).id;
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    const r = await fetch(spotifyApi(`/playlists/${playlistId}/items`), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!r.ok) {
      const err = new Error(`addTracks ${r.status}`);
      (err as { status?: number }).status = r.status;
      (err as { headers?: Headers }).headers = r.headers;
      throw err;
    }
  }
}

export async function listPlaylistTrackIds(
  accessToken: string,
  playlistId: string,
): Promise<string[]> {
  const rows = await paginate<PlaylistRow>(
    spotifyApi(`/playlists/${playlistId}/items?limit=50`),
    { accessToken },
  );
  return rows
    .map((row) => rowTrack<{ id: string | null }>(row)?.id)
    .filter((x): x is string => Boolean(x));
}

export async function findOwnedPlaylistByName(
  accessToken: string,
  fullName: string,
): Promise<string | null> {
  const me = await fetch(spotifyApi("/me"), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!me.ok) throw new Error(`me ${me.status}`);
  const { id: userId } = (await me.json()) as { id: string };
  const all = await paginate<{
    id: string;
    name: string;
    owner: { id: string };
  }>(spotifyApi("/me/playlists?limit=50"), { accessToken });
  return (
    all.find((p) => p.owner.id === userId && p.name === fullName)?.id ?? null
  );
}
