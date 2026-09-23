import { NextResponse } from "next/server";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, CacheVersionMismatch } from "@/src/lib/cache";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";
import { filterBlind } from "@/src/lib/labeling/blind";

export const dynamic = "force-dynamic";

const LimitSchema = z.coerce.number().int().min(1).max(200);

// Read-only (readCache, never withSpotify): the diff page's list of tracks
// waiting to be sorted, newest scan first. `total` counts every unsorted
// track; the list drops the labelling sample's songs, so it can be shorter
// than `total` implies.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("limit");
  const limit =
    raw === null
      ? { success: true as const, data: 50 }
      : LimitSchema.safeParse(raw);
  if (!limit.success)
    return NextResponse.json({ error: "bad_limit" }, { status: 400 });

  let cache;
  try {
    cache = await readCache(join(dataDir(), "cache.json"));
  } catch (err) {
    if (err instanceof CacheVersionMismatch)
      return NextResponse.json(
        { error: "cache_version_mismatch" },
        { status: 409 },
      );
    throw err;
  }
  const unsorted = unsortedTrackIds(cache);
  // One scan stamps all its tracks at once, so the stable sort keeps Spotify's
  // order inside a scan. Sorted before the cut: past `limit`, older leftovers
  // must not push the latest scan out.
  const seen = (id: string) => Date.parse(cache.tracks[id]!.first_seen);
  const newestFirst = [...unsorted].sort((a, b) => seen(b) - seen(a));
  const shown = (await filterBlind(newestFirst)).slice(0, limit.data);
  return NextResponse.json({
    total: unsorted.length,
    tracks: shown.map((id) => {
      const track = cache.tracks[id]!;
      return {
        id,
        title: track.title,
        artist: cache.artists[track.artist_id]?.name ?? "",
      };
    }),
  });
}
