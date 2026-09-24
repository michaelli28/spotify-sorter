import type { Cache } from "@/src/lib/cache";
import { hasPrefix } from "@/src/lib/categories/prefix";
import { spotifyError } from "./errors";
import { fetchMeId, listOwnedPlaylists } from "./playlists";
import { spotifyApi } from "./urls";
import { withRetry429 } from "./retry";

// Spotify's cap on URIs per DELETE /me/library.
const REMOVE_PER_REQUEST = 40;

export type ManagedPlaylist = {
  id: string;
  name: string;
  tracks: number;
  /** recorded = a category's spotify_playlist_id; prefix = owned + prefixed. */
  source: "recorded" | "prefix";
};

export type RemoveFailure = {
  id: string;
  /** "missing_scope" (Spotify 401/403), "spotify_<status>", or "network". */
  reason: string;
};

export type RemoveResult = { removed: string[]; failed: RemoveFailure[] };

// A recorded playlist missing from the owner's own library playlists: removed
// by hand (listing it lets "remove" clear its stale id, so the next Apply
// makes a visible one), or someone else's. null = not the owner's, or Spotify
// has no such playlist.
async function fetchRecordedPlaylist(
  accessToken: string,
  id: string,
  meId: string,
): Promise<{ name: string; tracks: number } | null> {
  const r = await withRetry429(async () => {
    const res = await fetch(
      spotifyApi(
        `/playlists/${encodeURIComponent(id)}?fields=name,owner(id),items(total),tracks(total)`,
      ),
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok && res.status !== 404)
      throw spotifyError(`playlist ${res.status}`, res);
    return res;
  });
  if (r.status === 404) return null;
  // `tracks` was renamed `items` in Feb 2026; older apps still get `tracks`.
  const body = (await r.json()) as {
    name: string;
    owner?: { id: string } | null;
    items?: { total: number } | null;
    tracks?: { total: number } | null;
  };
  if (body.owner?.id !== meId) return null;
  return {
    name: body.name,
    tracks: body.items?.total ?? body.tracks?.total ?? 0,
  };
}

// The playlists "Remove SpotifySorter playlists" may touch: every category's
// recorded playlist, then the owner's own playlists named with the prefix
// (orphans of deleted categories). Only ever the owner's own playlists.
export async function listManagedPlaylists(
  accessToken: string,
  cache: {
    config: Pick<Cache["config"], "prefix">;
    categories: Record<string, { spotify_playlist_id: string | null }>;
  },
): Promise<ManagedPlaylist[]> {
  const meId = await fetchMeId(accessToken);
  const owned = await listOwnedPlaylists(accessToken, meId);
  const ownedById = new Map(owned.map((p) => [p.id, p]));
  const recordedIds = [
    ...new Set(
      Object.values(cache.categories)
        .map((c) => c.spotify_playlist_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const recorded: ManagedPlaylist[] = [];
  for (const id of recordedIds) {
    const inLibrary = ownedById.get(id);
    const found = inLibrary
      ? { name: inLibrary.name, tracks: inLibrary.track_count }
      : await fetchRecordedPlaylist(accessToken, id, meId);
    if (found) recorded.push({ id, ...found, source: "recorded" });
  }

  const recordedSet = new Set(recordedIds);
  const prefixed: ManagedPlaylist[] = owned
    .filter(
      (p) => !recordedSet.has(p.id) && hasPrefix(cache.config.prefix, p.name),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      tracks: p.track_count,
      source: "prefix",
    }));

  return [...recorded, ...prefixed];
}

function failureReason(err: unknown): string {
  const status = (err as { status?: unknown }).status;
  if (status === 401 || status === 403) return "missing_scope";
  return typeof status === "number" ? `spotify_${status}` : "network";
}

// Removes playlists from the owner's library (Spotify's replacement for
// unfollowing; restorable for 90 days at spotify.com/account/recover-playlists).
// Each chunk retries on its own and a failed chunk doesn't stop the rest, so
// the caller learns exactly which ids went. Never run live.
export async function removePlaylistsFromLibrary(
  accessToken: string,
  ids: string[],
): Promise<RemoveResult> {
  const removed: string[] = [];
  const failed: RemoveFailure[] = [];
  for (let i = 0; i < ids.length; i += REMOVE_PER_REQUEST) {
    const chunk = ids.slice(i, i + REMOVE_PER_REQUEST);
    const uris = chunk
      .map((id) => `spotify:playlist:${encodeURIComponent(id)}`)
      .join(",");
    try {
      await withRetry429(async () => {
        const r = await fetch(spotifyApi(`/me/library?uris=${uris}`), {
          method: "DELETE",
          headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) throw spotifyError(`removeFromLibrary ${r.status}`, r);
      });
      removed.push(...chunk);
    } catch (err) {
      const reason = failureReason(err);
      failed.push(...chunk.map((id) => ({ id, reason })));
    }
  }
  return { removed, failed };
}
