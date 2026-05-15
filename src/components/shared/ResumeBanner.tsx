"use client";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  lastRunSummary: string;
  classifiedFraction: { done: number; total: number };
  onResume: () => void;
  onStartFresh: () => void;
}

export function ResumeBanner({
  lastRunSummary,
  classifiedFraction,
  onResume,
  onStartFresh,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-8 max-w-2xl"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
        A run was interrupted.
      </div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)] mb-2">
        {classifiedFraction.done} of {classifiedFraction.total} tracks were
        classified.
      </h2>
      <p className="text-[var(--color-text-secondary)] mb-6">
        {lastRunSummary}
      </p>
      <div className="flex items-center gap-6">
        <Button onClick={onResume}>Resume</Button>
        <Button variant="ghost" onClick={onStartFresh}>
          Start fresh
        </Button>
      </div>
    </motion.div>
  );
}
