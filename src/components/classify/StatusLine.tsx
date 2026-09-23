"use client";
import type { RefObject } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { Assignment } from "@/src/lib/cache";
import { countLabel } from "./PlaylistIndex";
import type { RunSummary } from "./useClassifyRun";

/**
 * One line of news in the action bar: the run just paid for, a move, an
 * unsaved setting, an error.
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
            <span className="text-[var(--color-warning)]">
              {" "}
              · {status.summary.skipped.toLocaleString()} couldn&apos;t be
              placed
            </span>
          )}
        </span>
      )}
      {status.kind === "moved" && (
        <>
          <span className="truncate">{status.text}</span>
          <button
            ref={undoRef}
            type="button"
            onClick={() => onUndo(status)}
            className={clsx(
              "shrink-0 text-[var(--color-text-primary)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition-colors duration-200 hover:decoration-[var(--color-text-primary)]",
              // The status line clips overflow, so focus stays inside the word.
              "focus-visible:decoration-[var(--color-accent)] focus-visible:decoration-2 focus-visible:outline-none",
            )}
          >
            Undo
          </button>
        </>
      )}
      {status.kind === "note" && (
        <span className="truncate">{status.text}</span>
      )}
      {status.kind === "warning" && (
        <span className="truncate text-[var(--color-warning)]">
          {status.text}
        </span>
      )}
      {status.kind === "error" && (
        <span className="truncate text-[var(--color-danger)]">
          {status.text}
        </span>
      )}
    </motion.span>
  );
}
