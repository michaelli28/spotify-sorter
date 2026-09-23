"use client";
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Focus an element that only exists after the next render: a row's name field
 * once it opens, the Undo that replaced a deleted row. Targets opt in with
 * data-focus="<key>" inside `root`. Call it alongside a state change in the
 * same component, so that component re-renders.
 */
export function useFocusAfterRender(
  root: RefObject<HTMLElement | null>,
): (key: string) => void {
  const pending = useRef<string | null>(null);
  useLayoutEffect(() => {
    const key = pending.current;
    if (!key) return;
    pending.current = null;
    root.current?.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus();
  });
  return useCallback((key: string) => {
    pending.current = key;
  }, []);
}
