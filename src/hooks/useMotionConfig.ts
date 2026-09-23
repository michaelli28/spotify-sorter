"use client";
import {
  useReducedMotion,
  type Transition,
  type Variants,
} from "framer-motion";

export const SPRING = {
  type: "spring",
  stiffness: 200,
  damping: 30,
  mass: 0.8,
} as const satisfies Transition;

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

// Past this index items share one delay, so a 41-card grid is fully in by
// ~0.6s instead of ~1.7s.
const STAGGER_CAP = 12;

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
}

const FULL: Readonly<MotionTokens> = {
  reduced: false,
  spring: SPRING,
  pageEase: { duration: 0.6, ease: EASE_OUT_EXPO },
  stagger: { staggerChildren: 0.04, delayChildren: 0.1 },
  fade: { duration: 0.2 },
  item: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } },
  itemDelay: (i) => Math.min(Math.max(i, 0), STAGGER_CAP) * 0.04 + 0.1,
};

const REDUCED: Readonly<MotionTokens> = {
  reduced: true,
  spring: { duration: 0 },
  pageEase: { duration: 0 },
  stagger: { staggerChildren: 0, delayChildren: 0 },
  fade: { duration: 0 },
  item: { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } },
  itemDelay: () => 0,
};

// MotionConfig reducedMotion="user" (PageTransition) already stops transforms;
// this also zeroes the opacity fades and stagger delays it leaves running.
export function useMotionConfig(): Readonly<MotionTokens> {
  return useReducedMotion() ? REDUCED : FULL;
}
