// SPIKE: one live 10-track classify call through the new structured-output
// request. Spends ~$0.01 (logged to data/logs like any real call). Writes
// nothing to data/cache.json.
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { classifyBatch } from "@/src/lib/llm/classify";

process.loadEnvFile(".env.local");

async function main() {
  const cache = await readCache(join(process.cwd(), "data", "cache.json"));
  const ids = Object.keys(cache.tracks).sort();
  // 10 tracks spread evenly across the sorted IDs (deterministic).
  const sample = Array.from({ length: 10 }, (_, i) => {
    const id = ids[Math.floor((i * ids.length) / 10)]!;
    const t = cache.tracks[id]!;
    const a = cache.artists[t.artist_id];
    return {
      id,
      title: t.title,
      artist_name: a?.name ?? "",
      genres: a?.genres ?? [],
    };
  });
  const categories = Object.entries(cache.categories).map(([id, c]) => ({
    id,
    name: c.name,
    description: c.description,
  }));

  const r = await classifyBatch({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    categories,
    tracks: sample,
  });
  console.log({
    categories: categories.length,
    sent: sample.length,
    assigned: r.assignments.length,
    missing: r.missing.length,
    matchesPerTrack: r.assignments.map((a) => a.matches.length),
    allIdsReal: r.assignments.every((a) => a.track_id in cache.tracks),
    usage: r.usage,
    outputTokensPerTrack: +(r.usage.output_tokens / sample.length).toFixed(1),
    cost_usd: +r.cost_usd.toFixed(5),
  });
}

main().catch((err: unknown) => {
  console.error("smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
