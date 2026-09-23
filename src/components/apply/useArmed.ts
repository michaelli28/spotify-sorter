"use client";
import { useEffect, useState } from "react";

/**
 * /classify's "Apply to Spotify" sits where this page's Apply lands, so the
 * second half of a double click, or an impatient re-click, would start the
 * write before anyone saw the manifest. Apply answers only once it has been
 * ready this long.
 */
export const APPLY_ARM_MS = 600;

/** True once `ready` has held for `ms`; false again the moment it drops. */
export function useArmed(ready: boolean, ms: number = APPLY_ARM_MS): boolean {
  const [armed, setArmed] = useState(false);
  if (!ready && armed) setArmed(false);

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setArmed(true), ms);
    return () => clearTimeout(id);
  }, [ready, ms]);

  return ready && armed;
}
