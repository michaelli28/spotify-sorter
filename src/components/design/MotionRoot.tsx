"use client";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Root layout only: no transforms anywhere when the OS asks for less motion. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
