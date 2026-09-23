"use client";
import { useEffect, useState } from "react";

/**
 * True only once /api/status says the labelling study is over (spec §3.6):
 * "Mostly" names artists, which could prime a blind labeller. Any doubt (a
 * failed or odd answer) keeps it hidden, which is the safe side.
 */
export function useLabelStudyClosed(): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/status")
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((status) => {
        const open = (status as { label_study_open?: unknown } | null)
          ?.label_study_open;
        if (live) setClosed(open === false);
      })
      // Unreachable server: stay hidden, nothing else depends on it.
      .catch(() => {
        if (live) setClosed(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return closed;
}
