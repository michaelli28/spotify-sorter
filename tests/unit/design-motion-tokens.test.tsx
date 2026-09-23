import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));

import {
  DURATION,
  EASE_IN,
  EASE_IN_OUT,
  EASE_OUT,
  SPRING_SETTLE,
  SPRING_SNAP,
  STAGGER,
  staggerDelay,
} from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

afterEach(() => {
  motion.reduced = false;
});

// ζ = c / (2√(k·m)). Above ~1.0 the spring is sluggish; below it overshoots,
// and the brief bans bounce.
const dampingRatio = (s: {
  stiffness: number;
  damping: number;
  mass: number;
}) => s.damping / (2 * Math.sqrt(s.stiffness * s.mass));

describe("motion tokens (brief §4.4)", () => {
  it("names the three curves exactly", () => {
    expect(EASE_OUT).toEqual([0.16, 1, 0.3, 1]);
    expect(EASE_IN).toEqual([0.7, 0, 0.84, 0]);
    expect(EASE_IN_OUT).toEqual([0.65, 0, 0.35, 1]);
  });

  it("uses two critically damped springs, so nothing bounces", () => {
    expect(SPRING_SETTLE).toEqual({
      type: "spring",
      stiffness: 200,
      damping: 28.3,
      mass: 1,
    });
    expect(SPRING_SNAP).toEqual({
      type: "spring",
      stiffness: 500,
      damping: 44.7,
      mass: 1,
    });
    expect(dampingRatio(SPRING_SETTLE)).toBeCloseTo(1, 2);
    expect(dampingRatio(SPRING_SNAP)).toBeCloseTo(1, 2);
  });

  it("keeps durations in seconds, press < hover < state < scene", () => {
    expect(DURATION).toEqual({
      press: 0.1,
      hover: 0.18,
      state: 0.24,
      sceneMin: 0.32,
      scene: 0.52,
      reduced: 0.12,
    });
  });

  it("staggers lists 24ms apart after 60ms, capped at item 12", () => {
    expect(STAGGER).toEqual({ each: 0.024, delay: 0.06, cap: 12 });
    expect(staggerDelay(0)).toBeCloseTo(0.06);
    expect(staggerDelay(1)).toBeCloseTo(0.084);
    expect(staggerDelay(12)).toBeCloseTo(0.348);
    expect(staggerDelay(40)).toBeCloseTo(staggerDelay(12));
    expect(staggerDelay(-3)).toBeCloseTo(0.06);
  });
});

describe("useMotionConfig, extended", () => {
  it("hands out the snap and settle springs", () => {
    const { result } = renderHook(() => useMotionConfig());
    expect(result.current.snap).toEqual(SPRING_SNAP);
    expect(result.current.settle).toEqual(SPRING_SETTLE);
  });

  it("goes instant under reduced motion", () => {
    motion.reduced = true;
    const { result } = renderHook(() => useMotionConfig());
    expect(result.current.snap).toEqual({ duration: 0 });
    expect(result.current.settle).toEqual({ duration: 0 });
  });
});
