type Listener<P> = (progress: P) => void;

export interface Job<P, R> {
  result: Promise<R>;
  subscribe(listener: Listener<P>): () => void;
}

// At most one run at a time: a request that arrives while a run is in flight
// joins it (and gets its latest progress) instead of starting a second,
// double-billed run. The slot frees when the run settles.
export function singleFlight<P, R>(
  run: (emit: Listener<P>) => Promise<R>,
): () => Job<P, R> {
  let current: Job<P, R> | null = null;
  return () => {
    if (current) return current;
    const listeners = new Set<Listener<P>>();
    let latest: { progress: P } | null = null;
    const emit = (progress: P) => {
      latest = { progress };
      for (const listener of listeners) {
        try {
          listener(progress);
        } catch {
          // One disconnected client must not abort the run or starve the others.
        }
      }
    };
    const job: Job<P, R> = {
      result: Promise.resolve()
        .then(() => run(emit))
        .finally(() => {
          if (current === job) current = null;
        }),
      subscribe(listener) {
        if (latest) listener(latest.progress);
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    current = job;
    return job;
  };
}
