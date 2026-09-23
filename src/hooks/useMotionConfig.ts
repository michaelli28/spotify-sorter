"use client";
import {
  useReducedMotion,
  type Transition,
  type Variants,
} from "framer-motion";
import {
  EASE_OUT,
  SPRING_SETTLE,
  SPRING_SNAP,
  STAGGER,
  staggerDelay,
} from "@/src/components/design/motion";

/** Legacy names for the brief §4.4 tokens: remove after pages migrate. */
export const SPRING = SPRING_SETTLE;
export const EASE_OUT_EXPO = EASE_OUT;

export interface MotionTokens {
  reduced: boolean;
  spring: Transition;
  pageEase: Transition;
  stagger: { staggerChildren: number; delayChildren: number };
  /** Opacity-only changes: backdrops, swaps. */
  fade: Transition;
  /** hidden → visible list-item variants. Identical when reduced. */
  item: Variants;
  /** Delay for list item i, capped at index 12. 0 when reduced. */
  itemDelay: (i: number) => number;
  /** SPRING_SNAP: small acknowledgements (nav underline, tab bumps). */
  snap: Transition;
  /** SPRING_SETTLE: things landing. */
  settle: Transition;
}

const FULL: Readonly<MotionTokens> = {
  reduced: false,
  spring: SPRING,
  pageEase: { duration: 0.6, ease: EASE_OUT },
  stagger: { staggerChildren: STAGGER.each, delayChildren: STAGGER.delay },
  fade: { duration: 0.2 },
  item: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } },
  itemDelay: staggerDelay,
  snap: SPRING_SNAP,
  settle: SPRING_SETTLE,
};

const REDUCED: Readonly<MotionTokens> = {
  reduced: true,
  spring: { duration: 0 },
  pageEase: { duration: 0 },
  stagger: { staggerChildren: 0, delayChildren: 0 },
  fade: { duration: 0 },
  item: { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } },
  itemDelay: () => 0,
  snap: { duration: 0 },
  settle: { duration: 0 },
};

// MotionConfig reducedMotion="user" (PageTransition) already stops transforms;
// this also zeroes the opacity fades and stagger delays it leaves running.
export function useMotionConfig(): Readonly<MotionTokens> {
  return useReducedMotion() ? REDUCED : FULL;
}
