import { spotifyError } from "./errors";
import { paginate } from "./pagination";
import { spotifyApi } from "./urls";
import { withRetry429 } from "./retry";
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

// Spotify's cap on URIs per items request, for both PUT and POST.
const ITEMS_PER_REQUEST = 100;

function writeItemsChunk(
  method: "PUT" | "POST",
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  return withRetry429(async () => {
    const r = await fetch(spotifyApi(`/playlists/${playlistId}/items`), {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ uris }),
    });
    if (!r.ok) throw spotifyError(`${method} playlist items ${r.status}`, r);
  });
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  // Retry per chunk: Spotify appends duplicates, so retrying the whole loop
  // after a 429 on chunk k would re-add chunks 0..k-1.
  for (let i = 0; i < uris.length; i += ITEMS_PER_REQUEST) {
    const chunk = uris.slice(i, i + ITEMS_PER_REQUEST);
    await writeItemsChunk("POST", accessToken, playlistId, chunk);
  }
}

// Makes the playlist hold exactly `uris`, in order: a PUT replaces everything
// with the first 100 (an empty PUT clears it), then the rest are appended.
// Callers must not wrap this in withRetry429: each chunk already retries on
// its own, and re-running the appends would add them twice.
export async function replacePlaylistItems(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  await writeItemsChunk(
    "PUT",
    accessToken,
    playlistId,
    uris.slice(0, ITEMS_PER_REQUEST),
  );
  await addTracksToPlaylist(
    accessToken,
    playlistId,
    uris.slice(ITEMS_PER_REQUEST),
  );
}

export async function listPlaylistTrackIds(
  accessToken: string,
  playlistId: string,
): Promise<string[]> {
  const rows = await paginate<PlaylistRow>(
    spotifyApi(`/playlists/${playlistId}/items?limit=50`),
    { accessToken },
  );
  // A relinked track counts as the id Scan saved (tracks.ts normalize), or
  // the sync would rewrite it on every Apply.
  return rows
    .map((row) => {
      const t = rowTrack<{ id: string | null; linked_from?: { id: string } }>(
        row,
      );
      return t?.linked_from?.id ?? t?.id;
    })
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
