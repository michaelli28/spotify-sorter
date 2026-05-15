import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";
import { dedupeTracks } from "@/src/lib/spotify/dedupe";
import { fetchArtists } from "@/src/lib/spotify/artists";

export interface ScanResult {
  unique_tracks: number;
  unique_artists: number;
}

export type ProgressCb = (
  stage: string,
  current: number,
  total: number,
) => void;

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function runScan(opts: {
  accessToken: string;
  onProgress?: ProgressCb;
}): Promise<ScanResult> {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  const onProgress = opts.onProgress ?? (() => {});

  const playlistIds = cache.scope.included_playlist_ids;
  onProgress(
    "playlists",
    0,
    playlistIds.length + (cache.scope.include_liked_songs ? 1 : 0),
  );

  const all = [];
  let done = 0;
  for (const id of playlistIds) {
    all.push(...(await fetchPlaylistTracks(id, opts.accessToken)));
    onProgress("playlists", ++done, playlistIds.length);
  }
  if (cache.scope.include_liked_songs) {
    all.push(...(await fetchLikedSongs(opts.accessToken)));
    onProgress("liked", 1, 1);
  }

  const unique = dedupeTracks(all);
  if (unique.length === 0) {
    throw new Error("EMPTY_LIBRARY");
  }
  const artistIds = Array.from(new Set(unique.map((t) => t.artist_id)));
  onProgress("artists", 0, artistIds.length);
  const artists = await fetchArtists(artistIds, opts.accessToken);
  onProgress("artists", artistIds.length, artistIds.length);

  const now = new Date().toISOString();
  const tracks: typeof cache.tracks = { ...cache.tracks };
  for (const t of unique) {
    if (!tracks[t.id]) {
      tracks[t.id] = {
        artist_id: t.artist_id,
        title: t.title,
        first_seen: now,
      };
    }
  }

  await writeCache(
    cachePath,
    patchCache(cache, {
      artists: { ...cache.artists, ...artists },
      tracks,
    }),
  );

  return { unique_tracks: unique.length, unique_artists: artistIds.length };
}
