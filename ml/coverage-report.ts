// S1 "Ears", Phase 1 step 3: GATE 1. Preview coverage at library scale.
//
// Reported per TRACK, not per ISRC, because the claim lives on tracks: "on the
// 1,850 songs where Claude saw only a title". 124 ISRCs are shared by two
// cached tracks, so a per-ISRC rate would quietly answer a different question.
//
// Splits are pre-specified by the plan: no-genre vs genre-tagged (the claim only
// lives in the no-genre half) and CJK-titled vs not (130 titles, 4.5% — far too
// few to conclude anything, reported because it was asked for).
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readCache } from "@/src/lib/cache";

const DATA = join(process.cwd(), "data");
const ART = join(process.cwd(), "ml", "artifacts");

interface IsrcRow {
  isrc: string | null;
  duration_ms: number | null;
}
interface DeezerRow {
  status: string;
  preview: string | null;
  duration_flag: boolean;
  duration_s: number | null;
  title: string | null;
  artist: string | null;
}

function hasCjk(s: string): boolean {
  for (const ch of s) {
    const o = ch.codePointAt(0)!;
    if (
      (o >= 0x4e00 && o <= 0x9fff) ||
      (o >= 0x3040 && o <= 0x30ff) ||
      (o >= 0xac00 && o <= 0xd7af) ||
      (o >= 0x3400 && o <= 0x4dbf) ||
      (o >= 0xff66 && o <= 0xff9d)
    )
      return true;
  }
  return false;
}

/** Wilson score interval — honest at the edges of [0,1], unlike the normal
 *  approximation, which is exactly where a 95%-ish gate gets decided. */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}

const pctLine = (label: string, k: number, n: number): string => {
  const [lo, hi] = wilson(k, n);
  return `  ${label.padEnd(22)} ${String(k).padStart(4)}/${String(n).padEnd(4)}  ${((k / n) * 100).toFixed(1).padStart(5)}%  [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]`;
};

async function main() {
  const cache = await readCache(join(DATA, "cache.json"));
  const isrcMap = JSON.parse(
    await readFile(join(ART, "isrc.json"), "utf-8"),
  ) as Record<string, IsrcRow>;
  const deezer = JSON.parse(
    await readFile(join(ART, "deezer.json"), "utf-8"),
  ) as Record<string, DeezerRow>;

  const ids = Object.keys(cache.tracks);
  const hasPreview = (id: string): boolean => {
    const isrc = isrcMap[id]?.isrc;
    if (!isrc) return false;
    const d = deezer[isrc];
    return !!d && d.status === "ok" && !!d.preview;
  };
  const isNoGenre = (id: string): boolean =>
    (cache.artists[cache.tracks[id].artist_id]?.genres ?? []).length === 0;

  const groups: Array<[string, string[]]> = [
    ["ALL TRACKS", ids],
    ["no-genre", ids.filter(isNoGenre)],
    ["genre-tagged", ids.filter((id) => !isNoGenre(id))],
    ["CJK title", ids.filter((id) => hasCjk(cache.tracks[id].title))],
    ["non-CJK title", ids.filter((id) => !hasCjk(cache.tracks[id].title))],
    [
      "no-genre + CJK",
      ids.filter((id) => isNoGenre(id) && hasCjk(cache.tracks[id].title)),
    ],
    [
      "no-genre + non-CJK",
      ids.filter((id) => isNoGenre(id) && !hasCjk(cache.tracks[id].title)),
    ],
  ];

  // A preview that plays the WRONG recording is not coverage for training
  // purposes, so the gate is reported twice: "has a preview", and the stricter
  // "has a preview that also survives the duration audit". Quoting only the
  // looser number would count known-wrong audio as a success.
  const passesAudit = (id: string): boolean => {
    const isrc = isrcMap[id]?.isrc;
    return hasPreview(id) && !!isrc && !deezer[isrc]?.duration_flag;
  };

  console.log("=== GATE 1: Deezer 30-second preview coverage, per track ===");
  console.log("  group                    k/n        pct     95% Wilson");
  const table: Record<string, { k: number; n: number; pct: number }> = {};
  for (const [name, g] of groups) {
    const k = g.filter(hasPreview).length;
    console.log(pctLine(name, k, g.length));
    table[name] = { k, n: g.length, pct: +((k / g.length) * 100).toFixed(2) };
  }

  console.log(
    "\n  --- stricter: preview AND passes the >3s duration audit ---",
  );
  const strict: Record<string, { k: number; n: number; pct: number }> = {};
  for (const [name, g] of groups) {
    const k = g.filter(passesAudit).length;
    console.log(pctLine(name, k, g.length));
    strict[name] = { k, n: g.length, pct: +((k / g.length) * 100).toFixed(2) };
  }

  // Why the misses missed — a coverage number without its causes is not a gate.
  const reason = (id: string): string => {
    const isrc = isrcMap[id]?.isrc;
    if (!isrc) return "no ISRC from Spotify";
    const d = deezer[isrc];
    if (!d) return "ISRC never looked up";
    if (d.status === "ok" && d.preview) return "covered";
    return d.status;
  };
  const tally: Record<string, number> = {};
  for (const id of ids) tally[reason(id)] = (tally[reason(id)] ?? 0) + 1;
  console.log("\n=== why tracks are not covered ===");
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(24)} ${v}`);

  const flagged = ids.filter((id) => {
    const isrc = isrcMap[id]?.isrc;
    return isrc && deezer[isrc]?.duration_flag;
  });
  console.log(
    `\n=== Guard 2: duration audit ===\n  tracks whose Deezer hit differs from Spotify by >3s: ${flagged.length}`,
  );
  for (const id of flagged.slice(0, 12)) {
    const isrc = isrcMap[id]!.isrc!;
    const d = deezer[isrc];
    const sp = (isrcMap[id]!.duration_ms ?? 0) / 1000;
    console.log(
      `    ${cache.tracks[id].title.slice(0, 34).padEnd(34)} spotify ${sp.toFixed(0)}s vs deezer ${d.duration_s}s  (${d.title?.slice(0, 30)})`,
    );
  }

  const mismatch = Object.values(deezer).filter(
    (d) => d.status === "isrc_mismatch",
  ).length;
  console.log(
    `\n=== Guard 1: ISRC echo ===\n  rejected wrong-recording hits: ${mismatch}`,
  );

  const out = join(ART, "coverage.json");
  await writeFile(
    out,
    JSON.stringify(
      {
        table,
        table_passing_duration_audit: strict,
        tally,
        duration_flagged: flagged.length,
        isrc_mismatch: mismatch,
        // Of the 124 ISRCs shared by two tracks, exactly 1 has a >3s spread
        // between its two Spotify durations, so computing this flag once per
        // ISRC can misreport at most 2 of 2,875 tracks. Measured, not assumed.
        duration_flag_computed_per_isrc: true,
      },
      null,
      2,
    ),
    "utf-8",
  );
  console.log(
    `\nwrote ${out}\ncoverage.json sha256: ${createHash("sha256")
      .update(await readFile(out))
      .digest("hex")}`,
  );
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
