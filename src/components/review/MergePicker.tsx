"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/src/components/design/Button";

export interface MergePickerProps {
  sourceName: string;
  targets: readonly { id: string; name: string }[];
  onMerge: (targetId: string) => void;
  onCancel: () => void;
}

/** Type to narrow the other categories; Enter merges when one is left, and
 *  otherwise moves to the first match. */
export function MergePicker({
  sourceName,
  targets,
  onMerge,
  onCancel,
}: MergePickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLocaleLowerCase();
  const matches = q
    ? targets.filter((t) => t.name.toLocaleLowerCase().includes(q))
    : targets;

  const options = () =>
    Array.from(listRef.current?.querySelectorAll("button") ?? []);

  function onFilterKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Several left: land on the first, so a second Enter merges into a
      // name the user can see is focused, never into a guess.
      if (matches.length === 1) onMerge(matches[0]!.id);
      else options()[0]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      options()[0]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  function onOptionKey(e: KeyboardEvent<HTMLUListElement>) {
    const all = options();
    const i = all.findIndex((b) => b === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      all[Math.min(i + 1, all.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      (i <= 0 ? inputRef.current : all[i - 1])?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      role="group"
      aria-label={`Merge ${sourceName} into`}
      className="max-w-md"
    >
      <div className="flex items-baseline gap-6">
        <input
          ref={inputRef}
          type="search"
          aria-label="Filter categories"
          placeholder={`Merge ${sourceName} into…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFilterKey}
          className="min-w-0 flex-1 border-b border-[var(--color-border-default)] bg-transparent px-0 py-2 text-sm [&::-webkit-search-cancel-button]:appearance-none text-[var(--color-text-primary)] transition-colors duration-200 placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {matches.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">
          No category matches.
        </p>
      ) : (
        <ul
          ref={listRef}
          onKeyDown={onOptionKey}
          className="mt-2 max-h-64 overflow-y-auto overscroll-contain"
        >
          {matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onMerge(t.id)}
                className="block w-full py-1 text-left font-[family-name:var(--font-display)] text-lg leading-snug text-[var(--color-text-secondary)] -outline-offset-2 transition-colors duration-200 hover:text-[var(--color-text-primary)] focus-visible:text-[var(--color-text-primary)]"
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
