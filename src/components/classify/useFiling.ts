"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  BUMPS_PER_TICK,
  TICK_MS,
  flushFiling,
  receiveCounts,
  settleFiling,
  startFiling,
  type Counts,
  type Filing,
} from "./filing";

const StatusCounts = z.object({
  category_counts: z.record(z.string(), z.number().int().nonnegative()),
});

// Read-only: /api/status reads the cache and never refreshes a token, so it
// can't re-save the cache the run is writing (spec §4.4, §5).
async function readCounts(): Promise<Counts | null> {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = StatusCounts.safeParse(await res.json());
    return parsed.success ? parsed.data.category_counts : null;
  } catch {
    return null;
  }
}

/**
 * The crate's counts during a run. Each batch the stream reports re-reads the
 * per-category counts; the tabs then print them three at a time every 250ms,
 * each with a bump. Reduced motion prints them at once, with no bump.
 */
export function useFiling({
  initial,
  batchesDone,
  reduced,
}: {
  initial: Counts;
  /** The stream's `done`: each new value is a batch saved to the cache. */
  batchesDone: number;
  reduced: boolean;
}): Filing {
  const [filing, setFiling] = useState(() => startFiling(initial));
  // Reads can finish out of order; only the newest one may print.
  const latest = useRef(0);

  useEffect(() => {
    if (batchesDone === 0) return;
    const ask = ++latest.current;
    void readCounts().then((counts) => {
      if (!counts || ask !== latest.current) return;
      setFiling((f) => {
        const next = receiveCounts(f, counts);
        return reduced ? settleFiling(next) : next;
      });
    });
  }, [batchesDone, reduced]);

  const waiting = filing.queue.length > 0;
  useEffect(() => {
    if (!waiting || reduced) return;
    const tick = setInterval(
      () => setFiling((f) => flushFiling(f, BUMPS_PER_TICK)),
      TICK_MS,
    );
    return () => clearInterval(tick);
  }, [waiting, reduced]);

  // Reduced motion turned on mid-run: whatever is queued prints at once.
  return reduced && waiting ? settleFiling(filing) : filing;
}
