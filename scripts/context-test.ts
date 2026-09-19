// Day 4: does a song's score depend on its batch neighbors? Runs A1, B, A2, C
// (4 x 50-track batches of the ~300 label-sample songs) at temperature 0. Live
// Anthropic spend, capped at $1.00 (≈ $0.70 expected); every call is logged to
// data/logs as phase "context-test". Resumable: rerun to finish after a
// failure. Reads data/cache.json only; prints nothing per track.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { dataDir } from "@/src/lib/config/paths";
import { LABEL_SEED, LabelSampleSchema } from "@/src/lib/labeling/schema";
import { samplePath } from "@/src/lib/labeling/paths";
import { classifyBatch } from "@/src/lib/llm/classify";
import { estimateClassifyCost } from "@/src/lib/llm/cost";
import { buildLayouts } from "@/src/lib/analysis/context-layout";
import {
  CONTEXT_RUNS,
  auditSpend,
  contextMetaPath,
  contextRunsPath,
  readContextMeta,
  readLogRows,
  readRunLines,
  runContextTest,
} from "@/src/lib/analysis/context-run";

const CAP_USD = 1.0;

process.loadEnvFile(".env.local");

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env.local");
  const cache = await readCache(join(dataDir(), "cache.json"));
  const sample = LabelSampleSchema.parse(
    JSON.parse(await readFile(samplePath(), "utf-8")),
  );
  const subset = [
    ...new Set([
      ...sample.random_track_ids,
      ...sample.pairs.map((p) => p.track_id),
    ]),
  ];
  const absent = subset.filter((id) => !cache.tracks[id]).length;
  if (absent > 0)
    throw new Error(`${absent} sampled tracks are not in the cache`);

  const tracksById = Object.fromEntries(
    subset.map((id) => {
      const t = cache.tracks[id]!;
      const a = cache.artists[t.artist_id];
      return [
        id,
        {
          id,
          title: t.title,
          artist_name: a?.name ?? "",
          genres: a?.genres ?? [],
        },
      ];
    }),
  );
  const categories = Object.entries(cache.categories).map(([id, c]) => ({
    id,
    name: c.name,
    description: c.description,
  }));
  const seed = `${LABEL_SEED}:context`;
  const layouts = buildLayouts({ trackIds: subset, seed });
  const slots = subset.length * CONTEXT_RUNS.length;
  const full = estimateClassifyCost(slots);
  console.log({
    tracks: subset.length,
    categories: categories.length,
    batches_per_run: layouts.A.length,
    batch_sizes: [...new Set(layouts.A.map((b) => b.length))],
    unmoved_tracks: layouts.unmoved.length,
    a_neighbors_kept: {
      B: +layouts.neighborOverlap.B.toFixed(3),
      C: +layouts.neighborOverlap.C.toFixed(3),
      expected: +(1 / (layouts.A.length - 1)).toFixed(3),
    },
    full_estimate_usd: {
      low: +full.low.toFixed(4),
      high: +full.high.toFixed(4),
    },
    cap_usd: CAP_USD,
  });

  const unrecordedUsd = await unrecordedSpend();
  if (unrecordedUsd > 0) {
    console.log(`charged but unrecorded so far: $${unrecordedUsd.toFixed(4)}`);
  }

  const start = Date.now();
  const summary = await runContextTest({
    unrecordedUsd,
    classify: (call) => classifyBatch({ apiKey, ...call }),
    tracksById,
    categories,
    layouts,
    seed,
    outPath: contextRunsPath(),
    metaPath: contextMetaPath(),
    capUsd: CAP_USD,
    now: () => new Date(),
    onBatch: (p) =>
      console.log(
        `${p.run} batch ${p.batch + 1}/${p.batches}: ${p.sent} sent, ${p.missing} missing, $${p.cost_usd.toFixed(4)} (total $${p.spent_usd.toFixed(4)}, ${Math.round((Date.now() - start) / 1000)}s)`,
      ),
  });
  const { low, high } = summary.estimate_usd;
  console.log({
    ...summary,
    run_cost_usd: +summary.run_cost_usd.toFixed(6),
    spent_usd: +summary.spent_usd.toFixed(6),
    estimate_usd: { low: +low.toFixed(6), high: +high.toFixed(6) },
    // Checks the Day-3 per-track cost range on a later run.
    cost_within_estimate:
      summary.batches_run === 0
        ? null
        : summary.run_cost_usd >= low && summary.run_cost_usd <= high,
  });
}

// On a resume, a call charged but killed before its run line was written
// still counts against the cap.
async function unrecordedSpend(): Promise<number> {
  const meta = await readContextMeta(contextMetaPath());
  if (!meta) return 0;
  const audit = auditSpend({
    lines: await readRunLines(contextRunsPath()),
    rows: await readLogRows(join(dataDir(), "logs")),
    from: meta.created_at,
    to: new Date().toISOString(),
  });
  return Math.max(0, audit.logged_usd - audit.recorded_usd);
}

main().catch((err: unknown) => {
  console.error(
    "context test failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
