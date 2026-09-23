"use client";
import { useEffect, useState } from "react";

const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

/**
 * Whether the page should keep the row on the press in view: true while
 * `active`, until the owner scrolls for themselves. A new run follows again.
 */
export function useFollowRun(active: boolean): boolean {
  const [away, setAway] = useState(false);
  const [was, setWas] = useState(active);
  if (was !== active) {
    setWas(active);
    if (active) setAway(false);
  }

  useEffect(() => {
    if (!active) return;
    // Only the owner's own scrolling: scrollIntoView fires none of these.
    const leave = (e: Event) => {
      if (e instanceof KeyboardEvent && !SCROLL_KEYS.has(e.key)) return;
      setAway(true);
    };
    const opts = { passive: true } as const;
    window.addEventListener("wheel", leave, opts);
    window.addEventListener("touchmove", leave, opts);
    window.addEventListener("keydown", leave);
    return () => {
      window.removeEventListener("wheel", leave);
      window.removeEventListener("touchmove", leave);
      window.removeEventListener("keydown", leave);
    };
  }, [active]);

  return active && !away;
}
