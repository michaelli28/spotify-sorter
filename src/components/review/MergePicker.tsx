"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { controlClass } from "@/src/components/design/Input";
import { Tab } from "@/src/components/graphics/Tab";
import type { Temperature } from "@/src/lib/sleeves/temperature";

export interface MergePickerProps {
  sourceName: string;
  targets: readonly {
    id: string;
    name: string;
    catalogueNo: number;
    temperature: Temperature;
  }[];
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
      <div className="flex items-end gap-6">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">Merge {sourceName} into…</span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Type to filter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFilterKey}
            className={clsx(
              controlClass(),
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />
        </label>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {matches.length === 0 ? (
        <p className="mt-3 text-ink-2">No category matches.</p>
      ) : (
        <ul
          ref={listRef}
          onKeyDown={onOptionKey}
          className="mt-2 max-h-64 divide-y divide-rule overflow-y-auto overscroll-contain"
        >
          {/* Classify's Move to… rows: the tab is the category's identity on
              every page; the name alone names the option. */}
          {matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onMerge(t.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-[3px] px-2 py-2.5 text-left font-semibold text-ink-2 transition-colors duration-180 ease-out hover:bg-paper-deep hover:text-ink focus-visible:text-ink focus-visible:outline-offset-[-2px]"
              >
                <Tab
                  aria-hidden
                  catalogueNo={t.catalogueNo}
                  temperature={t.temperature}
                  size="review"
                />
                <span className="min-w-0 truncate">{t.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
