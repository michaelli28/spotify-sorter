"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

export interface CacheBreakdown {
  totalTracks: number;
  alreadyDone: number;
  fresh: number;
  fullCostUsd?: number;
}

interface Props {
  open: boolean;
  estimateUsd: { low: number; high: number };
  message: string;
  breakdown?: CacheBreakdown;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export function CostPreviewModal({
  open,
  estimateUsd,
  message,
  breakdown,
  onConfirm,
  onCancel,
  confirmLabel = "Proceed",
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
            <div className="font-[family-name:var(--font-display)] text-5xl tracking-tight text-[var(--color-text-primary)] mb-6">
              ${estimateUsd.low.toFixed(2)}
              <span className="text-[var(--color-text-tertiary)]"> — </span>$
              {estimateUsd.high.toFixed(2)}
            </div>
            <p className="text-[var(--color-text-secondary)] mb-6">{message}</p>
            {breakdown && (
              <div className="mb-8 border-t border-[var(--color-border-default)] pt-5 space-y-1.5 text-sm text-[var(--color-text-secondary)]">
                <div className="flex justify-between">
                  <span>Total tracks</span>
                  <span className="text-[var(--color-text-primary)]">
                    {breakdown.totalTracks.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Already classified (free)</span>
                  <span className="text-[var(--color-text-primary)]">
                    {breakdown.alreadyDone.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>New this run</span>
                  <span className="text-[var(--color-text-primary)]">
                    {breakdown.fresh.toLocaleString()}
                  </span>
                </div>
                {breakdown.fullCostUsd !== undefined &&
                  breakdown.fullCostUsd > estimateUsd.high && (
                    <div className="flex justify-between pt-2 mt-2 border-t border-[var(--color-border-default)] text-[var(--color-accent)]">
                      <span>Saved by reusing cache</span>
                      <span>
                        ~$
                        {(breakdown.fullCostUsd - estimateUsd.high).toFixed(2)}
                      </span>
                    </div>
                  )}
              </div>
            )}
            <div className="flex items-center gap-6">
              <Button onClick={onConfirm}>{confirmLabel}</Button>
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
