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

export interface DialogProps {
  open: boolean;
  /** Escape, a backdrop click, and whatever the caller wires to Cancel. */
  onClose: () => void;
  /** Names the dialog. Set in the display face. */
  title: ReactNode;
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
  initialFocus,
}: DialogProps) {
  const { spring, fade } = useMotionConfig();
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
            className="absolute inset-0 bg-[var(--color-bg-base)]/85"
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
            className={clsx(
              "relative flex max-h-[85dvh] w-full flex-col outline-none",
              "border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]",
              width === "md" ? "max-w-lg" : "max-w-2xl",
            )}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: fade }}
            transition={spring}
          >
            <header className="px-panel pt-panel pb-6">
              <h2
                id={titleId}
                className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-[var(--color-text-primary)]"
              >
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  className="mt-3 text-[var(--color-text-secondary)]"
                >
                  {description}
                </p>
              )}
            </header>
            {Children.toArray(children).length > 0 && (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-panel pb-panel">
                {children}
              </div>
            )}
            {actions && (
              <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--color-border-default)] px-panel py-4">
                {actions}
              </footer>
            )}
          </motion.div>
        </Frame>
      )}
    </AnimatePresence>
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
