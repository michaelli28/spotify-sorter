import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import {
  fetchPlaylistTracks,
  fetchLikedSongs,
  fetchLikedSongsFingerprint,
} from "@/src/lib/spotify/tracks";
import { dedupeTracks } from "@/src/lib/spotify/dedupe";
import { fetchArtists } from "@/src/lib/spotify/artists";
import { fetchPlaylistSnapshot } from "@/src/lib/spotify/playlists";

export interface ScanResult {
  unique_tracks: number;
  unique_artists: number;
}

export type ProgressCb = (
  stage: string,
  current: number,
  total: number,
) => void;

export async function runScan(opts: {
  accessToken: string;
  onProgress?: ProgressCb;
}): Promise<ScanResult> {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  const onProgress = opts.onProgress ?? (() => {});

  const playlistIds = cache.scope.included_playlist_ids;
  // Liked Songs reports on its own "liked" stage, so it is not in this total:
  // every "playlists" event must carry the same one or the scan's fill jumps.
  onProgress("playlists", 0, playlistIds.length);

  const all = [];
  let done = 0;
  let skippedPlaylists = 0;
  const newSnapshots: typeof cache.playlist_snapshots = {
    ...cache.playlist_snapshots,
  };

  for (const id of playlistIds) {
    let snapshot;
    try {
      snapshot = await fetchPlaylistSnapshot(id, opts.accessToken);
    } catch {
      // If snapshot fetch fails, fall back to full fetch
      snapshot = null;
    }
    const cached = cache.playlist_snapshots[id];
    if (snapshot && cached && cached.snapshot_id === snapshot.snapshot_id) {
      skippedPlaylists++;
      onProgress("playlists", ++done, playlistIds.length);
      continue;
    }
    all.push(...(await fetchPlaylistTracks(id, opts.accessToken)));
    if (snapshot) {
      newSnapshots[id] = {
        snapshot_id: snapshot.snapshot_id,
        track_count: snapshot.track_count,
        fetched_at: new Date().toISOString(),
      };
    }
    onProgress("playlists", ++done, playlistIds.length);
  }

  let newLikedFingerprint = cache.liked_songs_fingerprint;
  let likedSkipped = false;
  if (cache.scope.include_liked_songs) {
    let fingerprint;
    try {
      fingerprint = await fetchLikedSongsFingerprint(opts.accessToken);
    } catch {
      fingerprint = null;
    }
    const cachedFp = cache.liked_songs_fingerprint;
    if (
      fingerprint &&
      cachedFp &&
      cachedFp.total === fingerprint.total &&
      cachedFp.latest_added_at === fingerprint.latest_added_at
    ) {
      likedSkipped = true;
    } else {
      all.push(...(await fetchLikedSongs(opts.accessToken)));
      if (fingerprint) {
        newLikedFingerprint = {
          total: fingerprint.total,
          latest_added_at: fingerprint.latest_added_at,
          fetched_at: new Date().toISOString(),
        };
      }
    }
    onProgress("liked", 1, 1);
  }

  // If everything was cached, we have no new tracks to merge — but the
  // pre-existing tracks in cache.tracks remain valid.
  const mergedTracks: typeof cache.tracks = { ...cache.tracks };
  let mergedArtists: typeof cache.artists = { ...cache.artists };
  if (all.length > 0) {
    const unique = dedupeTracks(all);
    const artistIds = Array.from(new Set(unique.map((t) => t.artist_id)));
    onProgress("artists", 0, artistIds.length);
    const artists = await fetchArtists(artistIds, opts.accessToken);
    onProgress("artists", artistIds.length, artistIds.length);

    const now = new Date().toISOString();
    for (const t of unique) {
      if (!mergedTracks[t.id]) {
        mergedTracks[t.id] = {
          artist_id: t.artist_id,
          title: t.title,
          first_seen: now,
        };
      }
    }
    mergedArtists = { ...cache.artists, ...artists };

    await writeCache(
      cachePath,
      patchCache(cache, {
        artists: mergedArtists,
        tracks: mergedTracks,
        playlist_snapshots: newSnapshots,
        liked_songs_fingerprint: newLikedFingerprint,
      }),
    );
  } else {
    // Pure cache hit — still persist any updated snapshots/fingerprint
    await writeCache(
      cachePath,
      patchCache(cache, {
        playlist_snapshots: newSnapshots,
        liked_songs_fingerprint: newLikedFingerprint,
      }),
    );
  }

  const finalTrackCount = Object.keys(mergedTracks).length;
  if (finalTrackCount === 0) {
    throw new Error("EMPTY_LIBRARY");
  }

  console.log(
    `[scan] ${skippedPlaylists}/${playlistIds.length} playlists unchanged${likedSkipped ? ", liked songs unchanged" : ""}, ${all.length} tracks fetched`,
  );

  return {
    unique_tracks: finalTrackCount,
    unique_artists: Object.keys(mergedArtists).length,
  };
}
