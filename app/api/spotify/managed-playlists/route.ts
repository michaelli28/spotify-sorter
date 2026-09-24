import { NextResponse } from "next/server";
import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, CacheVersionMismatch } from "@/src/lib/cache";
import { rejectUnlessFromApp } from "@/src/lib/http/same-origin";
import { isApplyRunning } from "@/src/lib/pipeline/apply-running";
import { withSpotify } from "@/src/lib/spotify/client";
import { RefreshRevokedError } from "@/src/lib/spotify/refresh";
import { listManagedPlaylists } from "@/src/lib/spotify/library";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const m = /sorter_access_token=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

// What "Remove SpotifySorter playlists" would remove. Spotify reads only, but
// an expired cookie still refreshes the token and re-saves cache.json, so not
// while Apply writes it.
export async function GET(req: Request) {
  const blocked = rejectUnlessFromApp(req);
  if (blocked) return blocked;
  if (isApplyRunning()) return fail(409, "apply_running");

  let cache;
  try {
    cache = await readCache(join(dataDir(), "cache.json"));
  } catch (err) {
    if (err instanceof CacheVersionMismatch)
      return fail(409, "cache_version_mismatch");
    throw err;
  }
  // Without the cookie only the stored refresh token can get a token.
  const session = parseSession(req);
  if (!session && !cache.auth) return fail(401, "reconnect");

  try {
    const playlists = await withSpotify(session, (token) =>
      listManagedPlaylists(token, cache),
    );
    return NextResponse.json({ playlists });
  } catch (err) {
    if (err instanceof RefreshRevokedError) return fail(401, "reconnect");
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) return fail(403, "missing_scope");
    return fail(502, "list_failed");
  }
}
