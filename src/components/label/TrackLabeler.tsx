"use client";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { Definition } from "./Definition";
import { ErrorLine } from "./ErrorLine";
import type { LabelCategory } from "./logic";
import { GUESSES_WELL } from "./styles";
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
        <div className={clsx("mb-6", GUESSES_WELL)}>
          <div className="flex flex-wrap items-center gap-x-6">
            <span className="basis-full pt-1.5 text-sm text-ink-2">
              {showing
                ? "The model's guesses \u2014 these are what you are being compared against"
                : "Suggestions hidden for this song"}
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
                onClick={acceptSuggestions}
                disabled={busy}
                className="ml-auto"
              >
                Accept suggestions
              </Button>
            )}
          </div>
          {showing && (
            <ol className="flex flex-wrap gap-x-5 gap-y-1 pb-2 max-tab:flex-col">
              {(suggestions ?? []).map((s) => (
                <li key={s.category_id} className="text-sm text-ink">
                  {categories.find((c) => c.id === s.category_id)?.name ??
                    s.category_id}{" "}
                  <span className="num text-ink-2">{s.score}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {/* Locked while a save or bulk run is in flight: a tick made then is
          thrown away when the song moves on. The answer sheet is card stock;
          -mt-px tucks the first row's rule under the card's clipped edge. */}
      <fieldset
        disabled={busy}
        className="min-w-0 overflow-hidden rounded-[3px] border border-rule-strong bg-card disabled:pointer-events-none disabled:opacity-50"
      >
        <legend className="sr-only">Categories</legend>
        {/* One column beside the song rail, two where the list has the page. */}
        <ul className="-mt-px grid px-4 tab:grid-cols-2 tab:gap-x-10 tab:px-6 desk:grid-cols-1">
          {categories.map((c) => {
            const nameId = `${uid}-${c.id}-name`;
            const defId = `${uid}-${c.id}-def`;
            return (
              <li key={c.id} className="border-t border-rule">
                <label className="group flex cursor-pointer gap-3.5 py-3.5">
                  <input
                    type="checkbox"
                    data-category-id={c.id}
                    checked={ticked.has(c.id)}
                    onChange={() => toggle(c.id)}
                    aria-labelledby={nameId}
                    aria-describedby={defId}
                    className={STAMP}
                  />
                  <span className="min-w-0">
                    <span
                      id={nameId}
                      className="block font-semibold text-ink decoration-rule-strong underline-offset-4 group-hover:underline"
                    >
                      {c.name}
                      {showing && suggested.has(c.id) && (
                        <span className="num ml-2 font-normal text-ink-2">
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

      {/* A 12px paper band rides above the rule: a sliver of card cut
          against the rule read as an empty field. */}
      <div className="paper-tooth sticky bottom-0 mt-8 space-y-1 border-t-[1.5px] border-ink pt-3 pb-3 before:absolute before:inset-x-0 before:bottom-[calc(100%+1.5px)] before:h-3 before:paper-tooth">
        <ErrorLine error={error} />
        {/* No ticks alone would read as "fits none", a different answer. */}
        {prefill?.cant_judge && (
          <p className="text-sm text-ink-2">Saved as can&apos;t judge.</p>
        )}
        {/* What Save will record, so an empty save is never silent. */}
        {!(prefill?.cant_judge && ticked.size === 0) && (
          <p
            className={clsx(
              "truncate text-sm",
              ticked.size === 0 ? "text-ink-3" : "text-ink-2",
            )}
          >
            {ticked.size === 0
              ? "Nothing ticked"
              : categories
                  .filter((c) => ticked.has(c.id))
                  .map((c) => c.name)
                  .join(", ")}
          </p>
        )}
        {/* One row from 360px; narrower, the answers wrap under Back/Next
            and stay right. */}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 pt-1">
          <div className="flex items-center gap-5">
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
          <div className="ml-auto flex items-center gap-4 tab:gap-6">
            <Button
              variant="ghost"
              disabled={busy}
              className="whitespace-nowrap"
              onClick={() =>
                onSubmit({
                  category_ids: [],
                  cant_judge: true,
                  elapsed_ms: elapsed(),
                  assisted: sawSuggestions.current || wasSeen(),
                })
              }
            >
              Can&apos;t judge
            </Button>
            <Button variant="ink"
              disabled={busy}
              onClick={() =>
                onSubmit({
                  category_ids: [...ticked],
                  cant_judge: false,
                  elapsed_ms: elapsed(),
                  assisted: sawSuggestions.current || wasSeen(),
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

// A stamped box in ink: card inside, ink when ticked, a card-coloured check
// cut out of it. It follows the stock, so it holds contrast on navy too.
// scroll-mb clears the sticky Save bar (up to its wrapped, 320px height), so
// a box tabbed to is never under it.
const STAMP = clsx(
  "mt-0.5 grid size-5 shrink-0 scroll-mb-48 cursor-pointer appearance-none place-content-center rounded-[2px] border-[1.5px] border-ink bg-card checked:bg-ink disabled:cursor-not-allowed",
  "before:size-3 before:bg-card before:opacity-0 before:[clip-path:polygon(14%_44%,0_65%,50%_100%,100%_16%,80%_0%,43%_62%)] checked:before:opacity-100",
);
