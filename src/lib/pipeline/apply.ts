import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { formatPlaylistName } from "@/src/lib/categories/prefix";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { withRetry429 } from "@/src/lib/spotify/retry";
import {
  createPlaylist,
  addTracksToPlaylist,
  replacePlaylistItems,
  listPlaylistTrackIds,
  findOwnedPlaylistByName,
} from "@/src/lib/spotify/apply";

export type ApplyProgressCb = (
  stage: "category",
  done: number,
  total: number,
  currentName?: string,
) => void;

export interface ApplyResult {
  created: number;
  updated: number;
  tracks_added: number;
  /** Songs taken out of existing playlists, counted as a set per playlist. */
  tracks_removed: number;
  playlists: Array<{
    id: string;
    /** The category it was written for: its name can change in another tab. */
    category_id: string;
    name: string;
    track_count: number;
    created: boolean;
  }>;
}

// Two categories that print as one playlist name (e.g. "Rain" and "✨ Rain")
// would share it, and each would replace the other's songs on every Apply.
function refuseSharedNames(prefix: string, names: readonly string[]): void {
  const firstByPlaylist = new Map<string, string>();
  for (const name of names) {
    const playlist = formatPlaylistName(prefix, name);
    const first = firstByPlaylist.get(playlist);
    if (first !== undefined) {
      throw new Error(
        `"${first}" and "${name}" would both be the playlist "${playlist}". Rename one on Review.`,
      );
    }
    firstByPlaylist.set(playlist, name);
  }
}

export async function runApplyFromCache(opts: {
  accessToken: string;
  onProgress?: ApplyProgressCb;
}): Promise<ApplyResult> {
  const cachePath = join(dataDir(), "cache.json");
  let cache = await readCache(cachePath);
  const onProgress = opts.onProgress ?? (() => {});

  const members = categoryMembers(
    cache.assignments,
    cache.config.confidence_threshold,
  );
  const categoryEntries = Object.entries(cache.categories);
  refuseSharedNames(
    cache.config.prefix,
    categoryEntries.map(([, c]) => c.name),
  );

  let created = 0,
    updated = 0,
    tracks_added = 0,
    tracks_removed = 0;
  const playlists: ApplyResult["playlists"] = [];

  for (let i = 0; i < categoryEntries.length; i++) {
    const [categoryId, category] = categoryEntries[i]!;
    const fullName = formatPlaylistName(cache.config.prefix, category.name);
    onProgress("category", i, categoryEntries.length, category.name);

    let playlistId = category.spotify_playlist_id;
    let wasCreated = false;

    if (!playlistId) {
      const existing = await withRetry429(() =>
        findOwnedPlaylistByName(opts.accessToken, fullName),
      );
      if (existing) {
        playlistId = existing;
      } else {
        playlistId = await withRetry429(() =>
          createPlaylist(opts.accessToken, fullName),
        );
        wasCreated = true;
        created++;
      }
      cache = patchCache(cache, {
        categories: {
          ...cache.categories,
          [categoryId]: { ...category, spotify_playlist_id: playlistId },
        },
      });
      await writeCache(cachePath, cache);
    }

    // Only real tracks: the old classifier wrote invented keys (e.g.
    // "6Matilda — Harry Styles") that would make Spotify reject the chunk.
    const trackIds = Array.from(members.get(categoryId) ?? []).filter(
      (id) => id in cache.tracks,
    );
    const uris = trackIds.map((id) => `spotify:track:${id}`);
    if (wasCreated) {
      if (uris.length > 0) {
        await addTracksToPlaylist(opts.accessToken, playlistId!, uris);
        tracks_added += uris.length;
      }
    } else {
      // An existing playlist is made to match exactly, so songs added to it by
      // hand in Spotify are removed. Same set (order and duplicates aside) →
      // no write at all.
      const current = new Set(
        await withRetry429(() =>
          listPlaylistTrackIds(opts.accessToken, playlistId!),
        ),
      );
      const desired = new Set(trackIds);
      const added = trackIds.filter((id) => !current.has(id)).length;
      const removed = [...current].filter((id) => !desired.has(id)).length;
      if (added > 0 || removed > 0) {
        await replacePlaylistItems(opts.accessToken, playlistId!, uris);
        tracks_added += added;
        tracks_removed += removed;
        updated++;
      }
    }
    playlists.push({
      id: playlistId!,
      category_id: categoryId,
      name: fullName,
      track_count: trackIds.length,
      created: wasCreated,
    });
  }
  onProgress("category", categoryEntries.length, categoryEntries.length);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeCache(
    cachePath,
    patchCache(cache, {
      runs: [
        ...cache.runs,
        {
          run_id: runId,
          started_at: new Date(Date.now() - 1000).toISOString(),
          completed_at: new Date().toISOString(),
          tracks_classified: 0,
          tracks_total: Object.keys(cache.tracks).length,
          cost_usd: 0,
          summary: `${created} created, ${updated} updated, ${tracks_added} tracks added, ${tracks_removed} tracks removed.`,
        },
      ],
    }),
  );

  return { created, updated, tracks_added, tracks_removed, playlists };
}
