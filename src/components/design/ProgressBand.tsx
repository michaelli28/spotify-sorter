"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

export interface ProgressBandProps {
  value: number;
  /** 0 or less while unknown: the bar reports no value. */
  total: number;
  label: string;
  /** Its width: the band fills whatever it is given. */
  className?: string;
}

/**
 * A run's progress in the top strip (brief §4.4 B): an ink band growing
 * value / total on SPRING_SETTLE, in a paper-deep well.
 */
export function ProgressBand({
  value,
  total,
  label,
  className,
}: ProgressBandProps) {
  const { settle } = useMotionConfig();
  const known = total > 0;
  const now = Math.min(Math.max(value, 0), known ? total : 0);
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? now : undefined}
      className={clsx(
        "relative block h-2.5 overflow-hidden rounded-[2px] border border-rule-strong bg-paper-deep",
        className,
      )}
    >
      <motion.span
        className="absolute inset-0 origin-left bg-ink"
        initial={false}
        animate={{ scaleX: known ? now / total : 0 }}
        transition={settle}
      />
    </span>
  );
}
