"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { LabelInput, LabelState } from "@/src/lib/labeling/schema";
import { loadLabelState, postLabel } from "./api";
import { FOCUS_RING } from "./focus";
import {
  MODES,
  categoryOrder,
  earliestOpening,
  firstUnfinishedMode,
  formatLocal,
  forwardIndex,
  itemsFor,
  markDone,
  nextIndex,
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

const FINISHED: Record<Mode, string> = {
  songs: "Every song is labeled.",
  pairs: "Every pair is labeled.",
  relabel: "Every relabel is done.",
};

export function LabelApp() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
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
  }, []);

  if (load.kind !== "ready") {
    return (
      <Shell>
        {load.kind === "failed" && (
          <p className="text-[var(--color-text-secondary)]">{load.message}</p>
        )}
      </Shell>
    );
  }

  const state = load.state;
  const items = itemsFor(state, mode);
  const index = cursor[mode] ?? nextIndex(items, -1, now);
  const doneCount = items.filter((i) => i.done).length;

  async function submit(input: LabelInput, id: string, remember?: SavedAnswer) {
    setBusy(true);
    setError(null);
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
      <div className="flex items-baseline gap-8">
        <QuietLine>{emptyLine(state, mode)}</QuietLine>
        {backTo !== -1 && (
          <Button variant="ghost" onClick={back} className={FOCUS_RING}>
            Back
          </Button>
        )}
      </div>
    );
  } else if (mode === "pairs") {
    const pair = state.pairs[index]!;
    const category = state.categories.find((c) => c.id === pair.category_id);
    body = (
      <Item itemKey={`pairs:${pair.pair_id}`}>
        <SongBlock track={pair} />
        {category ? (
          <PairLabeler
            key={pair.pair_id}
            category={category}
            saved={pairSession[pair.pair_id]}
            busy={busy}
            error={error}
            canBack={backTo !== -1}
            onBack={back}
            // Only an answered pair can be left without answering it.
            canNext={pair.done}
            onNext={next}
            onAnswer={(answer: PairAnswer, elapsed_ms: number) =>
              submit(
                {
                  kind: "pair",
                  pair_id: pair.pair_id,
                  answer,
                  elapsed_ms,
                  definitions_sha256: state.definitions_sha256,
                },
                pair.pair_id,
              )
            }
          />
        ) : (
          <QuietLine>Unknown category {pair.category_id}.</QuietLine>
        )}
      </Item>
    );
  } else {
    const pass = mode === "songs" ? 1 : 2;
    const track = (mode === "songs" ? state.random : state.relabel)[index]!;
    const key = `${mode}:${track.track_id}`;
    body = (
      <Item itemKey={key}>
        <SongBlock track={track} />
        <TrackLabeler
          key={key}
          categories={categoryOrder(state.categories, track.track_id, pass)}
          prefill={session[key]}
          busy={busy}
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
                // Cache order, so a row never records the shuffled display order.
                category_ids: state.categories
                  .map((c) => c.id)
                  .filter((id) => a.category_ids.includes(id)),
                cant_judge: a.cant_judge,
                elapsed_ms: a.elapsed_ms,
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

  return (
    <Shell>
      <div className="mb-14 flex items-baseline gap-8">
        <nav aria-label="Label mode" className="flex items-baseline gap-8">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === mode}
              onClick={() => {
                setMode(m.id);
                setError(null);
                setNow(Date.now());
              }}
              className={clsx(
                "relative py-1 text-sm tracking-tight transition-colors duration-200",
                FOCUS_RING,
                m.id === mode
                  ? "text-[var(--color-text-primary)] after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]",
              )}
            >
              {m.label}
            </button>
          ))}
        </nav>
        {items.length > 0 && (
          <span className="ml-auto font-[family-name:var(--font-mono)] text-sm text-[var(--color-text-tertiary)]">
            {doneCount} / {items.length}
          </span>
        )}
      </div>
      {body}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <h1 className="sr-only">Blind labels</h1>
      {children}
    </PageShell>
  );
}

function Item({
  itemKey,
  children,
}: {
  itemKey: string;
  children: React.ReactNode;
}) {
  const motionConfig = useMotionConfig();
  return (
    <motion.div
      key={itemKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionConfig.reduced ? { duration: 0 } : { duration: 0.25 }}
      className="space-y-12"
    >
      {children}
    </motion.div>
  );
}

function QuietLine({ children }: { children: React.ReactNode }) {
  return <p className="text-[var(--color-text-secondary)]">{children}</p>;
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
