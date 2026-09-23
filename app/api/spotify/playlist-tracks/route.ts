import { NextResponse } from "next/server";
import { withSpotify } from "@/src/lib/spotify/client";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const playlistId = url.searchParams.get("id");
  const liked = url.searchParams.get("liked") === "true";
  if (!playlistId && !liked) {
    return NextResponse.json(
      { error: "missing id or liked=true" },
      { status: 400 },
    );
  }
  // Same shape as the other Spotify routes: prefer the cookie, fall back to
  // the stored refresh token. Requiring the cookie made this the only route
  // that broke on localhost (it is host-scoped to 127.0.0.1) and an hour
  // after connecting (Max-Age 3600), while every neighbouring call kept
  // working — so the grid loaded and every preview 401'd.
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  const session = m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
  try {
    const tracks = await withSpotify(session, (token) =>
      liked ? fetchLikedSongs(token) : fetchPlaylistTracks(playlistId!, token),
    );
    return NextResponse.json({
      tracks: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist_name: t.artist_name,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
