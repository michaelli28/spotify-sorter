"use client";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/src/components/design/Button";
import { Definition } from "./Definition";
import { ErrorLine } from "./ErrorLine";
import type { LabelCategory } from "./logic";
import { GUESSES_WELL } from "./styles";
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
    <div className="max-w-xl border-t border-rule pt-8 desk:border-t-0 desk:pt-0">
      <p
        id={nameId}
        className="font-display text-title text-balance text-ink [overflow-wrap:anywhere]"
      >
        {category.name}
      </p>
      <Definition text={category.definition} className="mt-3" />
      {hasSuggestion && (
        <div className={`mt-6 ${GUESSES_WELL}`}>
          <div className="flex flex-wrap items-center gap-x-6">
            <span className="basis-full pt-1.5 text-sm text-ink-2">
              {!showing
                ? "The model's answer is hidden for this pair"
                : suggestion.score === null
                  ? "The model did not rank this category for this song \u2014 it says no"
                  : `The model scored this ${suggestion.score} and says ${suggestion.verdict}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleShowing}
            >
              {showing ? "Hide" : "Show"}
            </Button>
            {showing && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                className="ml-auto"
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
        <p className="mt-6 text-sm text-ink-2">
          Saved as {ANSWERS.find((a) => a.id === saved)!.label.toLowerCase()}.
        </p>
      )}
      {/* Answers get their own row: Next beside Yes invited a mis-tap on a
          write that can't be taken back. Yes and No weigh the same. */}
      <div
        role="group"
        aria-labelledby={nameId}
        className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3"
      >
        {ANSWERS.map((a) => {
          const answer = () =>
            onAnswer(
              a.id,
              Math.max(0, Math.round(performance.now() - shownAt.current)),
              sawSuggestion.current || wasSeen(),
            );
          return a.id === "cant_judge" ? (
            <Button
              key={a.id}
              variant="ghost"
              disabled={busy}
              onClick={answer}
            >
              {a.label}
            </Button>
          ) : (
            <Button variant="ink"
              key={a.id}
              disabled={busy}
              className="min-w-24"
              onClick={answer}
            >
              {a.label}
            </Button>
          );
        })}
      </div>
      <div className="mt-10 flex items-center gap-5 border-t border-rule pt-3">
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
