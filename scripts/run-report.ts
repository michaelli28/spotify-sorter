// Audit the latest classify run: recorded cost vs the sum of every logged call
// in its time window, call count vs batches needed, and the per-track token
// and cost spread across full batches (the basis for the cost estimate).
// Read-only.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";

interface LogLine {
  timestamp: string;
  phase: string;
  input_tokens: number;
  output_tokens: number;
  batch_size: number | null;
  retries: number;
  cost_usd: number;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]!;
};

async function main() {
  const dir = join(process.cwd(), "data");
  const cache = await readCache(join(dir, "cache.json"));
  const run = [...cache.runs].reverse().find((r) => r.type === "classify");
  if (!run?.completed_at) throw new Error("no completed classify run");

  const lines: LogLine[] = [];
  for (const f of await readdir(join(dir, "logs"))) {
    const text = await readFile(join(dir, "logs", f), "utf-8");
    for (const l of text.split("\n").filter(Boolean)) lines.push(JSON.parse(l));
  }
  const inRun = lines.filter(
    (l) =>
      l.phase === "classify" &&
      l.timestamp >= run.started_at &&
      l.timestamp <= run.completed_at!,
  );
  const logged = inRun.reduce((s, l) => s + l.cost_usd, 0);
  const full = inRun.filter((l) => l.batch_size === 50 && l.retries === 0);
  const outPerTrack = full.map((l) => l.output_tokens / 50);
  const inPerCall = full.map((l) => l.input_tokens);
  const costPerTrack = full.map((l) => l.cost_usd / 50);
  const tracks = Object.keys(cache.tracks).length;

  console.log({
    run: {
      started_at: run.started_at,
      completed_at: run.completed_at,
      summary: run.summary,
      skipped: run.skipped?.length ?? 0,
    },
    recorded_cost: +run.cost_usd.toFixed(6),
    logged_cost_in_window: +logged.toFixed(6),
    recorded_equals_logged: Math.abs(run.cost_usd - logged) < 1e-9,
    calls: inRun.length,
    batches_needed_first_round: Math.ceil(tracks / 50),
    resend_calls: inRun.filter((l) => l.retries > 0).length,
    output_share: +(
      inRun.reduce((s, l) => s + (l.output_tokens * 5) / 1e6, 0) / logged
    ).toFixed(3),
    full_batches: full.length,
    out_tokens_per_track: {
      min: +Math.min(...outPerTrack).toFixed(1),
      p10: +quantile(outPerTrack, 0.1).toFixed(1),
      median: +quantile(outPerTrack, 0.5).toFixed(1),
      p90: +quantile(outPerTrack, 0.9).toFixed(1),
      max: +Math.max(...outPerTrack).toFixed(1),
    },
    in_tokens_per_full_call: {
      min: Math.min(...inPerCall),
      max: Math.max(...inPerCall),
    },
    cost_per_track_usd: {
      min: +Math.min(...costPerTrack).toFixed(6),
      median: +quantile(costPerTrack, 0.5).toFixed(6),
      max: +Math.max(...costPerTrack).toFixed(6),
    },
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
