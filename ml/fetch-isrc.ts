// S1 "Ears", Phase 1 step 1: give every cached track an ISRC.
//
// An ISRC is the recording's global id, so Deezer can be asked for the SAME
// recording rather than something with a similar title. data/cache.json stores
// no ISRC (TrackSchema is artist_id, title, first_seen), so they must be fetched.
//
// Two deliberate departures from the plan, both recorded in the notes:
//
//   1. It reads GET /tracks?ids= over the 2,875 ids already in the cache, not
//      GET /me/tracks. /me/tracks is Liked Songs only, but the library also
//      holds playlist tracks, and "what is liked today" is not "what is in the
//      cache". Batching the cached ids covers exactly the right set in 58 calls.
//
//   2. It keeps duration_ms. The cache has none, which is why "match by
//      duration" was ruled out as a MATCHING key. As an AUDIT it still works:
//      match by ISRC, then flag any Deezer hit whose duration disagrees, which
//      is how a slowed/sped-up/live re-upload gives itself away.
//
// TOKEN SAFETY. This app uses PKCE, where Spotify may return a rotated refresh
// token and invalidate the old one. Rotation happens server-side the instant we
// refresh, so declining to save the new token does not protect the old one, it
// just loses the account. Hence: refresh exactly ONCE per run, and write back
// ONLY when the token actually changed, touching only `auth`. Michael approved
// exactly this on 2026-09-19. Every other byte of cache.json is left alone, and
// sha256(assignments) is checked before and after to prove the teacher targets
// (the September 41-category run) did not move.
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { readCache, writeCache, patchCache, type Cache } from "@/src/lib/cache";
import { refreshAccessToken } from "@/src/lib/spotify/refresh";
import { spotifyApi } from "@/src/lib/spotify/urls";

process.loadEnvFile(".env.local");

const DATA = join(process.cwd(), "data");
const CACHE_PATH = join(DATA, "cache.json");
const OUT_DIR = join(process.cwd(), "ml", "artifacts");
const OUT_PATH = join(OUT_DIR, "isrc.json");
const BATCH = 50; // Spotify's documented maximum for /tracks?ids=

interface TrackIsrc {
  isrc: string | null;
  duration_ms: number | null;
  spotify_name: string;
  is_playable: boolean | null;
}

const assignmentsSha = (cache: Cache): string =>
  createHash("sha256").update(JSON.stringify(cache.assignments)).digest("hex");

/** Deep key-sorted JSON, so two files compare equal iff their CONTENT matches
 *  regardless of key order. Used to prove a write touched only `auth`. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** CJK ranges, used only to split the coverage report — never to filter. */
function hasCjk(s: string): boolean {
  for (const ch of s) {
    const o = ch.codePointAt(0)!;
    if (
      (o >= 0x4e00 && o <= 0x9fff) || // CJK unified
      (o >= 0x3040 && o <= 0x30ff) || // kana
      (o >= 0xac00 && o <= 0xd7af) || // hangul
      (o >= 0x3400 && o <= 0x4dbf) || // CJK ext A
      (o >= 0xff66 && o <= 0xff9d) // halfwidth kana
    )
      return true;
  }
  return false;
}

async function getJson(
  url: string,
  token: string,
  attempt = 0,
): Promise<Record<string, unknown>> {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 429) {
    // Spotify's Retry-After is in seconds and it means it; be polite, not clever.
    // Bounded: this used to recurse with the SAME attempt counter, so a
    // persistent 429 would retry for ever instead of failing the run.
    if (attempt >= 5)
      throw new Error("Spotify kept returning 429 after 5 waits");
    const wait = Number(r.headers.get("retry-after") ?? "2") + 1;
    console.log(
      `  429 from Spotify, sleeping ${wait}s (attempt ${attempt + 1})`,
    );
    await new Promise((res) => setTimeout(res, wait * 1000));
    return getJson(url, token, attempt + 1);
  }
  if (!r.ok) {
    if (attempt < 3 && r.status >= 500) {
      await new Promise((res) => setTimeout(res, 2 ** attempt * 1000));
      return getJson(url, token, attempt + 1);
    }
    throw new Error(`GET ${url.split("?")[0]} failed: ${r.status}`);
  }
  return (await r.json()) as Record<string, unknown>;
}

