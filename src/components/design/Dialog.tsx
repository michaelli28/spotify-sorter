"use client";
import {
  Children,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  type Transition,
} from "framer-motion";
import clsx from "clsx";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { DURATION, EASE_IN, EASE_OUT } from "@/src/components/design/motion";

export interface DialogProps {
  open: boolean;
  /** Escape, a backdrop click, and whatever the caller wires to Cancel. */
  onClose: () => void;
  /** Names the dialog. Set in the display face. */
  title: ReactNode;
  /** "price": the heading is the price (display-2), as on the cost tag. */
  titleSize?: "title" | "price";
  /** One line under the title; becomes the dialog's description. */
  description?: ReactNode;
  children?: ReactNode;
  /** The button row, pinned under the scrolling body. */
  actions?: ReactNode;
  width?: "md" | "lg";
  /** Focus this instead of the panel on open (e.g. a search field). */
  initialFocus?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Inline, not portalled, and the page behind is never aria-hidden or inert:
// the e2e test finds "Classify" behind the open cost modal.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  width = "md",
  titleSize = "title",
  initialFocus,
}: DialogProps) {
  const { reduced, fade } = useMotionConfig();
  // Hangs in from its eyelet; leaves as a quick fade.
  const hang: Transition = reduced
    ? { duration: 0 }
    : { duration: DURATION.sceneMin, ease: EASE_OUT };
  const leave: Transition = { ...fade, ease: EASE_IN };
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // onClose is usually an inline arrow, so this re-subscribes each render —
  // harmless, and dropping it from the deps would capture a stale handler.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the panel itself (or initialFocus), and hand focus back on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const panel = panelRef.current;
    (initialFocus?.current ?? panel)?.focus();
    return () => {
      // The panel outlives `open` while it fades, and a dialog opened on load
      // has no opener to return to: never leave focus inside it.
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel?.contains(active)) {
        active.blur();
      }
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [open, initialFocus]);

  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <Frame key="dialog" fade={fade}>
          <div
            aria-hidden
            data-testid="dialog-backdrop"
            className="absolute inset-0 bg-scrim"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            onKeyDown={trapTab}
            // The hole is real: the dimmed page shows through it.
            style={{ maskImage: HOLE, WebkitMaskImage: HOLE, originY: 0 }}
            className={clsx(
              "relative flex max-h-[85dvh] w-full flex-col outline-none",
              "rounded-[4px] border-[1.5px] border-ink bg-card",
              width === "md" ? "max-w-[30rem]" : "max-w-2xl",
            )}
            initial={{ opacity: 0, y: -12, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, transition: leave }}
            transition={hang}
          >
            <Eyelet />
            <header className="px-6 pt-12 tab:px-8">
              <h2
                id={titleId}
                className={clsx(
                  "font-display text-ink",
                  titleSize === "price" ? "text-display-2" : "text-title",
                )}
              >
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-4 text-ink-2">
                  {description}
                </p>
              )}
            </header>
            {Children.toArray(children).length > 0 && (
              // Notes sit under a hairline.
              <div className="mx-6 mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-rule pt-4 text-ink-2 tab:mx-8">
                {children}
              </div>
            )}
            {actions && (
              <footer className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 pt-8 pb-6 tab:px-8 tab:pb-8">
                {actions}
              </footer>
            )}
            {!actions && <div aria-hidden className="h-6 tab:h-8" />}
          </motion.div>
        </Frame>
      )}
    </AnimatePresence>
  );
}

// A punched hole 5px across at the eyelet's centre (27px down). #000 is mask
// luminance, never painted.
const HOLE =
  "radial-gradient(circle at 50% 27px, transparent 5px, #000 5.5px)";

/** A 22px paper-deep grommet with an ink rim, and a 13px inner ring. */
function Eyelet() {
  return (
    <span
      data-eyelet
      aria-hidden="true"
      className="pointer-events-none absolute top-[27px] left-1/2 -translate-1/2"
    >
      <span className="block size-[22px] rounded-full border-[1.5px] border-ink bg-paper-deep" />
      <span className="absolute top-1/2 left-1/2 block size-[13px] -translate-1/2 rounded-full border border-ink" />
    </span>
  );
}

// AnimatePresence keeps a closed dialog mounted until its fade ends. Inert
// stops that fading frame taking clicks, Tab or Enter meant for the page.
function Frame({ fade, children }: { fade: Transition; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div
      inert={!present}
      className="fixed inset-0 z-50 flex items-center justify-center px-gutter py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
    >
      {children}
    </motion.div>
  );
}
