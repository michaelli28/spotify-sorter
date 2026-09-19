import { seededRandom, shuffled } from "@/src/lib/labeling/rng";
import type { LabelState } from "@/src/lib/labeling/schema";

export type Mode = "songs" | "pairs" | "relabel";
export const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: "songs", label: "Songs" },
  { id: "pairs", label: "Pairs" },
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
  if (mode === "songs") {
    return {
      ...state,
      random: state.random.map((t) =>
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
