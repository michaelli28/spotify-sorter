"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/src/components/design/Button";
import { Definition } from "./Definition";
import { FOCUS_RING } from "./focus";
import type { LabelCategory } from "./logic";

export interface TrackAnswer {
  // Unordered; the parent puts them in cache order before posting.
  category_ids: string[];
  cant_judge: boolean;
  elapsed_ms: number;
}

export type SavedAnswer = Pick<TrackAnswer, "category_ids" | "cant_judge">;

// Keyed per item by the parent, so ticks and the timer start fresh per song
// but survive a failed save.
export function TrackLabeler({
  categories,
  prefill,
  busy,
  error,
  canBack,
  onBack,
  canNext,
  onNext,
  onSubmit,
}: {
  categories: readonly LabelCategory[];
  // This page session's answer, if any.
  prefill: SavedAnswer | undefined;
  busy: boolean;
  error: string | null;
  canBack: boolean;
  onBack: () => void;
  canNext: boolean;
  onNext: () => void;
  onSubmit: (answer: TrackAnswer) => void;
}) {
  const uid = useId();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(prefill?.category_ids),
  );
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  const elapsed = () =>
    Math.max(0, Math.round(performance.now() - shownAt.current));

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <fieldset>
        <legend className="sr-only">Categories</legend>
        <ul className="grid gap-x-12 gap-y-5 md:grid-cols-2">
          {categories.map((c) => {
            const nameId = `${uid}-${c.id}-name`;
            const defId = `${uid}-${c.id}-def`;
            return (
              <li key={c.id}>
                <label className="group flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    data-category-id={c.id}
                    checked={ticked.has(c.id)}
                    onChange={() => toggle(c.id)}
                    aria-labelledby={nameId}
                    aria-describedby={defId}
                    className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  />
                  <span>
                    <span
                      id={nameId}
                      className="block text-[var(--color-text-primary)] transition-colors duration-200 group-hover:text-[var(--color-accent-strong)]"
                    >
                      {c.name}
                    </span>
                    <Definition
                      id={defId}
                      text={c.definition}
                      className="mt-1"
                    />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="sticky bottom-0 mt-12 border-t border-[var(--color-border-default)] bg-[var(--color-bg-base)] py-4">
        {error && (
          <p role="alert" className="mb-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {/* No ticks alone would read as "fits none", a different answer. */}
        {prefill?.cant_judge && (
          <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
            Saved as can&apos;t judge.
          </p>
        )}
        <div className="flex items-baseline gap-8">
          <Button
            variant="ghost"
            onClick={onBack}
            disabled={!canBack || busy}
            className={FOCUS_RING}
          >
            Back
          </Button>
          <Button
            variant="ghost"
            onClick={onNext}
            disabled={!canNext || busy}
            className={FOCUS_RING}
          >
            Next
          </Button>
          <div className="ml-auto flex items-baseline gap-8">
            <Button
              variant="ghost"
              disabled={busy}
              className={FOCUS_RING}
              onClick={() =>
                onSubmit({
                  category_ids: [],
                  cant_judge: true,
                  elapsed_ms: elapsed(),
                })
              }
            >
              Can&apos;t judge
            </Button>
            <Button
              disabled={busy}
              className={FOCUS_RING}
              onClick={() =>
                onSubmit({
                  category_ids: [...ticked],
                  cant_judge: false,
                  elapsed_ms: elapsed(),
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
