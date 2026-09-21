"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/src/components/design/Button";
import { Definition } from "./Definition";
import { FOCUS_RING } from "./focus";
import type { LabelCategory } from "./logic";
import type { Suggestion } from "@/src/lib/labeling/schema";

export interface TrackAnswer {
  // Unordered; the parent puts them in cache order before posting.
  category_ids: string[];
  cant_judge: boolean;
  elapsed_ms: number;
  // True when the model's suggestions were on screen while this was answered.
  // Reported per answer, not per session, so hiding them mid-run really does
  // produce blind rows from that point on.
  assisted: boolean;
}

export type SavedAnswer = Pick<TrackAnswer, "category_ids" | "cant_judge">;

// Keyed per item by the parent, so ticks and the timer start fresh per song
// but survive a failed save.
export function TrackLabeler({
  categories,
  suggestions,
  showing,
  onToggleShowing,
  wasSeen,
  onSeen,
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
  // The model's ranked guesses for this track, best first. Undefined when the
  // server was not asked for them.
  suggestions?: readonly Suggestion[];
  // Lifted to the page: Hide is a preference for the session, not a per-song
  // state. Kept local it resets on every song, which would make relabelling
  // blind cost one click per song.
  showing: boolean;
  onToggleShowing: () => void;
  // Asks whether this item already had the guesses on screen earlier this
  // session. A FUNCTION, called from the save handler rather than read during
  // render: the ref below forgets on remount, this does not, and reading a ref
  // while rendering is not guaranteed to be stable.
  wasSeen: () => boolean;
  onSeen: () => void;
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
  // `sawSuggestions` keeps the honest record per SONG: once the guesses have
  // been on screen for this one, the row is assisted even if hidden before
  // saving, because it cannot be un-seen.
  const sawSuggestions = useRef(false);
  const hasSuggestions = (suggestions?.length ?? 0) > 0;
  // Recorded in an effect, not during render: a ref written while rendering is
  // not guaranteed to stick. The effect runs after paint, and this component is
  // keyed per song, so the flag starts false for each new track and latches the
  // moment the suggestions have actually been on screen for it.
  useEffect(() => {
    if (hasSuggestions && showing) {
      sawSuggestions.current = true;
      onSeen();
    }
  }, [hasSuggestions, showing, onSeen]);

  const suggested = new Map((suggestions ?? []).map((s) => [s.category_id, s]));

  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  const elapsed = () =>
    Math.max(0, Math.round(performance.now() - shownAt.current));

  function acceptSuggestions() {
    setTicked(new Set((suggestions ?? []).map((s) => s.category_id)));
  }

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
      {hasSuggestions && (
        <div className="mb-8 border-l-2 border-[var(--color-accent)] pl-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="text-sm text-[var(--color-text-secondary)]">
              {showing
                ? "The model's guesses \u2014 these are what you are being compared against"
                : "Suggestions hidden for this song"}
            </span>
            <button
              type="button"
              onClick={onToggleShowing}
              className={`text-sm underline text-[var(--color-text-secondary)] ${FOCUS_RING}`}
            >
              {showing ? "Hide" : "Show"}
            </button>
            {showing && (
              <Button
                variant="ghost"
                onClick={acceptSuggestions}
                disabled={busy}
                className={`ml-auto ${FOCUS_RING}`}
              >
                Accept suggestions
              </Button>
            )}
          </div>
          {showing && (
            <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {(suggestions ?? []).map((s) => (
                <li
                  key={s.category_id}
                  className="text-sm text-[var(--color-text-primary)]"
                >
                  {categories.find((c) => c.id === s.category_id)?.name ??
                    s.category_id}{" "}
                  <span className="text-[var(--color-text-secondary)]">
                    {s.score}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
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
                      {showing && suggested.has(c.id) && (
                        <span className="ml-2 text-[var(--color-text-secondary)]">
                          {suggested.get(c.id)!.score}
                        </span>
                      )}
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
                  assisted: (sawSuggestions.current || wasSeen()),
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
                  assisted: (sawSuggestions.current || wasSeen()),
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
