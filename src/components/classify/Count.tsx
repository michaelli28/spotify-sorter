"use client";
import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { SPRING, useMotionConfig } from "@/src/hooks/useMotionConfig";

const { stiffness, damping, mass } = SPRING;

/**
 * A track count that re-flows on the brief's spring when the slider or a move
 * changes it, so each playlist settles in proportion to how much it changed.
 * Hidden from assistive tech: the owning control carries the exact number.
 */
export function Count({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const { reduced } = useMotionConfig();
  const spring = useSpring(value, { stiffness, damping, mass });
  const text = useTransform(spring, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [spring, value, reduced]);

  return (
    <motion.span aria-hidden className={className}>
      {text}
    </motion.span>
  );
}
