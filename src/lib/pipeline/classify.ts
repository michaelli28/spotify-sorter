import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import {
  classifyBatch,
  type ClassifyCategory,
  type ClassifyTrackInput,
} from "@/src/lib/llm/classify";
import { chunkInto } from "@/src/lib/llm/batching";
import { createDegradingPool } from "@/src/lib/llm/concurrency";

export type ProgressCb = (stage: "batch", done: number, total: number) => void;
export interface ClassifyResult {
  tracks_classified: number;
  cost_usd: number;
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function runClassifyFromCache(opts: {
  apiKey: string;
  onProgress?: ProgressCb;
}): Promise<ClassifyResult> {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  const onProgress = opts.onProgress ?? (() => {});

  const categories: ClassifyCategory[] = Object.entries(cache.categories).map(
    ([id, c]) => ({
      id,
      name: c.name,
      description: c.description,
    }),
  );

  const startedAt = new Date().toISOString();
  const totalTracks = Object.keys(cache.tracks).length;
  const alreadyClassified = Object.keys(cache.assignments).length;
  const unclassifiedIds = Object.keys(cache.tracks).filter(
    (id) => !cache.assignments[id],
  );
  const inputs: ClassifyTrackInput[] = unclassifiedIds.map((id) => {
    const t = cache.tracks[id]!;
    const a = cache.artists[t.artist_id];
    return {
      id,
      title: t.title,
      artist_name: a?.name ?? "",
      genres: a?.genres ?? [],
    };
  });

  if (inputs.length === 0) {
    const noopNow = new Date().toISOString();
    const runs = [
      ...cache.runs,
      {
        run_id: randomBytes(8).toString("hex"),
        type: "classify" as const,
        started_at: startedAt,
        completed_at: noopNow,
        tracks_classified: 0,
        tracks_total: totalTracks,
        cost_usd: 0,
        summary: `All ${alreadyClassified} tracks already classified — no Claude call needed.`,
      },
    ];
    await writeCache(cachePath, patchCache(cache, { runs }));
    return { tracks_classified: 0, cost_usd: 0 };
  }

  const batches = chunkInto(inputs, 50);
  const pool = createDegradingPool({
    initial: 3,
    min: 1,
    recoveryWindowMs: 30_000,
  });

  let totalCost = 0;
  let doneBatches = 0;
  let newAssignments = 0;
  const merged = { ...cache.assignments };

  let writeChain: Promise<unknown> = Promise.resolve();
  const enqueueWrite = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(fn, fn);
    writeChain = next.catch(() => undefined);
    return next as Promise<T>;
  };

  await pool.runAll(
    batches.map((batch) => async () => {
      while (true) {
        try {
          const r = await classifyBatch({
            apiKey: opts.apiKey,
            categories,
            tracks: batch,
          });
          const now = new Date().toISOString();
          await enqueueWrite(async () => {
            for (const a of r.assignments) {
              merged[a.track_id] = {
                matches: a.matches,
                reasoning: a.reasoning,
                classified_at: now,
                override: null,
              };
            }
            await writeCache(
              cachePath,
              patchCache(cache, { assignments: { ...merged } }),
            );
          });
          newAssignments += r.assignments.length;
          totalCost += r.cost_usd;
          doneBatches++;
          try {
            onProgress("batch", doneBatches, batches.length);
          } catch {
            // Progress reporting must never abort batch processing
            // (e.g. client disconnected the SSE stream).
          }
          return;
        } catch (err) {
          const e = err as { status?: number };
          if (e.status === 429) {
            pool.reportRateLimit();
            continue;
          }
          throw err;
        }
      }
    }),
  );

  await enqueueWrite(async () => {
    const runEnd = new Date().toISOString();
    const finalCache = await readCache(cachePath);
    const runs = [
      ...finalCache.runs,
      {
        run_id: randomBytes(8).toString("hex"),
        type: "classify" as const,
        started_at: startedAt,
        completed_at: runEnd,
        tracks_classified: newAssignments,
        tracks_total: totalTracks,
        cost_usd: totalCost,
        summary:
          alreadyClassified > 0
            ? `Classified ${newAssignments} new tracks. ${alreadyClassified} reused from cache.`
            : `Classified ${newAssignments} tracks across ${categories.length} categories.`,
      },
    ];
    await writeCache(cachePath, patchCache(finalCache, { runs }));
  });

  return { tracks_classified: newAssignments, cost_usd: totalCost };
}
