"use client";
import { useEffect, useRef, useState } from "react";

/** At most one record drops per this many ms, so a fast scan never strobes. */
export const RECORD_GAP_MS = 180;
/** Landed records are out of sight behind the slat: only the newest few in flight need mounting. */
const KEEP = 4;

/**
 * Ids of the records to drop into the crate for `read` sources read. Paced, not
 * queued: sources read inside one gap go in with a single record, so the records
 * never fall behind the scan.
 */
export function usePacedRecords(read: number, gapMs = RECORD_GAP_MS): number[] {
  const [records, setRecords] = useState<number[]>([]);
  const target = useRef(read);
  const dropped = useRef(0);
  const lastDrop = useRef(Number.NEGATIVE_INFINITY);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextId = useRef(0);

  useEffect(() => {
    target.current = read;
    if (read <= dropped.current || timer.current !== undefined) return;
    timer.current = setTimeout(
      () => {
        timer.current = undefined;
        dropped.current = target.current;
        lastDrop.current = Date.now();
        const id = nextId.current++;
        setRecords((shown) => [...shown, id].slice(-KEEP));
      },
      Math.max(0, lastDrop.current + gapMs - Date.now()),
    );
  }, [read, gapMs]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      // StrictMode re-runs the effects on the same refs: let them schedule again.
      timer.current = undefined;
    },
    [],
  );

  return records;
}
