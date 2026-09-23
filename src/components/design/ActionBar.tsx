"use client";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { EASE_OUT } from "@/src/components/design/motion";

export interface ActionBarProps {
  /** A control before the status, e.g. the Fit ruler. Give it a preferred
   *  width (w-80); it is capped at the room the primary leaves. */
  start?: ReactNode;
  /** One line of feedback. Announced politely; truncated, never wraps. */
  status?: ReactNode;
  /** The page's one primary control, moved here, not copied. */
  end: ReactNode;
}

interface Strip {
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}

// undefined: no layout around the page (a unit test), so print in place.
// slot null: the layout's slot isn't in the DOM yet (server, hydration).
const StripContext = createContext<Strip | undefined>(undefined);

// Sticky, not fixed: it takes its own room in the flow, so it can never sit
// over content, and it pins at the top once the masthead scrolls away.
// z-30 is a stacking context: page content must stay below it.
const SLOT = "sticky top-0 z-30";

/** Root layout only: lets every page's ActionBar land in ActionStripSlot. */
export function ActionStripProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const strip = useMemo(() => ({ slot, setSlot }), [slot]);
  return (
    <StripContext.Provider value={strip}>{children}</StripContext.Provider>
  );
}

/** Root layout only: render it directly after <SiteNav />. */
export function ActionStripSlot() {
  const strip = useContext(StripContext);
  return <div data-action-strip-slot className={SLOT} ref={strip?.setSlot} />;
}

/**
 * The page's top strip: status left, the one primary right, one row at every
 * width. Render it anywhere in the page; it prints under the site nav.
 */
export function ActionBar({ start, status, end }: ActionBarProps) {
  const strip = useContext(StripContext);
  const { reduced } = useMotionConfig();
  // Opacity only: a transform would make the bar the containing block of a
  // fixed dialog opened from inside it (ClassifyGate's price tag).
  const bar = (
    <motion.div
      data-action-bar
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduced
          ? { duration: 0 }
          : { duration: 0.42, ease: EASE_OUT, delay: 0.2 }
      }
      className="paper-tooth h-strip border-b border-rule-strong"
    >
      <div className="page-frame flex h-full items-center gap-4 tab:gap-6 max-tab:[&_[data-variant=primary]]:min-h-13 max-tab:[&_[data-variant=primary]]:px-6">
        {/* Start gives way and its control is capped at what's left; the
            primary never shrinks, so it can't be pushed off a phone. */}
        {start && <div className="min-w-0 [&>*]:max-w-full">{start}</div>}
        {/* Always rendered, even empty: a live region only announces changes
            if it was in the page before them. */}
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-ink-2"
        >
          {status}
        </p>
        <div className="shrink-0">{end}</div>
      </div>
    </motion.div>
  );
  if (strip === undefined)
    return (
      <div data-action-strip-slot className={SLOT}>
        {bar}
      </div>
    );
  if (strip.slot) return createPortal(bar, strip.slot);
  // Server and first client render: no slot to portal into yet. The claim
  // tells globals.css to hold the strip's room, so nothing jumps on arrival.
  return <span data-action-strip-claim hidden />;
}
