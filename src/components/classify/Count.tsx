"use client";
import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { SPRING_SNAP } from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

const { stiffness, damping, mass } = SPRING_SNAP;
const plain = (n: number) => n.toLocaleString("en-US");

/**
 * A track count that ticks to its new value on SPRING_SNAP (brief §4.4 B)
 * when the ruler, a move or a batch changes it. Hidden from assistive tech:
 * the owning control carries the exact number.
 */
export function Count({
  value,
  format = plain,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const { reduced } = useMotionConfig();
  const spring = useSpring(value, { stiffness, damping, mass });
  const text = useTransform(spring, (v) => format(Math.round(v)));

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
