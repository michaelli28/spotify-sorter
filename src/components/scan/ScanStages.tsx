"use client";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import clsx from "clsx";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { StageId, StageRow, StageState } from "./stages";

const LABEL: Record<StageId, string> = {
  playlists: "Playlists",
  liked: "Liked Songs",
  artists: "Artist genres",
};

/** The top strip's line while a stage runs; the strip announces it. */
export const READING: Record<StageId, string> = {
  playlists: "Reading playlists…",
  liked: "Reading Liked Songs…",
  artists: "Reading artist genres…",
};

type ShownState = Exclude<StageState, "skipped">;

// Weight as well as ink marks the step being read: ink against ink-3 alone is
// only 2.4:1 between neighbours.
const TONE: Record<ShownState, string> = {
  pending: "text-ink-3",
  active: "font-semibold text-ink",
  done: "text-ink-2",
};

// The page title carries the playlists count; only another stage's prints here.
const COUNTED_IN_TITLE: StageId = "playlists";

export function ScanStages({ rows }: { rows: StageRow[] }) {
  const { reduced } = useMotionConfig();
  // A step the finished scan never needed (artist genres, with no new tracks)
  // would sit unticked under a title that says done.
  const shown = rows.filter(
    (row): row is StageRow & { state: ShownState } => row.state !== "skipped",
  );
  return (
    <ol className="border-t border-rule">
      {shown.map((row) => (
        <li
          key={row.id}
          aria-current={row.state === "active" ? "step" : undefined}
          className="flex min-h-12 items-center justify-between gap-4 border-b border-rule text-lead"
        >
          <span
            className={clsx(
              "transition-colors duration-240 ease-out",
              TONE[row.state],
            )}
          >
            {LABEL[row.id]}
          </span>
          {row.state === "done" && (
            // Ticks off (brief §4.4 A): 240ms in, 4px of travel.
            <motion.span
              className="text-ink-2"
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                reduced
                  ? { duration: DURATION.reduced }
                  : { duration: DURATION.state, ease: EASE_OUT }
              }
            >
              <Check aria-hidden size={20} strokeWidth={1.75} />
            </motion.span>
          )}
          {/* Defensive: the server sends artist genres as 0 of N, then N of
                N, so today no counted step is ever active with a count. */}
          {row.count && row.id !== COUNTED_IN_TITLE && (
            <span className="mono num text-ink-2">
              {`${row.count.current.toLocaleString()} of ${row.count.total.toLocaleString()}`}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
