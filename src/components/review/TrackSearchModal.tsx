"use client";
import { useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/src/components/design/Button";
import { Dialog } from "@/src/components/design/Dialog";
import { Input } from "@/src/components/design/Input";

export interface TrackLookupEntry {
  id: string;
  title: string;
  artist_name: string;
}

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
  const searchRef = useRef<HTMLInputElement>(null);

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
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      initialFocus={searchRef}
      title={
        <>
          Add tracks to <em>{categoryName}</em>
        </>
      }
      actions={
        <>
          <Button onClick={commit} disabled={picked.size === 0}>
            Add {picked.size > 0 ? `${picked.size} ` : ""}track
            {picked.size === 1 ? "" : "s"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="sticky top-0 z-10 bg-[var(--color-bg-elevated)] pb-4">
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search your scanned library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your scanned library…"
          className="[&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      {filtered.length === 0 && (
        <p className="py-2 text-sm text-[var(--color-text-tertiary)]">
          No matches.
        </p>
      )}
      <ul className="-mx-panel">
        {filtered.map((t) => {
          const isPicked = picked.has(t.id);
          const inCat = alreadyInCategory.has(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => !inCat && togglePick(t.id)}
                disabled={inCat}
                aria-pressed={inCat ? undefined : isPicked}
                className="flex w-full items-center gap-3 px-panel py-2 text-left hover:bg-[var(--color-bg-surface)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center border ${
                    isPicked
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                      : "border-[var(--color-border-strong)]"
                  }`}
                  aria-hidden
                >
                  {isPicked && (
                    <Check className="h-3 w-3 text-[var(--color-bg-base)]" />
                  )}
                  {inCat && (
                    <Check
                      strokeWidth={1.25}
                      className="h-3 w-3 text-[var(--color-text-secondary)]"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text-primary)]">
                  {t.title}
                </span>
                <span className="max-w-[40%] truncate text-sm text-[var(--color-text-secondary)]">
                  {t.artist_name}
                </span>
                {/* A dimmed, ticked row reads as "already in"; a label ate
                    the title's width on a phone. */}
                {inCat && <span className="sr-only">, already in category</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
