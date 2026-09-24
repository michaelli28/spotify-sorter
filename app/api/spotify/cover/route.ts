import { NextResponse } from "next/server";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, CacheVersionMismatch } from "@/src/lib/cache";
import { rejectUnlessFromApp } from "@/src/lib/http/same-origin";
import { readBodyCapped } from "@/src/lib/http/read-body";
import { withSpotify } from "@/src/lib/spotify/client";
import { RefreshRevokedError } from "@/src/lib/spotify/refresh";
import {
  MAX_COVER_BASE64_BYTES,
  uploadPlaylistCover,
} from "@/src/lib/spotify/cover";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const m = /sorter_access_token=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

const BodySchema = z.object({
  categoryId: z.string().min(1),
  // Bare base64 (no data: prefix). Capping the encoded length also caps the
  // decoded JPEG below 256 KB.
  jpegBase64: z.base64().min(1).max(MAX_COVER_BASE64_BYTES),
});

// The image plus room for the JSON around it.
const MAX_BODY_BYTES = MAX_COVER_BASE64_BYTES + 1024;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

// Sets the cover of a category's playlist after Apply wrote it. A cover
// failure never fails the Apply; the page reports it on its own line.
// "reconnect" and "missing_scope" both mean only reconnecting can help, so the
// page must not offer Retry for them.
export async function POST(req: Request) {
  const blocked = rejectUnlessFromApp(req);
  if (blocked) return blocked;
  const raw = await readBodyCapped(req, MAX_BODY_BYTES);
  if (raw === null) return fail(413, "too_large");
  const parsed = BodySchema.safeParse(parseJson(raw));
  if (!parsed.success) return fail(400, "bad_body");
  const { categoryId, jpegBase64 } = parsed.data;

  let cache;
  try {
    cache = await readCache(join(dataDir(), "cache.json"));
  } catch (err) {
    if (err instanceof CacheVersionMismatch)
      return fail(409, "cache_version_mismatch");
    throw err;
  }
  const playlistId = cache.categories[categoryId]?.spotify_playlist_id;
  if (!playlistId) return fail(404, "no_playlist");
  // Without the cookie only the stored refresh token can get a token.
  const session = parseSession(req);
  if (!session && !cache.auth) return fail(401, "reconnect");

  // An expired cookie makes withSpotify refresh and re-save cache.json. That
  // write can race a running Apply's: see foundation-data.md, "Known hazard".
  try {
    await withSpotify(session, (token) =>
      uploadPlaylistCover(playlistId, jpegBase64, token),
    );
  } catch (err) {
    if (err instanceof RefreshRevokedError) return fail(401, "reconnect");
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) return fail(403, "missing_scope");
    return fail(502, "upload_failed");
  }
  return NextResponse.json({ ok: true });
}
