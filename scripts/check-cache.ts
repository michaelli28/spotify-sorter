// SPIKE: read-only sanity check that data/cache.json parses with the app's schema.
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";

async function main() {
  const cache = await readCache(join(process.cwd(), "data", "cache.json"));
  const orphans = Object.keys(cache.assignments).filter(
    (id) => !cache.tracks[id],
  );
  console.log({
    tracks: Object.keys(cache.tracks).length,
    assignments: Object.keys(cache.assignments).length,
    orphans: orphans.length,
    categories: Object.keys(cache.categories).length,
    runs: cache.runs.length,
  });
}

void main();
