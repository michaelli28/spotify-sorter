"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion } from "framer-motion";
import { Button, buttonClass } from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { PageShell } from "@/src/components/design/PageShell";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { LabelInput, LabelState } from "@/src/lib/labeling/schema";
import { loadLabelState, postLabel } from "./api";
import {
  MODES,
  bulkAcceptInputs,
  bulkAcceptPairInputs,
  categoryOrder,
  earliestOpening,
  firstUnfinishedMode,
  formatLocal,
  forwardIndex,
  itemsFor,
  markDone,
  nextIndex,
  openCount,
  prevIndex,
  type Mode,
} from "./logic";
import { PairLabeler, type PairAnswer } from "./PairLabeler";
import { SongBlock } from "./SongBlock";
import {
  TrackLabeler,
  type SavedAnswer,
  type TrackAnswer,
} from "./TrackLabeler";

type Load =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; state: LabelState };

// Bulk accept: null = idle, "confirm" = asking, {done,total} = running.
type Bulk = null | "confirm" | { done: number; total: number };
type BulkResult = { saved: number; total: number };

const FINISHED: Record<Mode, string> = {
  songs: "Every song is labelled.",
  pairs: "Every pair is labelled.",
  gold: "Every gold-set song is labelled.",
  relabel: "Every relabel is done.",
};

