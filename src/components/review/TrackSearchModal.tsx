"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Search, Check } from "lucide-react";
import type { TrackLookupEntry } from "./CategoryCard";

interface Props {
  open: boolean;
  categoryName: string;
  trackLookup: Record<string, TrackLookupEntry>;
  alreadyInCategory: Set<string>;
  onClose: () => void;
  onAdd: (trackIds: string[]) => void;
}

export function TrackSearchModal({
  open,
  categoryName,
  trackLookup,
  alreadyInCategory,
  onClose,
  onAdd,
}: Props) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Reset on open, during render rather than in an effect — a `key` remount at
  // the call site would be the other option, but it tears down AnimatePresence
  // and the modal loses its exit animation.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setPicked(new Set());
    }
  }

  const tracks = useMemo(() => Object.values(trackLookup), [trackLookup]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks.slice(0, 50);
    return tracks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist_name.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [tracks, query]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commit() {
    if (picked.size === 0) return;
    onAdd(Array.from(picked));
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-[var(--color-bg-base)]/80 backdrop-blur-sm z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="max-w-2xl w-full max-h-[80vh] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--color-border-default)]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-1">
                    Add tracks to
                  </div>
                  <div className="text-xl text-[var(--color-text-primary)]">
                    {categoryName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-1"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your scanned library…"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] focus:border-[var(--color-border-strong)] outline-none text-sm"
                />
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                Searches the {tracks.length.toLocaleString()} tracks already
                scanned from your library.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="p-6 text-sm text-[var(--color-text-tertiary)]">
                  No matches.
                </p>
              )}
              <ul>
                {filtered.map((t) => {
                  const isPicked = picked.has(t.id);
                  const inCat = alreadyInCategory.has(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => !inCat && togglePick(t.id)}
                        disabled={inCat}
                        className="w-full flex items-center gap-3 px-6 py-2 hover:bg-[var(--color-bg-surface)] disabled:opacity-50 disabled:cursor-not-allowed text-left"
                      >
                        <div
                          className={`w-5 h-5 flex items-center justify-center border flex-shrink-0 ${
                            isPicked
                              ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
                              : "border-[var(--color-border-strong)]"
                          }`}
                          aria-hidden
                        >
                          {isPicked && (
                            <Check className="w-3 h-3 text-[var(--color-bg-base)]" />
                          )}
                        </div>
                        <span className="text-sm text-[var(--color-text-primary)] flex-1 truncate">
                          {t.title}
                        </span>
                        <span className="text-sm text-[var(--color-text-tertiary)] truncate max-w-[40%]">
                          {t.artist_name}
                        </span>
                        {inCat && (
                          <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider ml-2">
                            in category
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="p-6 border-t border-[var(--color-border-default)] flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-tertiary)]">
                {picked.size} selected
              </span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commit}
                  disabled={picked.size === 0}
                  className="text-sm px-4 py-2 bg-[var(--color-accent)] text-[var(--color-bg-base)] disabled:opacity-50 hover:bg-[var(--color-accent-strong)] transition-colors"
                >
                  Add {picked.size > 0 ? `${picked.size} ` : ""}track
                  {picked.size === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
