// Apply writes its start-of-run copy of cache.json back as it goes, so a route
// that also writes the cache (playlist removal) must not run beside it. Kept on
// globalThis: each route is bundled on its own, and a module-level flag isn't
// guaranteed to be shared between them in one server process.
const RUNS = Symbol.for("spotifysorter.applyRuns");
type Holder = { [RUNS]?: number };
const holder = globalThis as Holder;

export function isApplyRunning(): boolean {
  return (holder[RUNS] ?? 0) > 0;
}

export async function whileApplyRuns<T>(run: () => Promise<T>): Promise<T> {
  holder[RUNS] = (holder[RUNS] ?? 0) + 1;
  try {
    return await run();
  } finally {
    holder[RUNS] = (holder[RUNS] ?? 1) - 1;
  }
}
