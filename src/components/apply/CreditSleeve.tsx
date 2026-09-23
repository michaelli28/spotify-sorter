"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Sleeve, registrationShift } from "@/src/components/graphics/Sleeve";
import {
  DURATION,
  EASE_IN,
  EASE_OUT,
  SPRING_SETTLE,
} from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { SleeveSpec } from "@/src/lib/sleeves/spec";
import type { SleeveState } from "./print-run";

const SIZE = 36;
/** How far drum B sits out of register until the cover is on Spotify, in screen px. */
const OUT_PX = 5;
/** Drum A's print slide (brief §4.4 C: x -6 → 0), in screen px. */
const SLIDE_PX = 6;

/**
 * Drum B's factor while its cover isn't on Spotify. The brief's 4× moves it
 * under 3px at 36px, which reads as in register; this holds about OUT_PX on
 * screen, and never less than 4×.
 */
export function outOfRegister(spec: SleeveSpec, size: number): number {
  const offset = Math.max(Math.abs(spec.dx), Math.abs(spec.dy));
  return Math.max(4, 1 + (OUT_PX * 100) / (offset * size));
}

/** Drum A's print slide in sleeve units (a 100-unit viewBox at `size` px). */
export function printSlide(size: number): number {
  return (-SLIDE_PX * 100) / size;
}

// The empty slot under the sleeve. Only the one on the press and the one an
// error stopped at differ from the blank stock around them.
const SLOT: Record<SleeveState, string> = {
  proof: "border-transparent",
  pending: "border-rule-strong",
  current: "border-ink",
  failed: "border-danger",
  printed: "border-transparent",
  registered: "border-transparent",
};

export interface CreditSleeveProps {
  spec: SleeveSpec;
  state: SleeveState;
  /** Spoken state, while rows differ (the run); otherwise decorative. */
  label?: string;
  /** A price-gun sticker: this run created the playlist (a mixed run only). */
  fresh?: boolean;
  /** Keep this slot in view while it is on the press. */
  follow?: boolean;
}

/**
 * One credit (brief §4.4 C, spec §7.1). Drum A prints as the playlist is
 * written; drum B prints out of register and locks in (SPRING_SETTLE) only
 * once the cover upload succeeds. Reduced: a 150ms fade, no travel, and the
 * registration still tells whether the cover landed.
 */
export function CreditSleeve({
  spec,
  state,
  label,
  fresh = false,
  follow = false,
}: CreditSleeveProps) {
  const { reduced } = useMotionConfig();
  const slot = useRef<HTMLSpanElement>(null);
  const inked =
    state === "proof" || state === "printed" || state === "registered";
  const spoken =
    [fresh ? "New playlist" : null, label].filter(Boolean).join(". ") ||
    undefined;
  const locked = state === "proof" || state === "registered";

  // The print run is the page's one loud moment: on a phone most of it prints
  // below the fold. "nearest" moves the page only when the row is out of view.
  useEffect(() => {
    if (state !== "current" || !follow) return;
    // The whole row, so its count bar isn't cut at the fold.
    const row = slot.current?.closest("li") ?? slot.current;
    row?.scrollIntoView?.({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [state, follow, reduced]);
  const print = reduced
    ? { duration: 0.15 }
    : { duration: DURATION.hover, ease: EASE_OUT };
  const lift = reduced
    ? { duration: 0.15 }
    : { duration: DURATION.reduced, ease: EASE_IN };

  return (
    <span
      ref={slot}
      data-state={state}
      aria-current={state === "current" ? "step" : undefined}
      {...(spoken
        ? { role: "img", "aria-label": spoken }
        : { "aria-hidden": true })}
      className="relative row-span-2 block size-9 self-center"
    >
      <span
        aria-hidden
        className={clsx(
          "absolute inset-0 border border-dashed transition-colors duration-180 motion-reduce:transition-none",
          SLOT[state],
        )}
      />
      {state === "failed" && (
        <svg
          aria-hidden
          viewBox="0 0 36 36"
          className="absolute inset-0 size-full stroke-danger"
          strokeWidth={1.5}
        >
          <path d="M13 13l10 10M23 13L13 23" />
        </svg>
      )}
      <motion.span
        className="absolute inset-0 block"
        initial={false}
        animate={{ opacity: inked ? 1 : 0 }}
        transition={inked ? print : lift}
      >
        <Sleeve
          spec={spec}
          size={SIZE}
          className="block border border-ink"
          drumA={{
            initial: false,
            animate: { x: inked ? 0 : printSlide(SIZE) },
            transition: print,
          }}
          drumB={{
            initial: false,
            animate: {
              opacity: inked ? 1 : 0,
              ...(locked
                ? { x: 0, y: 0 }
                : registrationShift(spec, outOfRegister(spec, SIZE))),
            },
            transition: {
              opacity: { ...print, delay: inked && !reduced ? 0.09 : 0 },
              x: SPRING_SETTLE,
              y: SPRING_SETTLE,
            },
          }}
        />
      </motion.span>
      {fresh && inked && (
        // Stamped once the sleeve prints (brief §4.4: rotate 12 → 4, scale 0.92 → 1).
        <motion.span
          aria-hidden
          className="mono absolute inset-x-0 -bottom-2 z-10 mx-auto w-fit rounded-[2px] border border-ink bg-card px-1 leading-tight text-ink"
          initial={
            reduced
              ? { opacity: 0, rotate: 4 }
              : { opacity: 0, rotate: 12, scale: 0.92 }
          }
          animate={{ opacity: 1, rotate: 4, scale: 1 }}
          transition={
            reduced
              ? { duration: 0.15 }
              : { duration: DURATION.state, ease: EASE_OUT, delay: 0.16 }
          }
        >
          new
        </motion.span>
      )}
    </span>
  );
}
