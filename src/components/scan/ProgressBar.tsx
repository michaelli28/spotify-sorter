"use client";
import { motion } from "framer-motion";

export function ProgressBar({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="h-px bg-[var(--color-border-default)] w-full relative overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 bg-[var(--color-accent)]"
        style={{ width: `${pct}%` }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 100, damping: 25 }}
      />
    </div>
  );
}
