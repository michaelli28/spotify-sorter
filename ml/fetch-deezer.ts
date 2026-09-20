// S1 "Ears", Phase 1 steps 2-3: ISRC -> Deezer track -> 30-second preview URL.
// This script fetches METADATA ONLY. No audio is downloaded here.
//
// Exact ISRC lookup, never fuzzy title matching: a title search happily returns
// a slowed/sped-up/live re-upload, and training on the wrong recording is a
// silent poisoning that no downstream metric would reveal.
//
// TWO GUARDS, because "exact lookup" is not self-verifying:
//
//   Guard 1 (ISRC echo). A previous session recorded that Deezer "returns a
//   real track for a fake code". Measured here, the mechanism is different and
//   the distinction matters: Deezer matches exactly and echoes the queried code
//   back, and a truly unknown code gives error 800 (the canary below). What is
//   real is that some genuine tracks were uploaded carrying PLACEHOLDER ISRCs,
//   so a garbage code can be a real stored value. The exposure is therefore
//   placeholder codes in OUR input, not invention on Deezer's side. This
//   library does contain 14 odd-looking codes (3 with an AAA registrant, 6 on
//   a ZZ country code, 5 with low-entropy suffixes) — so the claim is not
//   "there are none", it is that all 14 were checked against the returned
//   TITLE and every one resolved to the right recording. Pattern-matching
//   ISRCs would not have shown that; comparing titles did.
//   The echo check stays because it is free and makes the claim defensible.
//
//   Guard 2 (duration audit). data/cache.json has no duration, which is why
//   "match by duration +/-3s" died as a MATCHING key. As an AUDIT it survives:
//   ml/fetch-isrc.ts kept Spotify's duration_ms, so a hit whose length disagrees
//   with Spotify by more than 3s gets flagged. That is exactly how an edit,
//   a radio cut or a sped-up re-upload betrays itself.
//
// Rejected and flagged hits are counted in the report, never silently dropped.
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";

const OUT_DIR = join(process.cwd(), "ml", "artifacts");
const IN_PATH = join(OUT_DIR, "isrc.json");
const OUT_PATH = join(OUT_DIR, "deezer.json");

// Deezer's published guidance is 50 requests / 5 s per IP. Sit well under it:
// throttling is the schedule risk, and being rude costs more time than it saves.
const CONCURRENCY = 6;
const MIN_INTERVAL_MS = 120;
const DURATION_TOLERANCE_MS = 3000;

interface IsrcRow {
  isrc: string | null;
  duration_ms: number | null;
  spotify_name: string;
}

interface DeezerRow {
  status: "ok" | "no_preview" | "not_found" | "isrc_mismatch" | "error";
  deezer_id: number | null;
  preview: string | null;
  duration_s: number | null;
  title: string | null;
  artist: string | null;
  returned_isrc: string | null;
  duration_flag: boolean;
  detail: string | null;
}

/** Atomic: six workers checkpoint the same path, and a torn JSON file would
 *  lose the whole sweep on the next resume. */
async function checkpoint(out: Record<string, DeezerRow>): Promise<void> {
  const tmp = `${OUT_PATH}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, JSON.stringify(out, null, 2), "utf-8");
  await rename(tmp, OUT_PATH);
}

/** Spotify hands back ISRCs in whatever shape the distributor typed them.
 *  This library contains 4 lowercase and 3 hyphenated ones. Deezer normalises
 *  CASE but not HYPHENS, so `GB-SMU-13-44223` 404s while `GBSMU1344223` is a
 *  real track with a preview — 3 songs recovered for one `replace`. */
const normalizeIsrc = (s: string): string => s.replace(/-/g, "").toUpperCase();

// Each caller RESERVES its slot synchronously, before any await. The obvious
// version — read lastCall, sleep, then write it — does not serialise: all six
// workers read the same value, sleep the same amount and fire simultaneously,
// so the sweep runs at roughly 6x the intended rate. That is what the first
// full sweep actually did (it drew no 429s and no code-4 quota errors, but it
// was not the polite pacing this constant claims).
let nextSlot = 0;
async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  return fn();
}

async function deezerByIsrc(
  isrc: string,
  attempt = 0,
): Promise<Record<string, unknown>> {
  const r = await paced(() =>
    fetch(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(normalizeIsrc(isrc))}`,
    ),
  );
  if (r.status === 429 || r.status >= 500) {
    if (attempt < 5) {
      const backoff = 2 ** attempt * 1000;
      await new Promise((res) => setTimeout(res, backoff));
      return deezerByIsrc(isrc, attempt + 1);
    }
    throw new Error(`HTTP ${r.status} after retries`);
  }
  const json = (await r.json()) as Record<string, unknown>;
  // Deezer signals quota exhaustion inside a 200 body, not by status code.
  const err = json.error as { code?: number; message?: string } | undefined;
  if (err?.code === 4 && attempt < 5) {
    await new Promise((res) => setTimeout(res, 2 ** attempt * 1000));
    return deezerByIsrc(isrc, attempt + 1);
  }
  return json;
}

