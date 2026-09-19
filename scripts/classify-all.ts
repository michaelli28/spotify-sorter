// Day 3: run the classify pipeline (the same code the /classify page runs) over
// every unassigned track. Live Anthropic spend (~$1.8 for 2,875 tracks, ASSUMED
// from a 10-track call); every call is logged to data/logs and the run is
// recorded in data/cache.json. Run outside the sandbox (reads .env.local).
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { runClassifyFromCache } from "@/src/lib/pipeline/classify";

process.loadEnvFile(".env.local");

async function main() {
  const start = Date.now();
  const result = await runClassifyFromCache({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    onProgress: (_stage, done, total) =>
      console.log(
        `batch ${done}/${total} (${Math.round((Date.now() - start) / 1000)}s)`,
      ),
  });
  const cache = await readCache(join(process.cwd(), "data", "cache.json"));
  console.log({
    result,
    run: cache.runs.at(-1),
    assignments: Object.keys(cache.assignments).length,
    tracks: Object.keys(cache.tracks).length,
    minutes: +((Date.now() - start) / 60_000).toFixed(1),
  });
}

main().catch((err: unknown) => {
  console.error("classify failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
