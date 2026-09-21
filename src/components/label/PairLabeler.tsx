"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/src/components/design/Button";
import { Definition } from "./Definition";
import { FOCUS_RING } from "./focus";
import type { LabelCategory } from "./logic";
import type { PairSuggestion } from "@/src/lib/labeling/schema";

export type PairAnswer = "yes" | "no" | "cant_judge";

const ANSWERS: ReadonlyArray<{ id: PairAnswer; label: string }> = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "cant_judge", label: "Can't judge" },
];

// Keyed per pair by the parent, so the timer starts when the pair is shown.
export function PairLabeler({
  category,
  suggestion,
  saved,
  busy,
  error,
  canBack,
  onBack,
  canNext,
  onNext,
  onAnswer,
}: {
  category: LabelCategory;
  // The model's own answer to this pair. Undefined when the server was not
  // asked for it.
  suggestion?: PairSuggestion;
  // This page session's answer, if any.
  saved: PairAnswer | undefined;
  busy: boolean;
  error: string | null;
  canBack: boolean;
  onBack: () => void;
  canNext: boolean;
  onNext: () => void;
  onAnswer: (answer: PairAnswer, elapsed_ms: number, assisted: boolean) => void;
}) {
  const nameId = useId();
  // Starts shown. Hide makes THIS pair blind again, but once the score has been
  // displayed the row stays assisted: it cannot be un-seen.
  const [showing, setShowing] = useState(true);
  const sawSuggestion = useRef(false);
  const hasSuggestion = suggestion !== undefined;
  useEffect(() => {
    if (hasSuggestion && showing) sawSuggestion.current = true;
  }, [hasSuggestion, showing]);

  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  return (
    <div className="max-w-xl border-t border-[var(--color-border-default)] pt-8">
      <p
        id={nameId}
        className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)]"
      >
        {category.name}
      </p>
      <Definition text={category.definition} className="mt-2" />
      {hasSuggestion && (
        <div className="mt-6 border-l-2 border-[var(--color-accent)] pl-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="text-sm text-[var(--color-text-secondary)]">
              {!showing
                ? "The model's answer is hidden for this pair"
                : suggestion.score === null
                  ? "The model did not rank this category for this song \u2014 it says no"
                  : `The model scored this ${suggestion.score} and says ${suggestion.verdict}`}
            </span>
            <button
              type="button"
              onClick={() => setShowing((v) => !v)}
              className={`text-sm underline text-[var(--color-text-secondary)] ${FOCUS_RING}`}
            >
              {showing ? "Hide" : "Show"}
            </button>
            {showing && (
              <Button
                variant="ghost"
                disabled={busy}
                className={`ml-auto ${FOCUS_RING}`}
                onClick={() =>
                  onAnswer(
                    suggestion.verdict,
                    Math.max(
                      0,
                      Math.round(performance.now() - shownAt.current),
                    ),
                    true,
                  )
                }
              >
                Accept suggestion
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-6 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {saved && (
        <p className="mt-6 text-sm text-[var(--color-text-secondary)]">
          Saved as {ANSWERS.find((a) => a.id === saved)!.label.toLowerCase()}.
        </p>
      )}
      <div className="mt-8 flex items-baseline gap-8">
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
        <div
          role="group"
          aria-labelledby={nameId}
          className="ml-auto flex items-baseline gap-10"
        >
          {ANSWERS.map((a) => (
            <Button
              key={a.id}
              variant={a.id === "cant_judge" ? "ghost" : "primary"}
              disabled={busy}
              className={FOCUS_RING}
              onClick={() =>
                onAnswer(
                  a.id,
                  Math.max(0, Math.round(performance.now() - shownAt.current)),
                  sawSuggestion.current,
                )
              }
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