function classify(
  json: Record<string, unknown>,
  wantIsrc: string,
  spotifyMs: number | null,
): DeezerRow {
  const base: DeezerRow = {
    status: "error",
    deezer_id: null,
    preview: null,
    duration_s: null,
    title: null,
    artist: null,
    returned_isrc: null,
    duration_flag: false,
    detail: null,
  };
  const err = json.error as
    | { code?: number; message?: string; type?: string }
    | undefined;
  if (err) {
    return {
      ...base,
      status: err.code === 800 || err.code === 300 ? "not_found" : "error",
      detail:
        `${err.type ?? "error"} ${err.code ?? ""} ${err.message ?? ""}`.trim(),
    };
  }
  if (!json.id)
    return { ...base, status: "not_found", detail: "no id in body" };

  const returned = (json.isrc as string | undefined) ?? null;
  const row: DeezerRow = {
    ...base,
    deezer_id: json.id as number,
    preview: (json.preview as string) || null,
    duration_s: (json.duration as number) ?? null,
    title: (json.title as string) ?? null,
    artist: ((json.artist as Record<string, unknown>)?.name as string) ?? null,
    returned_isrc: returned,
    status: "ok",
  };

  // Guard 1: Deezer must hand back the recording we actually asked for.
  if (returned && normalizeIsrc(returned) !== normalizeIsrc(wantIsrc)) {
    return {
      ...row,
      status: "isrc_mismatch",
      detail: `asked ${wantIsrc}, got ${returned}`,
    };
  }
  // Guard 2: length disagreement means a different cut of the same work.
  if (spotifyMs != null && row.duration_s != null) {
    row.duration_flag =
      Math.abs(row.duration_s * 1000 - spotifyMs) > DURATION_TOLERANCE_MS;
  }
  if (!row.preview) return { ...row, status: "no_preview" };
  return row;
}

/** A made-up but well-formed ISRC. Error 800 means unknown codes are rejected
 *  rather than approximated. A track coming back would mean this code is a
 *  placeholder some distributor really used. */
async function fakeIsrcCanary(): Promise<string> {
  const fake = "ZZ9Q99999999";
  try {
    const json = await deezerByIsrc(fake);
    if (json.error) {
      const e = json.error as { code?: number; message?: string };
      return `rejected it (error ${e.code}: ${e.message}) — unknown codes are not approximated`;
    }
    return `RETURNED A TRACK (id ${json.id}, "${json.title}", isrc ${json.isrc}) — this code is a real placeholder in Deezer's catalogue`;
  } catch (e) {
    return `canary failed: ${e instanceof Error ? e.message : e}`;
  }
}

async function main() {
  const isrcMap = JSON.parse(await readFile(IN_PATH, "utf-8")) as Record<
    string,
    IsrcRow
  >;

  console.log("=== fake-ISRC canary (measure, do not assume) ===");
  console.log(`  ZZ9Q99999999 -> ${await fakeIsrcCanary()}\n`);

  // One lookup per distinct recording, not per cached row: 124 ISRCs are shared
  // by more than one Spotify id (single vs album), and re-asking would be waste.
  const byIsrc = new Map<string, number | null>();
  for (const row of Object.values(isrcMap)) {
    if (!row.isrc) continue;
    if (!byIsrc.has(row.isrc)) byIsrc.set(row.isrc, row.duration_ms);
  }
  const isrcs = [...byIsrc.keys()];
  console.log(`${isrcs.length} distinct ISRCs to look up.`);

  // Resume: a restart must not redo a sweep that throttling interrupted.
  // Only SETTLED outcomes are kept. "error" means the transport failed and the
  // ISRC was never really asked — keeping those would bake a network outage
  // into the coverage number, which is how a gate gets passed dishonestly.
  const SETTLED = new Set(["ok", "no_preview", "not_found", "isrc_mismatch"]);
  let out: Record<string, DeezerRow> = {};
  try {
    out = JSON.parse(await readFile(OUT_PATH, "utf-8")) as Record<
      string,
      DeezerRow
    >;
    const keep = Object.entries(out).filter(([, v]) => SETTLED.has(v.status));
    const drop = Object.keys(out).length - keep.length;
    out = Object.fromEntries(keep);
    console.log(
      `  resuming: ${keep.length} settled kept, ${drop} unsettled dropped for retry`,
    );
  } catch {
    await mkdir(OUT_DIR, { recursive: true });
  }
  const todo = isrcs.filter((i) => !(i in out));
  console.log(`  ${todo.length} to fetch\n`);

  let done = 0;
  let lastCheckpoint = 0;
  const queue = [...todo];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const isrc = queue.shift();
      if (!isrc) return;
      try {
        out[isrc] = classify(
          await deezerByIsrc(isrc),
          isrc,
          byIsrc.get(isrc) ?? null,
        );
      } catch (e) {
        out[isrc] = {
          status: "error",
          deezer_id: null,
          preview: null,
          duration_s: null,
          title: null,
          artist: null,
          returned_isrc: null,
          duration_flag: false,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
      done++;
      // >= rather than %, because six workers increment concurrently and a
      // modulo test can step straight over its own checkpoint.
      if (done - lastCheckpoint >= 200) {
        lastCheckpoint = done;
        await checkpoint(out);
        console.log(`  ${done}/${todo.length} fetched, checkpointed`);
      }
    }
  });
  await Promise.all(workers);
  await checkpoint(out);

  const tally: Record<string, number> = {};
  for (const r of Object.values(out))
    tally[r.status] = (tally[r.status] ?? 0) + 1;
  console.log("\n=== per-ISRC outcome ===");
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
  console.log(
    `  duration-flagged (>3s vs Spotify): ${Object.values(out).filter((r) => r.duration_flag).length}`,
  );
  const sha = createHash("sha256")
    .update(await readFile(OUT_PATH))
    .digest("hex");
  console.log(`\nwrote ${OUT_PATH}`);
  console.log(`deezer.json sha256: ${sha}`);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
