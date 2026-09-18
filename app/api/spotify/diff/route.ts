import { NextResponse } from "next/server";
import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache } from "@/src/lib/cache";
import { withSpotify } from "@/src/lib/spotify/client";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";
import { dedupeTracks } from "@/src/lib/spotify/dedupe";
import { diffTracks } from "@/src/lib/classification/diff";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const m = /sorter_access_token=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

export async function GET(req: Request) {
  const session = parseSession(req);
  const cache = await readCache(join(dataDir(), "cache.json"));
  const previousIds = Object.keys(cache.tracks);

  const all = await withSpotify(session, async (token) => {
    const out = [];
    for (const id of cache.scope.included_playlist_ids) {
      out.push(...(await fetchPlaylistTracks(id, token)));
    }
    if (cache.scope.include_liked_songs) {
      out.push(...(await fetchLikedSongs(token)));
    }
    return out;
  });
  const currentIds = dedupeTracks(all).map((t) => t.id);
  const diff = diffTracks(previousIds, currentIds);
  const removedExamples = diff.removed
    .slice(0, 5)
    .map((id) => cache.tracks[id]?.title ?? id);
  return NextResponse.json({
    added: diff.added,
    removed: diff.removed,
    removed_examples: removedExamples,
    existing_category_count: Object.keys(cache.categories).length,
    is_first_run: previousIds.length === 0,
  });
}
