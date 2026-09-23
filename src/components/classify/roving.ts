"use client";
import { useState, type KeyboardEvent } from "react";

export interface RovingRowProps {
  "data-roving": string;
  tabIndex: 0 | -1;
  onFocus: () => void;
}

/** The row a key moves focus to among `count` rows, or null for other keys. */
export function rovingTarget(
  key: string,
  at: number,
  count: number,
): number | null {
  if (at < 0 || count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(at + 1, count - 1);
    case "ArrowUp":
      return Math.max(at - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Makes a long list one Tab stop: the row last focused, else `preferred`, else
 * the first. Up/Down/Home/End move between rows carrying this list's `name`,
 * so a list nested inside another keeps its own keys.
 */
export function useRovingFocus(
  name: string,
  ids: readonly string[],
  preferred: string | null = null,
) {
  const [last, setLast] = useState<string | null>(null);
  const stop =
    [last, preferred].find((id) => id !== null && ids.includes(id)) ??
    ids[0] ??
    null;

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const rows = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(`[data-roving="${name}"]`),
    );
    const to = rovingTarget(
      e.key,
      rows.indexOf(e.target as HTMLElement),
      rows.length,
    );
    if (to === null) return;
    e.preventDefault();
    rows[to]?.focus();
  }

  const rowProps = (id: string): RovingRowProps => ({
    "data-roving": name,
    tabIndex: id === stop ? 0 : -1,
    onFocus: () => setLast(id),
  });

  return { rowProps, onKeyDown, setStop: setLast };
}
