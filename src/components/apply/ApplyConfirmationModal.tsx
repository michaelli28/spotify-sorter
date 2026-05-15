"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  open: boolean;
  toCreate: number;
  toUpdate: number;
  totalTracks: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ApplyConfirmationModal({
  open,
  toCreate,
  toUpdate,
  totalTracks,
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
        >
          <motion.div
            className="max-w-lg w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
              Final step
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-text-primary)] mb-6 leading-tight">
              About to write to your Spotify account.
            </h2>
            <ul className="space-y-2 text-[var(--color-text-secondary)] mb-10">
              <li>
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)] mr-2">
                  {toCreate}
                </span>
                new playlists will be created.
              </li>
              {toUpdate > 0 && (
                <li>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)] mr-2">
                    {toUpdate}
                  </span>
                  existing playlists will be updated.
                </li>
              )}
              <li>
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)] mr-2">
                  {totalTracks}
                </span>
                tracks added in total.
              </li>
              <li className="text-sm pt-3">
                All playlists private by default.
              </li>
            </ul>
            <div className="flex items-center gap-6">
              <Button onClick={onConfirm}>Apply</Button>
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
