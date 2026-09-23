"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "@/src/components/design/Dialog";
import { Button } from "@/src/components/design/Button";
import { Input } from "@/src/components/design/Input";

export interface MovingSong {
  trackId: string;
  title: string;
  fromCategoryId: string;
}

interface Props {
  song: MovingSong | null;
  /** Library order. Never ordered or annotated by the model's scores. */
  playlists: ReadonlyArray<{ id: string; name: string }>;
  onPick: (categoryId: string) => void;
  onClose: () => void;
}

/** The keyboard and touch way to move a song: every other playlist, filterable. */
export function MoveDialog({ song, playlists, onPick, onClose }: Props) {
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [filter, setFilter] = useState("");
  // Keeps the title while the dialog fades out after `song` clears.
  const [shown, setShown] = useState(song);
  if (song && song !== shown) {
    setShown(song);
    setFilter("");
  }

  const needle = filter.trim().toLowerCase();
  const options = playlists.filter(
    (p) =>
      p.id !== shown?.fromCategoryId && p.name.toLowerCase().includes(needle),
  );
  // Enter picks the first match only once a filter has chosen one; on an
  // empty filter it would move the song somewhere nobody picked.
  const enterTarget = needle ? (options[0]?.id ?? null) : null;

  function focusOption(from: EventTarget | null, step: 1 | -1) {
    const buttons = Array.from(
      listRef.current?.querySelectorAll("button") ?? [],
    );
    const at = buttons.indexOf(from as HTMLButtonElement);
    buttons[at + step]?.focus();
  }

  function onFilterKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusOption(null, 1);
    } else if (e.key === "Enter" && enterTarget) {
      e.preventDefault();
      onPick(enterTarget);
    }
  }

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (
      e.key === "ArrowUp" &&
      e.target === listRef.current?.querySelector("button")
    ) {
      filterRef.current?.focus();
      return;
    }
    focusOption(e.target, e.key === "ArrowDown" ? 1 : -1);
  }

  return (
    <Dialog
      open={song !== null}
      onClose={onClose}
      title={`Move ‘${shown?.title ?? ""}’ to…`}
      initialFocus={filterRef}
      actions={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="sticky top-0 z-10 bg-[var(--color-bg-elevated)] pb-3">
        <Input
          ref={filterRef}
          type="search"
          aria-label="Filter playlists"
          placeholder="Filter playlists"
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={onFilterKey}
        />
      </div>
      {options.length > 0 ? (
        <ul ref={listRef} onKeyDown={onListKey} className="-mx-panel">
          {options.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-enter-target={p.id === enterTarget || undefined}
                onClick={() => onPick(p.id)}
                className="block w-full px-panel py-2 text-left font-[family-name:var(--font-display)] text-lg text-[var(--color-text-secondary)] transition-colors duration-200 hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)] focus-visible:outline-offset-[-2px] data-enter-target:bg-[var(--color-bg-surface)] data-enter-target:text-[var(--color-text-primary)]"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-[var(--color-text-tertiary)]">
          No playlist matches.
        </p>
      )}
    </Dialog>
  );
}
