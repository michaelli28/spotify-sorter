import { NextResponse } from "next/server";
import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache } from "@/src/lib/cache";
import { withSpotify } from "@/src/lib/spotify/client";
import { appPlaylistMatcher } from "@/src/lib/spotify/library";
import { listOwnedPlaylists } from "@/src/lib/spotify/playlists";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  const session = m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
  try {
    const playlists = await withSpotify(session, listOwnedPlaylists);
    // The app's own playlists aren't sources: scanning them feeds its output
    // back in as input.
    const isAppPlaylist = appPlaylistMatcher(
      await readCache(join(dataDir(), "cache.json")),
    );
    return NextResponse.json({
      playlists: playlists.filter((p) => !isAppPlaylist(p)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
