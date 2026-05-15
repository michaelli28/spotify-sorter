export interface RetryOpts {
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  maxBackoffMs?: number;
}

interface ErrWithStatus {
  status?: number;
  headers?: Headers;
}

export async function withRetry429<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const max = opts.maxRetries ?? 5;
  const cap = opts.maxBackoffMs ?? 60_000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const e = err as ErrWithStatus;
      if (e.status !== 429) throw err;
      if (attempt === max) break;
      const retryAfter = parseInt(e.headers?.get("retry-after") ?? "1", 10);
      const ms = Math.min(cap, retryAfter * 1000);
      await sleep(ms);
    }
  }
  throw lastErr;
}