export function LabelApp() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>("songs");
  // Explicit position per mode (after Back or a save); unset = first open,
  // unlabeled item.
  const [cursor, setCursor] = useState<Partial<Record<Mode, number>>>({});
  // Labels saved in this page session only, for Back. Never loaded from disk.
  const [session, setSession] = useState<Record<string, SavedAnswer>>({});
  const [pairSession, setPairSession] = useState<Record<string, PairAnswer>>(
    {},
  );
  // Clock for relabel windows, read in handlers rather than during render.
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the model's guesses are on screen. Session-wide and sticky, so
  // "label the rest of these blind" is one click rather than one per song.
  const [showSuggestions, setShowSuggestions] = useState(true);
  // Which items have had the guesses on screen this session. The per-item
  // components remount on every Back, so their own ref forgets; this does not.
  // The server no longer corrects `assisted` (it only derives `prior_exposure`
  // from history), so this set is what keeps the request body honest.
  const seen = useRef<Set<string>>(new Set());
  const markSeen = (id: string) => seen.current.add(id);
  // Deliberately NOT a modal dialog: it would block the page.
  const [bulk, setBulk] = useState<Bulk>(null);
  // How the last run ended, until the next write or queue switch. Not set
  // after a failure: the error line already says how far it got.
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  // Stop is checked between requests, so the one in flight still lands and
  // the count stays exact.
  const stopRequested = useRef(false);
  const [stopping, setStopping] = useState(false);
  const running = typeof bulk === "object" && bulk !== null;
  useNavLock(running);

  useEffect(() => {
    let cancelled = false;
    loadLabelState().then((r) => {
      if (cancelled) return;
      setNow(Date.now());
      if (!r.ok) {
        setLoad({ kind: "failed", message: r.message });
        return;
      }
      setMode(firstUnfinishedMode(r.value));
      setLoad({ kind: "ready", state: r.value });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setLoad({ kind: "loading" });
    setAttempt((a) => a + 1);
  }

  if (load.kind !== "ready") {
    return (
      <Shell header={<HomeLink locked={false} />}>
        {load.kind === "failed" && (
          <>
            <p className="max-w-[60ch] text-lead text-ink-2">{load.message}</p>
            <Button variant="ink" className="mt-8" onClick={retry}>
              Try again
            </Button>
          </>
        )}
      </Shell>
    );
  }

  const state = load.state;
  const items = itemsFor(state, mode);
  const index = cursor[mode] ?? nextIndex(items, -1, now);
  const doneCount = items.filter((i) => i.done).length;
  // One value keeps the bulk affordance and the count it advertises honest
  // together: bulk accept can only write the open items.
  const openUnlabeled = openCount(items, now);
  const continueTo = MODES.find(
    (m) => m.id !== mode && openCount(itemsFor(state, m.id), now) > 0,
  );

  function selectMode(m: Mode) {
    setMode(m);
    setError(null);
    setNow(Date.now());
    // A confirm belongs to the queue it was opened on; letting it follow the
    // switch would aim it at a queue nobody opened it for.
    setBulk(null);
    setBulkResult(null);
  }

  async function submit(input: LabelInput, id: string, remember?: SavedAnswer) {
    setBusy(true);
    setError(null);
    setBulkResult(null);
    const r = await postLabel(input);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    const t = Date.now();
    const next = markDone(state, mode, id);
    if (remember) setSession((s) => ({ ...s, [`${mode}:${id}`]: remember }));
    if (input.kind === "pair") {
      setPairSession((s) => ({ ...s, [id]: input.answer }));
    }
    setLoad({ kind: "ready", state: next });
    setNow(t);
    const after = nextIndex(itemsFor(next, mode), index, t);
    setCursor((c) => ({ ...c, [mode]: after === -1 ? undefined : after }));
  }

  // Saves the model's suggestion as the answer for every remaining song in this
  // mode. Sequential on purpose: appendLabel serialises writes anyway, and one
  // request at a time means a mid-run failure stops with an exact count rather
  // than leaving an unknown number in flight.
  async function acceptAll() {
    const inputs: LabelInput[] =
      mode === "pairs"
        ? bulkAcceptPairInputs(
            itemsFor(state, mode) as Parameters<typeof bulkAcceptPairInputs>[0],
            { definitions_sha256: state.definitions_sha256, elapsed_ms: 0 },
          )
        : bulkAcceptInputs(
            itemsFor(state, mode) as Parameters<typeof bulkAcceptInputs>[0],
            state.categories.map((c) => c.id),
            {
              pass: mode === "relabel" ? 2 : 1,
              set: mode === "gold" ? "gold" : "random",
              definitions_sha256: state.definitions_sha256,
              elapsed_ms: 0,
              now,
            },
          );
    setError(null);
    stopRequested.current = false;
    setBulk({ done: 0, total: inputs.length });
    let saved = 0;
    let failed = false;
    for (const input of inputs) {
      if (stopRequested.current) break;
      const r = await postLabel(input);
      if (!r.ok) {
        setError(`Stopped after ${saved} of ${inputs.length}: ${r.message}`);
        failed = true;
        break;
      }
      saved += 1;
      setBulk({ done: saved, total: inputs.length });
    }
    // Re-read rather than patching locally: this touched most of the queue.
    const reloaded = await loadLabelState();
    if (reloaded.ok) {
      setLoad({ kind: "ready", state: reloaded.value });
      setCursor((c) => ({ ...c, [mode]: undefined }));
    }
    setBulk(null);
    setStopping(false);
    if (!failed) setBulkResult({ saved, total: inputs.length });
  }

  function stop() {
    stopRequested.current = true;
    setStopping(true);
  }

  // From the finished/locked line (-1), Back reaches the last open item.
  const backTo = prevIndex(items, index === -1 ? items.length : index, now);

  function back() {
    setError(null);
    setCursor((c) => ({ ...c, [mode]: backTo }));
  }

  // Past the last item, unset falls back to the first unlabeled one or the
  // finished line.
  function next() {
    setError(null);
    const f = forwardIndex(items, index, now);
    setCursor((c) => ({ ...c, [mode]: f === -1 ? undefined : f }));
  }

  let body: React.ReactNode;
  if (index === -1) {
    body = (
      <Item itemKey={`${mode}:end`}>
        <p className="max-w-[24ch] font-display text-display-3 text-balance text-ink">
          {emptyLine(state, mode)}
        </p>
        {(continueTo || backTo !== -1) && (
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
            {continueTo && (
              <Button variant="ink" onClick={() => selectMode(continueTo.id)}>
                Continue to {continueTo.label}
              </Button>
            )}
            {backTo !== -1 && (
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
            )}
          </div>
        )}
      </Item>
    );
  } else if (mode === "pairs") {
    const pair = state.pairs[index]!;
    const category = state.categories.find((c) => c.id === pair.category_id);
    body = (
      <Item itemKey={`pairs:${pair.pair_id}`} className={RAIL_GRID}>
        <div className={RAIL}>
          <SongBlock track={pair} />
        </div>
        {category ? (
          <PairLabeler
            key={pair.pair_id}
            category={category}
            suggestion={pair.suggestion}
            showing={showSuggestions}
            onToggleShowing={() => setShowSuggestions((v) => !v)}
            wasSeen={() => seen.current.has(`pairs:${pair.pair_id}`)}
            onSeen={() => markSeen(`pairs:${pair.pair_id}`)}
            saved={pairSession[pair.pair_id]}
            busy={busy || running}
            error={error}
            canBack={backTo !== -1}
            onBack={back}
            // Only an answered pair can be left without answering it.
            canNext={pair.done}
            onNext={next}
            onAnswer={(
              answer: PairAnswer,
              elapsed_ms: number,
              assisted: boolean,
            ) =>
              submit(
                {
                  kind: "pair",
                  pair_id: pair.pair_id,
                  answer,
                  elapsed_ms,
                  definitions_sha256: state.definitions_sha256,
                  assisted,
                  // Server-derived from history; sent false and overwritten.
                  prior_exposure: false,
                },
                pair.pair_id,
              )
            }
          />
        ) : (
          <p className="text-ink-2">Unknown category {pair.category_id}.</p>
        )}
      </Item>
    );
  } else {
    const pass = mode === "relabel" ? 2 : 1;
    const set = mode === "gold" ? "gold" : "random";
    const track = (
      mode === "gold"
        ? state.gold
        : mode === "relabel"
          ? state.relabel
          : state.random
    )[index]!;
    const key = `${mode}:${track.track_id}`;
    body = (
      <Item itemKey={key} className={RAIL_GRID}>
        <div className={RAIL}>
          <SongBlock track={track} />
        </div>
        <TrackLabeler
          key={key}
          categories={categoryOrder(state.categories, track.track_id, pass)}
          suggestions={track.suggestions}
          showing={showSuggestions}
          onToggleShowing={() => setShowSuggestions((v) => !v)}
          wasSeen={() => seen.current.has(key)}
          onSeen={() => markSeen(key)}
          prefill={session[key]}
          busy={busy || running}
          error={error}
          canBack={backTo !== -1}
          onBack={back}
          // Only a labeled song can be left without answering it.
          canNext={track.done}
          onNext={next}
          onSubmit={(a: TrackAnswer) =>
            submit(
              {
                kind: "track",
                track_id: track.track_id,
                pass,
                set,
                // Cache order, so a row never records the shuffled display order.
                category_ids: state.categories
                  .map((c) => c.id)
                  .filter((id) => a.category_ids.includes(id)),
                cant_judge: a.cant_judge,
                elapsed_ms: a.elapsed_ms,
                assisted: a.assisted,
                prior_exposure: false,
                definitions_sha256: state.definitions_sha256,
              },
              track.track_id,
              { category_ids: a.category_ids, cant_judge: a.cant_judge },
            )
          }
        />
      </Item>
    );
  }

  const header = (
    <>
      <HomeLink locked={running} />
      {/* Phones: the tabs take their own row, below Home and the count,
          padded tighter so four with counts fit from 360px; narrower wraps. */}
      <nav
        aria-label="Label mode"
        className="order-3 -mx-1.5 flex w-[calc(100%+12px)] flex-wrap justify-between tab:order-none tab:mx-0 tab:w-auto tab:flex-nowrap tab:justify-start tab:gap-2 tab:border-l tab:border-rule-strong tab:pl-4"
      >
        {MODES.map((m) => (
          <ModeTab
            key={m.id}
            label={m.label}
            active={m.id === mode}
            open={openCount(itemsFor(state, m.id), now)}
            disabled={running}
            onSelect={() => selectMode(m.id)}
          />
        ))}
      </nav>
      {items.length > 0 && (
        <span className="mono num ml-auto text-ink-3">
          {doneCount} / {items.length}
        </span>
      )}
    </>
  );

  return (
    <Shell
      header={header}
      below={
        (openUnlabeled > 0 || running || bulkResult !== null) && (
          <BulkRow
            bulk={bulk}
            remaining={openUnlabeled}
            result={bulkResult}
            stopping={stopping}
            onAsk={() => {
              setBulkResult(null);
              setBulk("confirm");
            }}
            onCancel={() => setBulk(null)}
            onAccept={acceptAll}
            onStop={stop}
          />
        )
      }
    >
      {body}
    </Shell>
  );
}

// The song holds still beside a long category list from desk up.
const RAIL_GRID =
  "grid gap-10 desk:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] desk:items-start desk:gap-x-16";
const RAIL = "desk:sticky desk:top-8";

function Shell({
  header,
  below,
  children,
}: {
  header: React.ReactNode;
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <h1 className="sr-only">Blind labels</h1>
      <div className="mb-10 tab:mb-14">
        {/* The site nav is hidden here, so this row is the masthead and
            closes with the nav's own 1.5px ink rule. */}
        <header className="flex flex-wrap items-center border-b-[1.5px] border-ink pb-3 tab:flex-nowrap">
          {header}
        </header>
        {below}
      </div>
      {children}
    </PageShell>
  );
}

// The page's only way out (the site nav is hidden here). Inert while a bulk
// run writes, so leaving can't strand it out of sight.
function HomeLink({ locked }: { locked: boolean }) {
  // Underlined and set off by the tabs' rule, so it never reads as a fifth
  // queue. The ghost recipe is already a 44px target.
  const className = buttonClass({
    variant: "ghost",
    size: "sm",
    className: "mr-auto tab:mr-6",
  });
  // One child, so the flex gap can't split the underline; the arrow is an
  // inline-block, which an ancestor's underline doesn't reach.
  const content = (
    <span>
      <span aria-hidden className="mr-1.5 inline-block">
        ←
      </span>
      Home
    </span>
  );
  if (locked)
    return (
      <span
        role="link"
        aria-disabled="true"
        className={`${className} pointer-events-none opacity-50`}
      >
        {content}
      </span>
    );
  return (
    <Link href="/" className={className}>
      {content}
    </Link>
  );
}

function ModeTab({
  label,
  active,
  open,
  disabled,
  onSelect,
}: {
  label: string;
  active: boolean;
  open: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  // The site nav's step language: current in ink with a 2px rule under it
  // (static here: nothing moves on this page), open work in ink-2, none ink-3.
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={clsx(
        "inline-flex min-h-11 items-center whitespace-nowrap px-1.5 font-medium transition-colors duration-180 ease-out disabled:cursor-not-allowed disabled:opacity-50 tab:px-2.5",
        active
          ? "text-ink"
          : open > 0
            ? "text-ink-2 hover:text-ink"
            : "text-ink-3 hover:text-ink-2",
      )}
    >
      <span className="relative">
        {label}
        {active && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 -bottom-[3px] h-0.5 bg-current"
          />
        )}
      </span>
      {/* Open work on another queue; the tab's name stays exactly its label. */}
      {!active && open > 0 && (
        <span aria-hidden="true" className="mono num ml-1.5 text-ink-3">
          {open}
        </span>
      )}
    </button>
  );
}

function BulkRow({
  bulk,
  remaining,
  result,
  stopping,
  onAsk,
  onCancel,
  onAccept,
  onStop,
}: {
  bulk: Bulk;
  remaining: number;
  result: BulkResult | null;
  stopping: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onStop: () => void;
}) {
  const { fade } = useMotionConfig();
  const phase = bulk === null ? "idle" : bulk === "confirm" ? "confirm" : "run";
  const run = typeof bulk === "object" ? bulk : null;
  const askRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  // Each phase unmounts the control that had focus. Hand it to the new
  // phase's harmless control (never Accept all), but only if it was lost with
  // the old one: a tab click that closes the confirm keeps it on the tab.
  const focusedPhase = useRef(phase);
  useEffect(() => {
    if (focusedPhase.current === phase) return;
    focusedPhase.current = phase;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target = { idle: askRef, confirm: cancelRef, run: stopRef }[phase];
    target.current?.focus();
  }, [phase]);

  const status = run
    ? `Saving ${run.done} of ${run.total}`
    : result
      ? `Saved ${result.saved} of ${result.total}.`
      : "";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-6 text-sm tab:justify-end">
      {/* One live region across phases, so the outcome is announced too. */}
      <p role="status" className="num py-1.5 text-ink-2 empty:sr-only">
        {status}
      </p>
      <motion.div
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={fade}
        className={clsx(
          "flex flex-wrap items-center gap-x-6 empty:hidden",
          phase === "confirm" && "w-full tab:justify-end",
        )}
      >
        {phase === "idle" && remaining > 0 && (
          <Button
            ref={askRef}
            variant="ghost"
            size="sm"
            onClick={onAsk}
          >
            Accept all suggestions
          </Button>
        )}
        {phase === "confirm" && (
          <>
            {/* Its own row at every width, at least as tall as the 44px
                opener it replaces: shorter, Accept all landed inside the
                opener's box and a double-click wrote them all. */}
            <p className="num w-full py-3.5 text-ink tab:text-right">
              Save the model&apos;s answer for the {remaining} remaining?
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAccept}
            >
              Accept all
            </Button>
            <Button
              ref={cancelRef}
              variant="ghost"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </>
        )}
        {run && (
          <Button
            ref={stopRef}
            variant="ghost"
            size="sm"
            disabled={stopping}
            onClick={onStop}
          >
            Stop
          </Button>
        )}
      </motion.div>
    </div>
  );
}

// Entry only, keyed per item and never wrapped in AnimatePresence. Opacity
// only (the quietest page: nothing travels beside a blind judgement), and
// under 300ms on purpose: elapsed_ms is timed from the labeler's mount.
function Item({
  itemKey,
  className,
  children,
}: {
  itemKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { fade } = useMotionConfig();
  return (
    <motion.div
      key={itemKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fade}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function emptyLine(state: LabelState, mode: Mode): string {
  const items = itemsFor(state, mode);
  if (items.length === 0 || items.every((i) => i.done)) return FINISHED[mode];
  // Only relabel items can be unlabeled yet closed.
  const opens = earliestOpening(state.relabel);
  return opens
    ? `Next relabel opens ${formatLocal(opens)}.`
    : "Relabel opens 48 hours after a song's first label.";
}
