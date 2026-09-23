"use client";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { ProgressBar } from "@/src/components/scan/ProgressBar";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { StageId, StageRow, StageState } from "./stages";

const LABEL: Record<StageId, string> = {
  playlists: "Playlists",
  liked: "Liked Songs",
  artists: "Artist genres",
};

const TONE: Record<StageState, string> = {
  pending: "text-[var(--color-text-tertiary)]",
  active: "text-[var(--color-text-primary)]",
  done: "text-[var(--color-text-secondary)]",
  skipped: "text-[var(--color-text-tertiary)]",
};

export function ScanStages({ rows }: { rows: StageRow[] }) {
  const { item, itemDelay, spring, fade } = useMotionConfig();
  const active = rows.find((row) => row.state === "active");
  return (
    <>
      <ol className="max-w-md space-y-6">
        {rows.map((row, i) => (
          <motion.li
            key={row.id}
            aria-current={row.state === "active" ? "step" : undefined}
            variants={item}
            initial="hidden"
            animate="visible"
            transition={{ ...spring, delay: itemDelay(i) }}
            className="relative flex items-baseline justify-between gap-6 text-lg"
          >
            <span
              className={clsx(
                "transition-colors duration-200",
                TONE[row.state],
              )}
            >
              {LABEL[row.id]}
            </span>
            {row.count && (
              <span className="font-mono text-sm tabular-nums text-[var(--color-text-secondary)]">
                {`${row.count.current.toLocaleString()} of ${row.count.total.toLocaleString()}`}
              </span>
            )}
            {/* Absolute, so the rows don't shift as a count starts and ends. */}
            <AnimatePresence initial={false}>
              {row.count && (
                <motion.div
                  key="bar"
                  className="absolute inset-x-0 -bottom-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                >
                  <ProgressBar
                    value={row.count.current}
                    total={row.count.total}
                    label={LABEL[row.id]}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        ))}
      </ol>
      {/* Announces a new stage, not every count. */}
      <p role="status" className="sr-only">
        {active ? LABEL[active.id] : ""}
      </p>
    </>
  );
}
