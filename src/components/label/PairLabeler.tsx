"use client";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/src/components/design/Button";
import { Definition } from "./Definition";
import { FOCUS_RING } from "./focus";
import type { LabelCategory } from "./logic";

export type PairAnswer = "yes" | "no" | "cant_judge";

const ANSWERS: ReadonlyArray<{ id: PairAnswer; label: string }> = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "cant_judge", label: "Can't judge" },
];

// Keyed per pair by the parent, so the timer starts when the pair is shown.
export function PairLabeler({
  category,
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
  // This page session's answer, if any.
  saved: PairAnswer | undefined;
  busy: boolean;
  error: string | null;
  canBack: boolean;
  onBack: () => void;
  canNext: boolean;
  onNext: () => void;
  onAnswer: (answer: PairAnswer, elapsed_ms: number) => void;
}) {
  const nameId = useId();
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
