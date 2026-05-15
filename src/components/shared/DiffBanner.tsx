"use client";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  added: number;
  removed: number;
  removedExamples: string[];
  existingCategoryCount: number;
  onApplyExisting: () => void;
  onEditCategories: () => void;
}

export function DiffBanner({
  added,
  removed,
  removedExamples,
  existingCategoryCount,
  onApplyExisting,
  onEditCategories,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-10"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-4">
        Since last run
      </div>
      <ul className="space-y-2 mb-8 font-[family-name:var(--font-mono)]">
        <li className="flex items-baseline gap-3">
          <span className="text-[var(--color-success)] w-4">+</span>
          <span className="text-[var(--color-text-primary)] w-12 text-right">
            {added}
          </span>
          <span className="text-[var(--color-text-secondary)]">new tracks</span>
        </li>
        {removed > 0 && (
          <li className="flex items-baseline gap-3">
            <span className="text-[var(--color-warning)] w-4">~</span>
            <span className="text-[var(--color-text-primary)] w-12 text-right">
              {removed}
            </span>
            <span className="text-[var(--color-text-secondary)]">
              tracks removed from your sources (still in ✨ playlists)
            </span>
          </li>
        )}
        <li className="flex items-baseline gap-3">
          <span className="text-[var(--color-text-tertiary)] w-4">·</span>
          <span className="text-[var(--color-text-primary)] w-12 text-right">
            {existingCategoryCount}
          </span>
          <span className="text-[var(--color-text-secondary)]">
            existing categories
          </span>
        </li>
      </ul>
      <div className="flex items-center gap-8">
        <Button onClick={onApplyExisting}>
          Apply with existing categories
        </Button>
        <Button variant="ghost" onClick={onEditCategories}>
          Edit categories first
        </Button>
      </div>
      {removedExamples.length > 0 && (
        <p className="mt-6 text-xs text-[var(--color-text-tertiary)]">
          Removed: {removedExamples.slice(0, 3).join(", ")}
          {removedExamples.length > 3
            ? `, +${removedExamples.length - 3} more`
            : ""}
        </p>
      )}
    </motion.div>
  );
}
