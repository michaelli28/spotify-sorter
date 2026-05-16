import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
  const jar = await cookies();
  const accessToken = jar.get("sorter_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "no_access_token" }, { status: 401 });
  }
  try {
    const tracks = liked
      ? await fetchLikedSongs(accessToken)
      : await fetchPlaylistTracks(playlistId!, accessToken);
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
