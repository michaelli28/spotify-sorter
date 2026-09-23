"use client";
import { useEffect, useRef, useState } from "react";

/** Brief §4.4 C: at most one sleeve per 30ms once the writes have landed. */
export const PRINT_STEP_MS = 30;

/**
 * How many sleeves, from the top, may show as printed. It chases `target`
 * (what Spotify confirmed) one sleeve per PRINT_STEP_MS, so a live run prints
 * at the pace of the writes and a burst (a done with no progress, a rejoin)
 * rolls in over at most 41 × 30ms. Reduced motion: everything at once.
 */
export function usePrintPacer(target: number, reduced: boolean): number {
  const [printed, setPrinted] = useState(0);
  // A run that starts over prints from the top again.
  if (printed > target) setPrinted(target);

  const goal = useRef(target);
  useEffect(() => {
    goal.current = target;
  }, [target]);

  const behind = !reduced && printed < target;
  useEffect(() => {
    if (!behind) return;
    const id = setInterval(
      () => setPrinted((p) => (p < goal.current ? p + 1 : p)),
      PRINT_STEP_MS,
    );
    return () => clearInterval(id);
  }, [behind]);

  return reduced ? target : Math.min(printed, target);
}
