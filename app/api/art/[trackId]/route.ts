import { NextResponse } from "next/server";
import { readArtwork, recordArtwork } from "@/src/lib/artwork/store";
import {
  ArtFetchError,
  fetchThumbnail,
  isAllowedArtUrl,
} from "@/src/lib/artwork/oembed";

export const dynamic = "force-dynamic";

const TRACK_ID = /^[A-Za-z0-9]{22}$/;
const NO_ART_RETRY_MS = 24 * 60 * 60 * 1000;

const redirect = (url: string) =>
  new Response(null, {
    status: 302,
    headers: { location: url, "cache-control": "private, max-age=86400" },
  });
const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

// The src of every <AlbumArt>. A 302 to Spotify's image CDN, or an error the
// <img> answers by showing the plain sleeve. Reads and writes only
// data/artwork.json.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ trackId: string }> },
) {
  // Another website's <img> would otherwise make this server call oEmbed and
  // grow artwork.json. The app's own <img> tags send "same-origin".
  if (req.headers.get("sec-fetch-site") === "cross-site")
    return fail(403, "cross_site");
  const { trackId } = await params;
  if (!TRACK_ID.test(trackId)) return fail(400, "bad_track_id");

  const entry = (await readArtwork()).tracks[trackId];
  // Re-checked on the way out: the store is a file anyone can edit.
  if (entry?.url && isAllowedArtUrl(entry.url)) return redirect(entry.url);
  if (
    entry?.url === null &&
    Date.now() - Date.parse(entry.fetched_at) < NO_ART_RETRY_MS
  )
    return fail(404, "no_art");

  let thumb: string | null;
  try {
    thumb = await fetchThumbnail(trackId);
  } catch (err) {
    if (err instanceof ArtFetchError)
      return fail(err.kind === "timeout" ? 504 : 502, err.kind);
    throw err;
  }
  await recordArtwork(trackId, thumb, new Date().toISOString());
  return thumb ? redirect(thumb) : fail(404, "no_art");
}
