import { seededRandom, shuffled } from "@/src/lib/labeling/rng";
import type { LabelState } from "@/src/lib/labeling/schema";

export type Mode = "songs" | "pairs" | "gold" | "relabel";
export const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: "songs", label: "Songs" },
  { id: "pairs", label: "Pairs" },
  // Before Relabel, which stays locked for 48 h and would otherwise be the
  // first unfinished mode the page opens on.
  { id: "gold", label: "Gold set" },
  { id: "relabel", label: "Relabel" },
];

export type LabelCategory = LabelState["categories"][number];
type Item = { done: boolean; opens_at?: string | null };

// Per-track order, independent of cache order and of anything the model said.
// Codepoint sort, not localeCompare, so every browser locale agrees.
export function categoryOrder(
  categories: readonly LabelCategory[],
  trackId: string,
  pass: 1 | 2,
): LabelCategory[] {
  const sorted = [...categories].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return shuffled(sorted, seededRandom(`${trackId}:pass${pass}`));
}

export function isOpen(item: Item, now: number): boolean {
  if (item.opens_at === undefined) return true;
  return item.opens_at !== null && Date.parse(item.opens_at) <= now;
}

// Next unlabeled, open item after `from` in list order, wrapping so items
// skipped via Back are still reached. -1 when none is left.
export function nextIndex(
  items: readonly Item[],
  from: number,
  now: number,
): number {
  const n = items.length;
  for (let step = 1; step <= n; step++) {
    const i = (((from + step) % n) + n) % n;
    if (!items[i]!.done && isOpen(items[i]!, now)) return i;
  }
  return -1;
}

// Previous open item, labeled or not. -1 at the start.
export function prevIndex(
  items: readonly Item[],
  from: number,
  now: number,
): number {
  for (let i = from - 1; i >= 0; i--) {
    if (isOpen(items[i]!, now)) return i;
  }
  return -1;
}

// Next open item, labeled or not; mirrors prevIndex. -1 at the end.
export function forwardIndex(
  items: readonly Item[],
  from: number,
  now: number,
): number {
  for (let i = from + 1; i < items.length; i++) {
    if (isOpen(items[i]!, now)) return i;
  }
  return -1;
}

export function itemsFor(state: LabelState, mode: Mode): readonly Item[] {
  if (mode === "songs") return state.random;
  if (mode === "pairs") return state.pairs;
  if (mode === "gold") return state.gold;
  return state.relabel;
}

export function firstUnfinishedMode(state: LabelState): Mode {
  return (
    MODES.find((m) => itemsFor(state, m.id).some((i) => !i.done))?.id ?? "songs"
  );
}

export function earliestOpening(relabel: LabelState["relabel"]): string | null {
  const times = relabel
    .filter((r) => !r.done && r.opens_at !== null)
    .map((r) => r.opens_at!)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return times[0] ?? null;
}

export function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function markDone(
  state: LabelState,
  mode: Mode,
  id: string,
): LabelState {
  if (mode === "pairs") {
    return {
      ...state,
      pairs: state.pairs.map((p) =>
        p.pair_id === id ? { ...p, done: true } : p,
      ),
    };
  }
  if (mode === "songs" || mode === "gold") {
    const key = mode === "songs" ? "random" : "gold";
    return {
      ...state,
      [key]: state[key].map((t) =>
        t.track_id === id ? { ...t, done: true } : t,
      ),
    };
  }
  return {
    ...state,
    relabel: state.relabel.map((t) =>
      t.track_id === id ? { ...t, done: true } : t,
    ),
  };
}

// Bulk "accept all suggestions": the label inputs for every still-unlabeled
// track in a mode, each one taking the model's suggested categories verbatim.
//
// Added 2026-09-21 at Michael's request. A row produced here is `assisted` by
// definition and is a copy of the model's own answer, so it carries no
// independent information about that model. Songs with no suggestions are
// skipped rather than saved empty — an empty tick set means "fits none", which
// is a real answer and not one anybody gave here.
export function bulkAcceptInputs(
  items: readonly {
    track_id: string;
    done: boolean;
    suggestions?: readonly { category_id: string }[];
  }[],
  categoryIdsInCacheOrder: readonly string[],
  opts: {
    pass: 1 | 2;
    set: "random" | "gold";
    definitions_sha256: string;
    elapsed_ms: number;
  },
): TrackBulkInput[] {
  return items.flatMap((item) => {
    if (item.done) return [];
    const wanted = new Set((item.suggestions ?? []).map((s) => s.category_id));
    if (wanted.size === 0) return [];
    return [
      {
        kind: "track" as const,
        track_id: item.track_id,
        pass: opts.pass,
        set: opts.set,
        // Cache order, matching a hand-saved row exactly.
        category_ids: categoryIdsInCacheOrder.filter((id) => wanted.has(id)),
        cant_judge: false,
        elapsed_ms: opts.elapsed_ms,
        definitions_sha256: opts.definitions_sha256,
        assisted: true,
      },
    ];
  });
}

export interface TrackBulkInput {
  kind: "track";
  track_id: string;
  pass: 1 | 2;
  set: "random" | "gold";
  category_ids: string[];
  cant_judge: false;
  elapsed_ms: number;
  definitions_sha256: string;
  assisted: true;
}

// Bulk "accept all suggestions" for the pairs queue: the model's own verdict as
// the answer for every pair still unanswered.
//
// `cant_judge` is never produced. It means a human looked and could not decide,
// which is not something accepting a suggestion can express — and treating it
// as a third model output would put a value in the data that no model emitted.
export function bulkAcceptPairInputs(
  items: readonly {
    pair_id: string;
    done: boolean;
    suggestion?: { score: number | null; verdict: "yes" | "no" };
  }[],
  opts: { definitions_sha256: string; elapsed_ms: number },
): PairBulkInput[] {
  return items.flatMap((item) =>
    item.done || !item.suggestion
      ? []
      : [
          {
            kind: "pair" as const,
            pair_id: item.pair_id,
            answer: item.suggestion.verdict,
            elapsed_ms: opts.elapsed_ms,
            definitions_sha256: opts.definitions_sha256,
            assisted: true as const,
          },
        ],
  );
}

export interface PairBulkInput {
  kind: "pair";
  pair_id: string;
  answer: "yes" | "no";
  elapsed_ms: number;
  definitions_sha256: string;
  assisted: true;
}
