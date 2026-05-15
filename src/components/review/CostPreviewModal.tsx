"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  open: boolean;
  estimateUsd: { low: number; high: number };
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CostPreviewModal({
  open,
  estimateUsd,
  message,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-[var(--color-bg-base)]/80 backdrop-blur-sm z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="max-w-lg w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
              Cost estimate
            </div>
            <div className="font-[family-name:var(--font-display)] text-5xl text-[var(--color-text-primary)] mb-6">
              ${estimateUsd.low.toFixed(2)}
              <span className="text-[var(--color-text-tertiary)]"> — </span>$
              {estimateUsd.high.toFixed(2)}
            </div>
            <p className="text-[var(--color-text-secondary)] mb-10">
              {message}
            </p>
            <div className="flex items-center gap-6">
              <Button onClick={onConfirm}>Proceed</Button>
              <Button variant="ghost" onClick={onCancel}>
                Not yet
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
