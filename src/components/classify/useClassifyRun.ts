"use client";
import { useEffect, useState } from "react";
import type { Cache } from "@/src/lib/cache";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";

export type Library = Pick<
  Cache,
  "config" | "categories" | "tracks" | "artists" | "assignments" | "runs"
>;

export interface RunSummary {
  sorted: number;
  costUsd: number;
  skipped: number;
}

export type FailReason = "unreadable" | "stopped" | "disconnected";

export type ClassifyState =
  | { phase: "loading" }
  | { phase: "running"; progress: { done: number; total: number } | null }
  | { phase: "ready"; library: Library; summary: RunSummary | null }
  | { phase: "empty" }
  | {
      phase: "failed";
      reason: FailReason;
      message: string | null;
      /** Only once categories are known to exist: /review with none proposes. */
      canReview: boolean;
    };

async function readLibrary(): Promise<Library | null> {
  try {
    const res = await fetch("/api/cache");
    return res.ok ? ((await res.json()) as Library) : null;
  } catch {
    return null;
  }
}

function lastRunSummary(library: Library): RunSummary | null {
  const run = library.runs.findLast((r) => r.type === "classify");
  if (!run) return null;
  const skipped = run.skipped?.length ?? 0;
  if (run.tracks_classified === 0 && skipped === 0) return null;
  return { sorted: run.tracks_classified, costUsd: run.cost_usd, skipped };
}

function messageOf(raw: string): string | null {
  try {
    const { message } = JSON.parse(raw) as { message?: unknown };
    return typeof message === "string" ? message : null;
  } catch {
    return null;
  }
}

/**
 * Reads the library, and opens the paid classify stream only when some tracks
 * have no category: the same rule the pipeline pays for. One stream per mount,
 * never retried: recovery goes back through the cost preview on /review.
 */
export function useClassifyRun(): ClassifyState {
  const [state, setState] = useState<ClassifyState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    let stream: EventSource | null = null;
    const settle = (next: ClassifyState) => {
      if (!cancelled) setState(next);
    };

    void (async () => {
      const library = await readLibrary();
      if (cancelled) return;
      if (!library) {
        settle({
          phase: "failed",
          reason: "unreadable",
          message: null,
          canReview: false,
        });
        return;
      }
      if (Object.keys(library.categories).length === 0) {
        settle({ phase: "empty" });
        return;
      }
      if (unsortedTrackIds(library).length === 0) {
        settle({ phase: "ready", library, summary: null });
        return;
      }

      settle({ phase: "running", progress: null });
      const es = new EventSource("/api/llm/classify");
      stream = es;
      es.addEventListener("progress", (e) => {
        const { done, total } = JSON.parse(
          (e as MessageEvent<string>).data,
        ) as {
          done: number;
          total: number;
        };
        settle({ phase: "running", progress: { done, total } });
      });
      es.addEventListener("done", () => {
        es.close();
        void readLibrary().then((after) =>
          settle(
            after
              ? {
                  phase: "ready",
                  library: after,
                  summary: lastRunSummary(after),
                }
              : {
                  phase: "failed",
                  reason: "unreadable",
                  message: null,
                  canReview: true,
                },
          ),
        );
      });
      // A server `error` event carries a message; a dropped connection doesn't.
      // Close either way, or EventSource reconnects and starts a second run.
      es.addEventListener("error", (e) => {
        es.close();
        const raw = (e as MessageEvent<string>).data;
        settle({
          phase: "failed",
          reason: raw ? "stopped" : "disconnected",
          message: raw ? messageOf(raw) : null,
          canReview: true,
        });
      });
    })();

    return () => {
      cancelled = true;
      stream?.close();
    };
  }, []);

  return state;
}
