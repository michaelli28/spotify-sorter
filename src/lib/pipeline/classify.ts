import { join } from "node:path";
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

  if (inputs.length === 0) return { tracks_classified: 0, cost_usd: 0 };

  const batches = chunkInto(inputs, 50);
  const pool = createDegradingPool({
    initial: 3,
    min: 1,
    recoveryWindowMs: 30_000,
  });

  let totalCost = 0;
  let doneBatches = 0;
  const allAssignments: Awaited<
    ReturnType<typeof classifyBatch>
  >["assignments"] = [];

  await pool.runAll(
    batches.map((batch) => async () => {
      while (true) {
        try {
          const r = await classifyBatch({
            apiKey: opts.apiKey,
            categories,
            tracks: batch,
          });
          allAssignments.push(...r.assignments);
          totalCost += r.cost_usd;
          doneBatches++;
          onProgress("batch", doneBatches, batches.length);
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

  const now = new Date().toISOString();
  const merged = { ...cache.assignments };
  for (const a of allAssignments) {
    merged[a.track_id] = {
      matches: a.matches,
      reasoning: a.reasoning,
      classified_at: now,
      override: null,
    };
  }
  await writeCache(cachePath, patchCache(cache, { assignments: merged }));

  return { tracks_classified: allAssignments.length, cost_usd: totalCost };
}
