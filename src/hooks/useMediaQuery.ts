"use client";
import { useCallback, useSyncExternalStore } from "react";

// The foundation's breakpoints (app/globals.css), for the layout choices CSS
// alone can't make (which control renders where).

/** `tab:` ≥721px. Below it is the phone layout. */
export const TAB_UP = "(min-width: 45.0625rem)";
/** `desk:` ≥901px: a list with its side sheet or panel. */
export const DESK_UP = "(min-width: 56.3125rem)";

/** `fallback` on the server, during hydration and where matchMedia is missing (jsdom). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : fallback,
    () => fallback,
  );
}
