"use client";
import { useReducedMotion } from "framer-motion";

export function useMotionConfig() {
  const reduced = useReducedMotion();
  return {
    reduced: !!reduced,
    spring: reduced
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 200, damping: 30, mass: 0.8 },
    pageEase: reduced
      ? { duration: 0 }
      : {
          duration: 0.6,
          ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
        },
    stagger: reduced
      ? { staggerChildren: 0, delayChildren: 0 }
      : { staggerChildren: 0.04, delayChildren: 0.1 },
  };
}
