import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { dataDir } from "@/src/lib/config/paths";
import { costFromUsage, estimateClassifyCost } from "@/src/lib/llm/cost";
import {
  CLASSIFY_MAX_OUTPUT_TOKENS,
  type BatchResult,
  type ClassifyCategory,
  type ClassifyTrackInput,
} from "@/src/lib/llm/classify";
import type { ContextLayouts } from "./context-layout";
import type { RunMatches } from "./context-stats";

export const contextRunsPath = () =>
  join(dataDir(), "analysis", "context-runs.jsonl");
export const contextMetaPath = () =>
  join(dataDir(), "analysis", "context-meta.json");
export const contextReportPath = () =>
  join(dataDir(), "analysis", "context-report.json");

// A1 and A2 are byte-identical requests (run-to-run noise); B and C give every
// track new neighbors at the same line number. Interleaved so drift over the
// session hits both kinds alike.
export const CONTEXT_RUNS = ["A1", "B", "A2", "C"] as const;
export type ContextRunId = (typeof CONTEXT_RUNS)[number];
const LAYOUT_OF = { A1: "A", B: "B", A2: "A", C: "C" } as const;

const Batches = z.array(z.array(z.string()));
// The design the run lines belong to; a resume must recompute it exactly.
const ContextDesignSchema = z.object({
  seed: z.string(),
  category_ids: z.array(z.string()),
  // The rest of what a request carries (category names and descriptions, track
  // title/artist/genres): a resume must send A2 the same prompt A1 got.
  inputs_sha256: z.string(),
  layouts: z.object({ A: Batches, B: Batches, C: Batches }),
});
type ContextDesign = z.infer<typeof ContextDesignSchema>;
// data/analysis/context-meta.json
export const ContextMetaSchema = ContextDesignSchema.extend({
  // Stamped before the first call: opens the spend-audit window.
  created_at: z.string().datetime(),
});
export type ContextMeta = z.infer<typeof ContextMetaSchema>;

