"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { ManifestRow } from "@/src/components/apply/plan";

export type RowState = "idle" | "pending" | "current" | "written" | "failed";

export interface ApplyManifestProps {
  rows: readonly ManifestRow[];
  /** One per row, same order. */
  states: readonly RowState[];
  className?: string;
}

// The name's ink is the only state mark, so nothing repeats on every row.
const INK: Record<RowState, string> = {
  idle: "text-[var(--color-text-secondary)]",
  pending: "text-[var(--color-text-tertiary)]",
  current: "text-[var(--color-accent)]",
  written: "text-[var(--color-text-primary)]",
  failed: "text-[var(--color-danger)]",
};

/** Every playlist the write will touch, in the order it touches them. */
export function ApplyManifest({ rows, states, className }: ApplyManifestProps) {
  const { pageEase, spring } = useMotionConfig();
  return (
    <motion.ol
      aria-label="Playlists"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={pageEase}
      className={clsx("gap-x-10 md:columns-2 lg:columns-3", className)}
    >
      {rows.map((row, i) => {
        const state = states[i] ?? "idle";
        return (
          <li
            key={row.id}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="grid break-inside-avoid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-[var(--color-border-default)] py-2.5 text-[0.9375rem] leading-snug"
          >
            <span className="font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={clsx(
                "relative justify-self-start font-[family-name:var(--font-display)] text-base transition-colors duration-200 motion-reduce:transition-none",
                INK[state],
              )}
            >
              {row.name}
              {/* One cursor that glides to the next playlist as the write moves. */}
              {state === "current" && (
                <motion.span
                  layoutId="apply-cursor"
                  transition={spring}
                  className="absolute inset-x-0 -bottom-0.5 h-px bg-[var(--color-accent)]"
                />
              )}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]">
              {row.count.toLocaleString("en-US")}
            </span>
          </li>
        );
      })}
    </motion.ol>
  );
}
