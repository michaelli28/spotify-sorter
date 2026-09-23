"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "@/src/components/design/Dialog";
import { Button } from "@/src/components/design/Button";
import { Input } from "@/src/components/design/Input";
import { Tab } from "@/src/components/graphics/Tab";
import type { Temperature } from "@/src/lib/sleeves/temperature";

export interface MovingSong {
  trackId: string;
  title: string;
  fromCategoryId: string;
}

interface Props {
  song: MovingSong | null;
  /** Library order. Never ordered or annotated by the model's scores. */
  playlists: ReadonlyArray<{
    id: string;
    name: string;
    catalogueNo: number;
    temperature: Temperature;
  }>;
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
      <div className="sticky top-0 z-10 bg-card pb-3">
        <Input
          ref={filterRef}
          type="search"
          label="Filter categories"
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={onFilterKey}
        />
      </div>
      {options.length > 0 ? (
        <ul
          ref={listRef}
          onKeyDown={onListKey}
          className="divide-y divide-rule"
        >
          {options.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-enter-target={p.id === enterTarget || undefined}
                onClick={() => onPick(p.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-[3px] px-2 py-2.5 text-left font-semibold text-ink-2 transition-colors duration-180 ease-out hover:bg-paper-deep hover:text-ink focus-visible:outline-offset-[-2px] data-enter-target:bg-tint data-enter-target:text-ink"
              >
                {/* The catalogue tab: why this list's order isn't the
                    index's. Its name is the playlist's alone. */}
                <Tab
                  aria-hidden
                  catalogueNo={p.catalogueNo}
                  temperature={p.temperature}
                  size="review"
                />
                <span className="min-w-0 truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-ink-2">No category matches.</p>
      )}
    </Dialog>
  );
}
