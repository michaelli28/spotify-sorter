import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { formatPlaylistName } from "@/src/lib/categories/prefix";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { withRetry429 } from "@/src/lib/spotify/retry";
import {
  createPlaylist,
  addTracksToPlaylist,
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
  playlists: Array<{
    id: string;
    name: string;
    track_count: number;
    created: boolean;
  }>;
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
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

  let created = 0,
    updated = 0,
    tracks_added = 0;
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

    const trackIds = Array.from(members.get(categoryId) ?? []);
    const existingIds = wasCreated
      ? new Set<string>()
      : new Set(
          await withRetry429(() =>
            listPlaylistTrackIds(opts.accessToken, playlistId!),
          ),
        );
    const toAdd = trackIds.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      const uris = toAdd.map((id) => `spotify:track:${id}`);
      await withRetry429(() =>
        addTracksToPlaylist(opts.accessToken, playlistId!, uris),
      );
      tracks_added += toAdd.length;
      if (!wasCreated) updated++;
    }
    playlists.push({
      id: playlistId!,
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
          summary: `${created} created, ${updated} updated, ${tracks_added} tracks added.`,
        },
      ],
    }),
  );

  return { created, updated, tracks_added, playlists };
}
