import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import {
  runPropose,
  type ProposeTrackInput,
  type ProposeProgress,
} from "@/src/lib/llm/propose";

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function runProposeFromCache(opts: {
  apiKey: string;
  onProgress?: (state: ProposeProgress & { track_count: number }) => void;
}) {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  const inputs: ProposeTrackInput[] = Object.entries(cache.tracks).map(
    ([id, t]) => ({
      id,
      title: t.title,
      artist_name: cache.artists[t.artist_id]?.name ?? "",
      genres: cache.artists[t.artist_id]?.genres ?? [],
    }),
  );
  const startedAt = new Date().toISOString();
  const result = await runPropose({
    apiKey: opts.apiKey,
    tracks: inputs,
    onProgress: opts.onProgress
      ? (p) => opts.onProgress!({ ...p, track_count: inputs.length })
      : undefined,
  });
  const now = new Date().toISOString();
  const categories = { ...cache.categories };
  for (const c of result.categories) {
    categories[c.id] = {
      name: c.name,
      description: c.description,
      spotify_playlist_id: null,
      created_at: now,
    };
  }
  const runs = [
    ...cache.runs,
    {
      run_id: randomBytes(8).toString("hex"),
      type: "propose" as const,
      started_at: startedAt,
      completed_at: now,
      tracks_classified: 0,
      tracks_total: inputs.length,
      cost_usd: result.cost_usd,
      summary: `Proposed ${result.categories.length} categories from ${inputs.length} tracks.`,
    },
  ];
  await writeCache(cachePath, patchCache(cache, { categories, runs }));
  console.log(
    `[propose] persisted ${result.categories.length} categories to ${cachePath} (cost $${result.cost_usd.toFixed(4)})`,
  );
  return { categories: result.categories, cost_usd: result.cost_usd };
}
