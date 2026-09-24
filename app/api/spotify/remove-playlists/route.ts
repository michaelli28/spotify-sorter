import { NextResponse } from "next/server";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "@/src/lib/config/paths";
import {
  readCache,
  writeCache,
  patchCache,
  CacheVersionMismatch,
} from "@/src/lib/cache";
import { rejectUnlessFromApp } from "@/src/lib/http/same-origin";
import { readBodyCapped } from "@/src/lib/http/read-body";
import { isApplyRunning } from "@/src/lib/pipeline/apply-running";
import { withSpotify } from "@/src/lib/spotify/client";
import { RefreshRevokedError } from "@/src/lib/spotify/refresh";
import {
  listManagedPlaylists,
  removePlaylistsFromLibrary,
  type RemoveResult,
} from "@/src/lib/spotify/library";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const m = /sorter_access_token=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

const MAX_IDS = 1000;
const MAX_ID_LENGTH = 64;

const BodySchema = z.object({
  ids: z.array(z.string().min(1).max(MAX_ID_LENGTH)).min(1).max(MAX_IDS),
});

// The largest valid body: every id quoted, with a comma, plus the wrapper.
const MAX_BODY_BYTES = MAX_IDS * (MAX_ID_LENGTH + 3) + 64;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

// One write: re-read first, so a token refresh or an edit that landed while
// Spotify was removing survives, and clear only the ids that actually went.
async function forgetRemovedPlaylists(removed: string[]): Promise<void> {
  const path = join(dataDir(), "cache.json");
  const cache = await readCache(path);
  const gone = new Set(removed);
  const cleared = Object.entries(cache.categories).filter(
    ([, c]) => c.spotify_playlist_id && gone.has(c.spotify_playlist_id),
  );
  if (cleared.length === 0) return;
  await writeCache(
    path,
    patchCache(cache, {
      categories: Object.fromEntries(
        cleared.map(([id, c]) => [id, { ...c, spotify_playlist_id: null }]),
      ),
    }),
  );
}

// "Remove SpotifySorter playlists": takes them out of the owner's library
// (restorable for 90 days). The server recomputes what may be removed, so the
// page can never remove an arbitrary playlist. Same error contract as the
// cover route: "reconnect" and "missing_scope" mean only reconnecting helps.
// Refused while Apply runs: its end-of-run write would restore the ids this
// clears.
export async function POST(req: Request) {
  const blocked = rejectUnlessFromApp(req);
  if (blocked) return blocked;
  if (isApplyRunning()) return fail(409, "apply_running");
  const raw = await readBodyCapped(req, MAX_BODY_BYTES);
  if (raw === null) return fail(413, "too_large");
  const parsed = BodySchema.safeParse(parseJson(raw));
  if (!parsed.success) return fail(400, "bad_body");
  const ids = [...new Set(parsed.data.ids)];

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

  let outcome: { outside: string[] } | { result: RemoveResult };
  try {
    outcome = await withSpotify(session, async (token) => {
      const managed = await listManagedPlaylists(token, cache);
      const allowed = new Set(managed.map((p) => p.id));
      const outside = ids.filter((id) => !allowed.has(id));
      if (outside.length > 0) return { outside };
      return { result: await removePlaylistsFromLibrary(token, ids) };
    });
  } catch (err) {
    if (err instanceof RefreshRevokedError) return fail(401, "reconnect");
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) return fail(403, "missing_scope");
    return fail(502, "remove_failed");
  }
  if ("outside" in outcome) {
    return NextResponse.json(
      { error: "not_managed", ids: outcome.outside },
      { status: 400 },
    );
  }

  const { removed, failed } = outcome.result;
  // Spotify has already removed them: say so even if the cache can't be
  // updated, rather than a 500 the page would read as "Couldn't remove them".
  if (removed.length > 0) {
    await forgetRemovedPlaylists(removed).catch((err: unknown) => {
      console.error(
        "remove-playlists: removed, but cache.json kept their ids",
        err,
      );
    });
  }
  if (removed.length === 0 && failed.some((f) => f.reason === "missing_scope"))
    return fail(403, "missing_scope");
  return NextResponse.json({ removed, failed });
}
