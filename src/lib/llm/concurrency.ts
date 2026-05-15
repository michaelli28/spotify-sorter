export interface PoolOpts {
  initial: number;
  min: number;
  recoveryWindowMs: number;
}

export interface DegradingPool {
  runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]>;
  reportRateLimit(): void;
  currentLimit(): number;
  tick(): void;
}

export function createDegradingPool(opts: PoolOpts): DegradingPool {
  let limit = opts.initial;
  let lastRateLimit = 0;

  function maybeRecover() {
    if (
      limit < opts.initial &&
      Date.now() - lastRateLimit >= opts.recoveryWindowMs
    ) {
      limit = opts.initial;
    }
  }

  return {
    currentLimit: () => limit,
    tick: maybeRecover,
    reportRateLimit() {
      lastRateLimit = Date.now();
      limit = Math.max(opts.min, limit - 1);
    },
    async runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
      const results: T[] = new Array(tasks.length);
      let index = 0;
      async function worker() {
        while (true) {
          maybeRecover();
          const i = index++;
          if (i >= tasks.length) return;
          results[i] = await tasks[i]!();
        }
      }
      const workers = Array.from(
        { length: Math.min(limit, tasks.length) },
        worker,
      );
      await Promise.all(workers);
      return results;
    },
  };
}
