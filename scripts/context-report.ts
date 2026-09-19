// Day 4: turn data/analysis/context-runs.jsonl into aggregates: score variance
// split into run-to-run noise vs neighbor effect, placement flips per rule,
// top-5 Jaccard, all with bootstrap CIs; plus a spend audit against data/logs.
// Read-only on the cache, runs and logs; writes data/analysis/context-report.json.
// Prints nothing per track.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { dataDir } from "@/src/lib/config/paths";
import { neighborOverlap } from "@/src/lib/analysis/context-layout";
import {
  auditSpend,
  contextMetaPath,
  contextReportPath,
  contextRunsPath,
  linesToRuns,
  readContextMeta,
  readLogRows,
  readRunLines,
} from "@/src/lib/analysis/context-run";
import {
  contextStats,
  PLACEMENT_RULES,
  type ContrastStats,
  type Est,
  type RunMatches,
} from "@/src/lib/analysis/context-stats";

const fmt = (e: Est, digits = 3) =>
  e.value === null
    ? "n/a"
    : `${e.value.toFixed(digits)} [${e.lo?.toFixed(digits) ?? "n/a"}, ${e.hi?.toFixed(digits) ?? "n/a"}]`;

function table(title: string, c: ContrastStats): string {
  const v = c.variance;
  const rows = [
    `### ${title} (${c.tracks} tracks, ${c.pairs} score pairs)`,
    "",
    "| Metric | Noise (A1 vs A2) | Neighbor | Excess |",
    "|---|---|---|---|",
    ...PLACEMENT_RULES.flatMap((rule) => {
      const f = c.flips[rule];
      return [
        `| ${rule} flip share | ${fmt(f.flip_share.noise)} | ${fmt(f.flip_share.neighbor)} | ${fmt(f.flip_share.neighbor_excess)} |`,
        `| ${rule} tracks changed | ${fmt(f.tracks_changed.noise)} | ${fmt(f.tracks_changed.neighbor)} | ${fmt(f.tracks_changed.neighbor_excess)} |`,
      ];
    }),
    `| top-5 Jaccard | ${fmt(c.jaccard.noise)} | ${fmt(c.jaccard.neighbor)} | ${fmt(c.jaccard.neighbor_excess)} |`,
    "",
    `Score variance: noise ${fmt(v.noise, 2)}, cross ${fmt(v.cross, 2)}, neighbor ${fmt(v.neighbor, 2)}, neighbor share ${fmt(v.neighbor_share)}; dropout ${fmt(v.dropout_share)}.`,
  ];
  return rows.join("\n");
}

async function main() {
  const dir = dataDir();
  const meta = await readContextMeta(contextMetaPath());
  if (!meta)
    throw new Error(`${contextMetaPath()} is missing: run context-test first`);
  const lines = await readRunLines(contextRunsPath());
  const expected =
    2 * meta.layouts.A.length + meta.layouts.B.length + meta.layouts.C.length;
  const trackIds = meta.layouts.A.flat();

  // L = the Day-3 library run, comparable only over the same category set.
  const cache = await readCache(join(dir, "cache.json"));
  const sameCategories =
    JSON.stringify(Object.keys(cache.categories).sort()) ===
    JSON.stringify([...meta.category_ids].sort());
  const L: RunMatches | undefined = sameCategories
    ? Object.fromEntries(
        trackIds.flatMap((t) => {
          const a = cache.assignments[t];
          return a ? [[t, a.matches]] : [];
        }),
      )
    : undefined;

  const stats = contextStats({
    trackIds,
    categories: meta.category_ids.length,
    runs: { ...linesToRuns(lines), ...(L ? { L } : {}) },
    seed: `${meta.seed}:bootstrap`,
  });
  const generatedAt = new Date().toISOString();
  const report = {
    generated_at: generatedAt,
    batches: { recorded: lines.length, expected },
    a_neighbors_kept: {
      B: neighborOverlap(meta.layouts.A, meta.layouts.B),
      C: neighborOverlap(meta.layouts.A, meta.layouts.C),
    },
    library_run: sameCategories
      ? "included"
      : "skipped: cache categories differ from the run's",
    spend: auditSpend({
      lines,
      rows: await readLogRows(join(dir, "logs")),
      from: meta.created_at,
      to: generatedAt,
    }),
    stats,
  };
  await writeFile(contextReportPath(), JSON.stringify(report, null, 2) + "\n");

  console.log(JSON.stringify(report, null, 2));
  if (lines.length < expected) {
    console.log(`\nIncomplete: ${lines.length}/${expected} batches recorded.`);
  }
  console.log(`\n${table("Context runs", stats.main)}`);
  if (stats.library) {
    console.log(`\n${table("Library run L vs context runs", stats.library)}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
