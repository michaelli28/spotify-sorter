"use client";
import type { RefObject } from "react";
import { motion } from "framer-motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { Assignment } from "@/src/lib/cache";
import { countLabel } from "./PlaylistIndex";
import type { RunSummary } from "./useClassifyRun";

/**
 * One line of news in the top strip: the run just paid for, a move, an
 * unsaved cutoff, an error.
 */
export type Status =
  | { kind: "summary"; id: number; summary: RunSummary }
  | {
      kind: "moved";
      id: number;
      text: string;
      trackId: string;
      title: string;
      previous: Assignment;
      next: Assignment;
    }
  | { kind: "note" | "warning" | "error"; id: number; text: string };
export type Moved = Extract<Status, { kind: "moved" }>;
// Omit that keeps the union: each kind loses only its id.
export type StatusBody = Status extends infer S
  ? S extends Status
    ? Omit<S, "id">
    : never
  : never;

export function StatusLine({
  status,
  onUndo,
  undoRef,
}: {
  status: Status | null;
  onUndo: (moved: Moved) => void;
  undoRef: RefObject<HTMLButtonElement | null>;
}) {
  const { fade } = useMotionConfig();
  if (!status) return null;
  // Keyed, no exit: a new line replaces the old at once, so Undo exists the
  // moment focus is sent to it.
  return (
    <motion.span
      key={status.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={fade}
      className="flex min-w-0 items-baseline gap-3"
    >
      {status.kind === "summary" && (
        <span className="truncate">
          Sorted {countLabel(status.summary.sorted)} for $
          {status.summary.costUsd.toFixed(2)}
          {status.summary.skipped > 0 && (
            <span className="text-warn-ink">
              {" "}
              · {status.summary.skipped.toLocaleString("en-US")} couldn&apos;t
              be placed
            </span>
          )}
        </span>
      )}
      {status.kind === "moved" && (
        <>
          <span className="truncate" title={status.text}>
            {status.text}
          </span>
          <button
            ref={undoRef}
            type="button"
            onClick={() => onUndo(status)}
            className={
              // The line clips overflow, so the global ring is drawn inset.
              "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[3px] px-1.5 font-medium text-ink underline decoration-rule-strong decoration-[1.5px] underline-offset-[6px] transition-[text-decoration-color] duration-180 ease-out hover:decoration-ink focus-visible:outline-offset-[-2px]"
            }
          >
            Undo
          </button>
        </>
      )}
      {status.kind === "note" && (
        <span className="truncate" title={status.text}>
          {status.text}
        </span>
      )}
      {status.kind === "warning" && (
        <span className="truncate text-warn-ink" title={status.text}>
          {status.text}
        </span>
      )}
      {status.kind === "error" && (
        <span className="truncate text-danger" title={status.text}>
          {status.text}
        </span>
      )}
    </motion.span>
  );
}