async function main() {
  const cache = await readCache(CACHE_PATH);
  if (!cache.auth) throw new Error("No Spotify auth in cache — connect first.");

  const shaBefore = assignmentsSha(cache);
  const design = JSON.parse(
    await readFile(join(DATA, "labels", "sample-design.json"), "utf-8"),
  ) as { assignments_sha256: string };
  console.log(`assignments sha256 : ${shaBefore.slice(0, 12)}…`);
  console.log(
    `pre-registered     : ${design.assignments_sha256.slice(0, 12)}…`,
  );
  if (shaBefore !== design.assignments_sha256) {
    throw new Error(
      "Teacher targets have MOVED since the gold set was pre-registered. Stop and re-derive.",
    );
  }
  console.log("teacher targets    : intact ✅\n");

  // ---- the single refresh -------------------------------------------------
  console.log("Refreshing Spotify access token (once, in memory)…");
  const fresh = await refreshAccessToken({
    clientId: process.env.SPOTIFY_CLIENT_ID!,
    refreshToken: cache.auth.refresh_token,
  });
  const rotated = fresh.refresh_token !== cache.auth.refresh_token;
  console.log(`Spotify rotated the refresh token: ${rotated ? "YES" : "no"}`);

  if (rotated) {
    // Not writing this back would strand the account on a token Spotify has
    // already retired. Only `auth` changes; patchCache leaves the rest as-is.
    //
    // The check below deliberately reads the RAW FILE on both sides rather
    // than comparing two readCache() results. writeCache re-serialises the
    // whole file through a Zod schema that strips unknown keys, and a check
    // that parses through that same schema can never notice what the schema
    // removed. Canonicalising (deep key sort) makes the comparison immune to
    // harmless reordering while still catching any real content change.
    const rawBefore = await readFile(CACHE_PATH, "utf-8");
    await writeCache(
      CACHE_PATH,
      patchCache(cache, {
        auth: {
          refresh_token: fresh.refresh_token,
          expires_at: fresh.expires_at,
        },
      }),
    );
    const rawAfter = await readFile(CACHE_PATH, "utf-8");
    const withoutAuth = (text: string): string => {
      const o = JSON.parse(text) as Record<string, unknown>;
      delete o.auth;
      return canonical(o);
    };
    const intact = withoutAuth(rawBefore) === withoutAuth(rawAfter);
    console.log(
      `  wrote back auth only. everything else byte-identical: ${intact ? "YES ✅" : "NO ❌"}`,
    );
    if (!intact) {
      throw new Error(
        "The write changed something other than `auth`. data/cache.json belongs to the other session — stop and inspect before continuing.",
      );
    }
    const shaAfter = assignmentsSha(await readCache(CACHE_PATH));
    if (shaAfter !== shaBefore) throw new Error("Write moved the assignments!");
  } else {
    console.log("  nothing written to data/cache.json ✅");
  }
  const token = fresh.access_token;

  // ---- probe before spending 58 calls -------------------------------------
  const ids = Object.keys(cache.tracks);
  console.log(`\n${ids.length} tracks in cache. Probing response shape…`);
  const probe = await getJson(
    spotifyApi(`/tracks?ids=${ids.slice(0, 3).join(",")}`),
    token,
  );
  const probeTracks = (probe.tracks ?? []) as Array<Record<string, unknown>>;
  const first = probeTracks[0] ?? {};
  const hasExternalIds = "external_ids" in first;
  console.log(`  external_ids present : ${hasExternalIds}`);
  console.log(
    `  isrc present         : ${!!(first.external_ids as Record<string, unknown>)?.isrc}`,
  );
  console.log(`  duration_ms present  : ${"duration_ms" in first}`);
  if (!hasExternalIds) {
    throw new Error(
      "Spotify is NOT returning external_ids. The removal was not reverted; ISRC matching is blocked. Stopping before spending 58 calls.",
    );
  }

  // ---- the full sweep -----------------------------------------------------
  const out: Record<string, TrackIsrc> = {};
  await mkdir(OUT_DIR, { recursive: true });
  const batches = Math.ceil(ids.length / BATCH);
  for (let b = 0; b < batches; b++) {
    const slice = ids.slice(b * BATCH, (b + 1) * BATCH);
    const json = await getJson(
      spotifyApi(`/tracks?ids=${slice.join(",")}`),
      token,
    );
    const rows = (json.tracks ?? []) as Array<Record<string, unknown> | null>;
    slice.forEach((id, i) => {
      const t = rows[i];
      out[id] = {
        isrc: t
          ? (((t.external_ids as Record<string, unknown>)?.isrc as string) ??
            null)
          : null,
        duration_ms: t ? ((t.duration_ms as number) ?? null) : null,
        spotify_name: t ? ((t.name as string) ?? "") : "",
        is_playable: t ? ((t.is_playable as boolean) ?? null) : null,
      };
    });
    if (b % 10 === 9 || b === batches - 1) {
      // Progress snapshot, NOT a resume point: this script always re-fetches
      // all 58 batches from scratch (they take ~40s, so resuming is not worth
      // the correctness risk of a partial file being mistaken for the library).
      // Written atomically so a crash mid-write cannot destroy a good file.
      const tmp = `${OUT_PATH}.tmp-${randomBytes(6).toString("hex")}`;
      await writeFile(tmp, JSON.stringify(out, null, 2), "utf-8");
      await rename(tmp, OUT_PATH);
      console.log(
        `  batch ${b + 1}/${batches} — ${Object.keys(out).length} tracks, checkpointed`,
      );
    }
  }

  // ---- report, split the way the gate asks for ----------------------------
  const withIsrc = (id: string) => !!out[id]?.isrc;
  const noGenre = ids.filter(
    (id) =>
      (cache.artists[cache.tracks[id].artist_id]?.genres ?? []).length === 0,
  );
  const genreTagged = ids.filter((id) => !noGenre.includes(id));
  const cjk = ids.filter((id) => hasCjk(cache.tracks[id].title));

  const pct = (a: string[]) =>
    `${a.filter(withIsrc).length}/${a.length} (${((a.filter(withIsrc).length / a.length) * 100).toFixed(1)}%)`;

  console.log("\n=== ISRC coverage (Spotify side) ===");
  console.log(`  all tracks   : ${pct(ids)}`);
  console.log(`  no-genre     : ${pct(noGenre)}`);
  console.log(`  genre-tagged : ${pct(genreTagged)}`);
  console.log(`  CJK title    : ${pct(cjk)}`);
  console.log(`\nwrote ${OUT_PATH}`);
  const sha = createHash("sha256")
    .update(await readFile(OUT_PATH))
    .digest("hex");
  console.log(`isrc.json sha256: ${sha}`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
