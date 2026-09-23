import type { Transition } from "framer-motion";

// Brief §4.4. Transform and opacity only; no bounce, no elastic, no loops.

/** Expo out: entrances and interactions. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Exits only. */
export const EASE_IN = [0.7, 0, 0.84, 0] as const;
/** Moves with both ends on screen: FLIP, the nav underline. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Critically damped (ζ ≈ 1): things landing. */
export const SPRING_SETTLE = {
  type: "spring",
  stiffness: 200,
  damping: 28.3,
  mass: 1,
} as const satisfies Transition;

/** Critically damped (ζ ≈ 1): small acknowledgements. */
export const SPRING_SNAP = {
  type: "spring",
  stiffness: 500,
  damping: 44.7,
  mass: 1,
} as const satisfies Transition;

/** Seconds, as framer-motion wants them. Scenes run sceneMin to scene. */
export const DURATION = {
  press: 0.1,
  hover: 0.18,
  state: 0.24,
  sceneMin: 0.32,
  scene: 0.52,
  /** A set piece's reduced version: opacity only. */
  reduced: 0.12,
} as const;

export const STAGGER = { each: 0.024, delay: 0.06, cap: 12 } as const;

/** Delay for list item i; items past the cap share one delay. */
export function staggerDelay(i: number): number {
  return STAGGER.delay + Math.min(Math.max(i, 0), STAGGER.cap) * STAGGER.each;
}
