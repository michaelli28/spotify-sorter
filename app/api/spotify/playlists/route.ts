import { NextResponse } from "next/server";
import { withSpotify } from "@/src/lib/spotify/client";
import { listOwnedPlaylists } from "@/src/lib/spotify/playlists";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  const session = m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
  try {
    const playlists = await withSpotify(session, listOwnedPlaylists);
    return NextResponse.json({ playlists });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
