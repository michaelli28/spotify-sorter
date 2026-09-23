"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  postCover,
  uploadInTurn,
  type CoverOutcome,
  type CoverState,
  type CoverTarget,
} from "./covers";

export interface CoverRun {
  /** Row id → its cover's state; absent = never tried. */
  states: ReadonlyMap<string, CoverState>;
  /** Uploads these covers one at a time. Ignored while a run is going. */
  run: (targets: readonly CoverTarget[]) => Promise<void>;
  reset: () => void;
}

/**
 * Started from the Apply stream's `done` handler, never from an effect, so a
 * development double-mount can't upload a cover twice.
 */
export function useCoverRun(
  upload: (target: CoverTarget) => Promise<CoverOutcome> = postCover,
): CoverRun {
  const [states, setStates] = useState<ReadonlyMap<string, CoverState>>(
    () => new Map(),
  );
  const alive = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (targets: readonly CoverTarget[]) => {
      if (busy.current || targets.length === 0) return;
      busy.current = true;
      setStates((prev) => {
        const next = new Map(prev);
        for (const t of targets) next.set(t.id, "waiting");
        return next;
      });
      try {
        await uploadInTurn({
          items: targets,
          upload,
          onState: (i, state) =>
            setStates((prev) => new Map(prev).set(targets[i]!.id, state)),
          alive: () => alive.current,
        });
      } finally {
        busy.current = false;
      }
    },
    [upload],
  );

  const reset = useCallback(() => setStates(new Map()), []);

  return { states, run, reset };
}
