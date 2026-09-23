"use client";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

export interface ActionBarProps {
  /** A quiet way back, e.g. a ghost sm ButtonLink. */
  start?: ReactNode;
  /** One line of feedback. Announced politely; truncated, never wraps. */
  status?: ReactNode;
  /** The page's one primary control, moved here, not copied. */
  end: ReactNode;
}

// One fixed height, so the spacer matches the bar exactly and a status line
// appearing never grows the bar over the content. Under md the status gets
// its own line above the controls.
const HEIGHT =
  "h-[calc(5.5rem_+_env(safe-area-inset-bottom))] md:h-[calc(4rem_+_env(safe-area-inset-bottom))]";

/**
 * Pinned to the bottom of the viewport. Render it as the last child of the
 * page's <main>: it leaves a spacer of its own height in the flow, so the page
 * needs no extra bottom padding.
 */
export function ActionBar({ start, status, end }: ActionBarProps) {
  const { spring } = useMotionConfig();
  return (
    <>
      <div aria-hidden="true" data-action-bar-spacer className={HEIGHT} />
      <motion.div
        data-action-bar
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border-default)] bg-[var(--color-bg-base)] pb-[env(safe-area-inset-bottom)] ${HEIGHT}`}
      >
        <div className="mx-auto grid h-full max-w-5xl grid-cols-[1fr_auto] content-center items-center gap-x-6 px-gutter md:flex">
          {start && (
            <div className="col-start-1 row-start-2 justify-self-start">
              {start}
            </div>
          )}
          {/* Empty: out of the layout but still in the accessibility tree, so
              the first message is announced. */}
          <p
            role="status"
            className="col-span-2 row-start-1 mb-1 min-w-0 truncate text-sm leading-5 text-[var(--color-text-secondary)] empty:sr-only md:mb-0 md:flex-1"
          >
            {status}
          </p>
          <div className="col-start-2 row-start-2 justify-self-end md:ml-auto">
            {end}
          </div>
        </div>
      </motion.div>
    </>
  );
}
