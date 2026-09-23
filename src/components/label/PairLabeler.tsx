"use client";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/src/components/design/Button";
import { Definition } from "./Definition";
import { ErrorLine } from "./ErrorLine";
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
  showing,
  onToggleShowing,
  wasSeen,
  onSeen,
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
  // Session-level, same reason as the track labeler.
  showing: boolean;
  onToggleShowing: () => void;
  // Asks whether this item already had the guesses on screen earlier this
  // session. A FUNCTION, called from the save handler rather than read during
  // render: the ref below forgets on remount, this does not, and reading a ref
  // while rendering is not guaranteed to be stable.
  wasSeen: () => boolean;
  onSeen: () => void;
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
  // Once the score has been displayed for this pair the row stays assisted: it
  // cannot be un-seen.
  const sawSuggestion = useRef(false);
  const hasSuggestion = suggestion !== undefined;
  useEffect(() => {
    if (hasSuggestion && showing) {
      sawSuggestion.current = true;
      onSeen();
    }
  }, [hasSuggestion, showing, onSeen]);

  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  return (
    <div className="max-w-xl border-t border-[var(--color-border-default)] pt-8 lg:border-t-0 lg:pt-0">
      <p
        id={nameId}
        className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--color-text-primary)]"
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
              onClick={onToggleShowing}
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
      <ErrorLine error={error} className="mt-6" />
      {saved && (
        <p className="mt-6 text-sm text-[var(--color-text-secondary)]">
          Saved as {ANSWERS.find((a) => a.id === saved)!.label.toLowerCase()}.
        </p>
      )}
      {/* Answers get their own row: Next beside Yes invited a mis-tap on a
          write that can't be taken back. Yes and No weigh the same. */}
      <div
        role="group"
        aria-labelledby={nameId}
        className="mt-8 flex flex-wrap items-baseline gap-x-10"
      >
        {ANSWERS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            className={a.id === "cant_judge" ? CANT_JUDGE : VERDICT}
            onClick={() =>
              onAnswer(
                a.id,
                Math.max(0, Math.round(performance.now() - shownAt.current)),
                sawSuggestion.current || wasSeen(),
              )
            }
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="mt-8 flex items-center gap-3 border-t border-[var(--color-border-default)] pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={!canBack || busy}
        >
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNext}
          disabled={!canNext || busy}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

const ANSWER =
  "inline-flex min-h-11 items-center px-1 tracking-tight transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const VERDICT = `${ANSWER} text-lg font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]`;
const CANT_JUDGE = `${ANSWER} text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]`;
