"use client";
import { motion } from "framer-motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

export function ProgressBar({
  value,
  total,
  label = "Progress",
}: {
  value: number;
  total: number;
  label?: string;
}) {
  const { spring } = useMotionConfig();
  const known = total > 0;
  const now = Math.min(Math.max(value, 0), total);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? now : undefined}
      className="relative h-px w-full overflow-hidden bg-[var(--color-border-default)]"
    >
      <motion.div
        className="absolute inset-0 origin-left bg-[var(--color-accent)]"
        initial={false}
        animate={{ scaleX: known ? now / total : 0 }}
        transition={spring}
      />
    </div>
  );
}
