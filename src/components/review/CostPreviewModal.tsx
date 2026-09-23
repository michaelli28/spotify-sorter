"use client";
import { useRef } from "react";
import { Button, type ButtonVariant } from "@/src/components/design/Button";
import { Dialog } from "@/src/components/design/Dialog";
import type { CategoryRename } from "@/src/lib/categories/edits";

export interface CacheBreakdown {
  totalTracks: number;
  alreadyDone: number;
  fresh: number;
  fullCostUsd?: number;
}

interface Props {
  open: boolean;
  /** Categories this save would delete. Named here because it is the only
   *  destructive half of a button labelled with a price. */
  removing?: { id: string; name: string }[];
  /** Renames break /label exactly as deletions do: it matches by name. */
  renaming?: CategoryRename[];
  /** New categories break /label too: each needs its own heading. */
  adding?: number;
  /** One line each, for consequences the price doesn't show. */
  notes?: string[];
  estimateUsd: { low: number; high: number };
  message: string;
  breakdown?: CacheBreakdown;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  /** "danger" also starts focus on Not yet, so Enter can't wipe anything. */
  confirmVariant?: ButtonVariant;
}

const count = (n: number) => `${n} ${n === 1 ? "category" : "categories"}`;

export function CostPreviewModal({
  open,
  removing = [],
  renaming = [],
  adding = 0,
  notes = [],
  estimateUsd,
  message,
  breakdown,
  onConfirm,
  onCancel,
  confirmLabel = "Proceed",
  confirmVariant = "primary",
}: Props) {
  const notYetRef = useRef<HTMLButtonElement>(null);
  const breaksLabel = removing.length > 0 || renaming.length > 0 || adding > 0;
  const low = estimateUsd.low.toFixed(2);
  const high = estimateUsd.high.toFixed(2);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      initialFocus={confirmVariant === "danger" ? notYetRef : undefined}
      title={
        <>
          <span className="sr-only">Estimated cost </span>${low}
          {high !== low && (
            <>
              <span className="text-[var(--color-text-tertiary)]"> — </span>$
              {high}
            </>
          )}
        </>
      }
      description={message}
      actions={
        <>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button ref={notYetRef} variant="ghost" onClick={onCancel}>
            Not yet
          </Button>
        </>
      }
    >
      {(breaksLabel || notes.length > 0) && (
        <div className="mb-6 space-y-4">
          {removing.length > 0 && (
            <div className="space-y-1">
              <p className="text-[var(--color-danger)]">
                This also deletes {count(removing.length)}:
              </p>
              <p className="text-sm text-[var(--color-text-primary)]">
                {removing.map((c) => c.name).join(", ")}
              </p>
            </div>
          )}
          {renaming.length > 0 && (
            <div className="space-y-1">
              <p className="text-[var(--color-text-secondary)]">
                Renames {count(renaming.length)}:
              </p>
              <ul className="text-sm text-[var(--color-text-primary)]">
                {renaming.map((r) => (
                  <li key={r.id}>
                    {r.from} → {r.to}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2 text-sm text-[var(--color-text-tertiary)]">
            {breaksLabel && (
              <p>
                The labelling page needs one heading per category in
                definitions.md, so it will refuse to load until that file
                matches.
              </p>
            )}
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      )}
      {breakdown && (
        <dl className="space-y-1.5 border-t border-[var(--color-border-default)] pt-5 text-sm text-[var(--color-text-secondary)]">
          <div className="flex justify-between">
            <dt>Total tracks</dt>
            <dd className="text-[var(--color-text-primary)]">
              {breakdown.totalTracks.toLocaleString()}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Already classified (free)</dt>
            <dd className="text-[var(--color-text-primary)]">
              {breakdown.alreadyDone.toLocaleString()}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>New this run</dt>
            <dd className="text-[var(--color-text-primary)]">
              {breakdown.fresh.toLocaleString()}
            </dd>
          </div>
          {breakdown.fullCostUsd !== undefined &&
            breakdown.fullCostUsd > estimateUsd.high && (
              <div className="flex justify-between">
                <dt>Saved by reusing cache</dt>
                <dd className="text-[var(--color-text-primary)]">
                  ~${(breakdown.fullCostUsd - estimateUsd.high).toFixed(2)}
                </dd>
              </div>
            )}
        </dl>
      )}
    </Dialog>
  );
}