function inputsSha256(
  categories: ClassifyCategory[],
  tracks: ClassifyTrackInput[],
): string {
  // Rebuilt with fixed key order so the hash depends on values only.
  const canonical = {
    categories: categories.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
    tracks: tracks.map(({ id, title, artist_name, genres }) => ({
      id,
      title,
      artist_name,
      genres,
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export const RunLineSchema = z.object({
  run: z.enum(CONTEXT_RUNS),
  batch: z.number().int().min(0),
  track_ids: z.array(z.string()),
  assignments: z.array(
    z.object({
      track_id: z.string(),
      matches: z.array(
        z.object({ category_id: z.string(), score: z.number() }),
      ),
    }),
  ),
  missing: z.array(z.string()),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  }),
  cost_usd: z.number().min(0),
  // Brackets the call: its data/logs row is stamped between the two.
  started_at: z.string().datetime(),
  at: z.string().datetime(),
});
export type RunLine = z.infer<typeof RunLineSchema>;

export type ContextClassify = (call: {
  categories: ClassifyCategory[];
  tracks: ClassifyTrackInput[];
  logPhase: "context-test";
}) => Promise<BatchResult>;

export interface BatchProgress {
  run: ContextRunId;
  batch: number;
  batches: number;
  sent: number;
  missing: number;
  cost_usd: number;
  spent_usd: number;
}

export interface ContextRunSummary {
  batches_total: number;
  batches_skipped: number;
  batches_run: number;
  // For the batches still to run when this invocation started.
  estimate_usd: { low: number; high: number };
  run_cost_usd: number;
  spent_usd: number;
  missing: Record<ContextRunId, number>;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function readContextMeta(
  path: string,
): Promise<ContextMeta | null> {
  const text = await readText(path);
  return text === null ? null : ContextMetaSchema.parse(JSON.parse(text));
}

// Never skips a bad line: a silently dropped batch would bias every statistic.
export async function readRunLines(path: string): Promise<RunLine[]> {
  const text = await readText(path);
  if (text === null) return [];
  const seen = new Set<string>();
  return text.split("\n").flatMap((raw, i) => {
    if (raw.trim() === "") return [];
    let line: RunLine;
    try {
      line = RunLineSchema.parse(JSON.parse(raw));
    } catch (err) {
      throw new Error(`${path} line ${i + 1}: malformed run line`, {
        cause: err,
      });
    }
    const key = `${line.run}:${line.batch}`;
    if (seen.has(key)) {
      throw new Error(`${path} line ${i + 1}: duplicate ${key}`);
    }
    seen.add(key);
    return [line];
  });
}

const sumCost = (lines: RunLine[]) => lines.reduce((s, l) => s + l.cost_usd, 0);

// The cap is checked against this, not the estimate: the estimate is a mean,
// and one runaway reply (up to max_tokens) must not carry spend past the cap.
// Input is ≈ 3.4k tokens per 50-track call; 10k is a generous allowance.
export const WORST_CASE_CALL_USD = costFromUsage({
  input_tokens: 10_000,
  output_tokens: CLASSIFY_MAX_OUTPUT_TOKENS,
});

export async function runContextTest(opts: {
  classify: ContextClassify;
  tracksById: Record<string, ClassifyTrackInput>;
  categories: ClassifyCategory[];
  layouts: Pick<ContextLayouts, "A" | "B" | "C">;
  seed: string;
  outPath: string;
  metaPath: string;
  capUsd: number;
  // Charged calls in data/logs with no run line (killed before the append);
  // the caller gets it from auditSpend so they count against the cap.
  unrecordedUsd?: number;
  now: () => Date;
  onBatch?: (p: BatchProgress) => void;
}): Promise<ContextRunSummary> {
  const layoutIds = [
    ...new Set([opts.layouts.A, opts.layouts.B, opts.layouts.C].flat(2)),
  ].sort();
  const unknown = layoutIds.filter((id) => !opts.tracksById[id]);
  if (unknown.length > 0) {
    throw new Error(`${unknown.length} layout tracks have no track input`);
  }
  const design: ContextDesign = {
    seed: opts.seed,
    category_ids: opts.categories.map((c) => c.id),
    inputs_sha256: inputsSha256(
      opts.categories,
      layoutIds.map((id) => opts.tracksById[id]!),
    ),
    layouts: { A: opts.layouts.A, B: opts.layouts.B, C: opts.layouts.C },
  };
  const lines = await readRunLines(opts.outPath);
  const stored = await readContextMeta(opts.metaPath);
  if (stored === null && lines.length > 0) {
    throw new Error(
      `${opts.metaPath} is missing but ${opts.outPath} has ${lines.length} batches: can't tell which design they belong to`,
    );
  }
  // Parsing drops created_at, which is when, not what.
  if (
    stored !== null &&
    !isDeepStrictEqual(ContextDesignSchema.parse(stored), design)
  ) {
    throw new Error(
      `${opts.metaPath} doesn't match the seed, layouts, categories and track inputs recomputed now; refusing to mix designs`,
    );
  }

  const all = CONTEXT_RUNS.flatMap((run) =>
    opts.layouts[LAYOUT_OF[run]].map((track_ids, batch) => ({
      run,
      batch,
      track_ids,
    })),
  );
  const done = new Set(lines.map((l) => `${l.run}:${l.batch}`));
  const todo = all.filter((b) => !done.has(`${b.run}:${b.batch}`));

  let spent = sumCost(lines) + (opts.unrecordedUsd ?? 0);
  const estimate = estimateClassifyCost(
    todo.reduce((s, b) => s + b.track_ids.length, 0),
  );
  if (spent + estimate.high > opts.capUsd) {
    throw new Error(
      `cost cap: $${spent.toFixed(4)} spent + up to $${estimate.high.toFixed(4)} for ${todo.length} batches > $${opts.capUsd.toFixed(2)}`,
    );
  }
  if (stored === null) {
    const meta: ContextMeta = {
      ...design,
      created_at: opts.now().toISOString(),
    };
    await mkdir(dirname(opts.metaPath), { recursive: true });
    await writeFile(opts.metaPath, JSON.stringify(meta, null, 2) + "\n");
  }
  await mkdir(dirname(opts.outPath), { recursive: true });

  let runCost = 0;
  for (const b of todo) {
    if (spent + WORST_CASE_CALL_USD > opts.capUsd) {
      throw new Error(
        `cost cap: $${spent.toFixed(4)} spent + up to $${WORST_CASE_CALL_USD.toFixed(4)} for ${b.run} batch ${b.batch} > $${opts.capUsd.toFixed(2)}`,
      );
    }
    const started_at = opts.now().toISOString();
    // One call per batch, no resends: a resend would change the neighbors.
    const result = await opts.classify({
      categories: opts.categories,
      tracks: b.track_ids.map((id) => opts.tracksById[id]!),
      logPhase: "context-test",
    });
    const line: RunLine = {
      ...b,
      assignments: result.assignments,
      missing: result.missing.map((t) => t.id),
      usage: result.usage,
      cost_usd: result.cost_usd,
      started_at,
      at: opts.now().toISOString(),
    };
    await appendFile(opts.outPath, JSON.stringify(line) + "\n", "utf-8");
    lines.push(line);
    spent += line.cost_usd;
    runCost += line.cost_usd;
    opts.onBatch?.({
      run: b.run,
      batch: b.batch,
      batches: opts.layouts[LAYOUT_OF[b.run]].length,
      sent: b.track_ids.length,
      missing: line.missing.length,
      cost_usd: line.cost_usd,
      spent_usd: spent,
    });
  }

  const missing = { A1: 0, B: 0, A2: 0, C: 0 };
  for (const l of lines) missing[l.run] += l.missing.length;
  return {
    batches_total: all.length,
    batches_skipped: all.length - todo.length,
    batches_run: todo.length,
    estimate_usd: estimate,
    run_cost_usd: runCost,
    spent_usd: spent,
    missing,
  };
}

export function linesToRuns(
  lines: RunLine[],
): Record<ContextRunId, RunMatches> {
  const runs: Record<ContextRunId, RunMatches> = {
    A1: {},
    B: {},
    A2: {},
    C: {},
  };
  for (const l of lines) {
    for (const a of l.assignments) runs[l.run][a.track_id] = a.matches;
  }
  return runs;
}

const LogRowSchema = z.object({
  timestamp: z.string(),
  phase: z.string(),
  cost_usd: z.number(),
});
export type LogRow = z.infer<typeof LogRowSchema>;

export async function readLogRows(dir: string): Promise<LogRow[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  const rows: LogRow[] = [];
  for (const f of files) {
    const text = await readFile(join(dir, f), "utf-8");
    text.split("\n").forEach((raw, i) => {
      if (raw.trim() === "") return;
      try {
        rows.push(LogRowSchema.parse(JSON.parse(raw)));
      } catch (err) {
        throw new Error(`${f} line ${i + 1}: malformed log row`, {
          cause: err,
        });
      }
    });
  }
  return rows;
}
export interface SpendAudit {
  window: { from: string; to: string };
  recorded_batches: number;
  recorded_usd: number;
  logged_calls: number;
  logged_usd: number;
  matches: boolean;
}

// Logged context-test calls in [from, to] vs the recorded lines. Pass the
// meta's created_at (before the first call) and the report time: a window
// bounded by the recorded lines misses a call charged but never recorded
// (killed before the append) when it falls before the first or after the last.
export function auditSpend(opts: {
  lines: RunLine[];
  rows: LogRow[];
  from: string;
  to: string;
}): SpendAudit {
  const { lines, from, to } = opts;
  const recorded = sumCost(lines);
  const logged = opts.rows.filter(
    (r) =>
      r.phase === "context-test" && r.timestamp >= from && r.timestamp <= to,
  );
  const loggedUsd = logged.reduce((s, r) => s + r.cost_usd, 0);
  return {
    window: { from, to },
    recorded_batches: lines.length,
    recorded_usd: recorded,
    logged_calls: logged.length,
    logged_usd: loggedUsd,
    matches: Math.abs(recorded - loggedUsd) < 1e-9,
  };
}
