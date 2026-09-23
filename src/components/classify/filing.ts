import type { Assignment } from "@/src/lib/cache";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { fnv1a32 } from "@/src/lib/sleeves/hash";
import { CRATE, tracksPerU } from "@/src/components/graphics/crate-geometry";

// Set piece B (brief §4.4): the stream reports batches, the status route
// reports per-category counts after each one, and the crate prints those
// counts a few tabs at a time so a batch lands as a filing rhythm, not a jolt.

export type Counts = Readonly<Record<string, number>>;

export interface Filing {
  /** What each tab prints now. */
  shown: Counts;
  /** The latest counts the server reported. */
  target: Counts;
  /** Categories waiting to bump, in the order they will. */
  queue: readonly string[];
  /** How many times each tab has bumped: a change replays its bump. */
  bumps: Counts;
  /** Reports received; seeds each report's shuffle. */
  seq: number;
}

/** One tick every 250ms, three bumps a tick: at most 12 a second (brief §4.4 B). */
export const TICK_MS = 250;
export const BUMPS_PER_TICK = 3;

/** A first run has no sorted tracks to learn from. */
const FIRST_RUN_PLAYLISTS_PER_TRACK = 3;

export function startFiling(counts: Counts): Filing {
  return { shown: counts, target: counts, queue: [], bumps: {}, seq: 0 };
}

/** Takes a report: every drawn category whose count differs from its tab joins the queue. */
export function receiveCounts(f: Filing, report: Counts): Filing {
  const seq = f.seq + 1;
  const target = Object.fromEntries(
    Object.keys(f.shown).map((id) => [id, report[id] ?? f.target[id] ?? 0]),
  );
  const differs = (id: string) => target[id] !== f.shown[id];
  const kept = f.queue.filter(differs);
  const queued = new Set(kept);
  const added = Object.keys(target)
    .filter((id) => differs(id) && !queued.has(id))
    .map((id) => ({ id, key: fnv1a32(`${seq}:${id}`) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.id);
  return { ...f, target, queue: [...kept, ...added], seq };
}

/** Prints the next `max` queued counts, each with a bump. */
export function flushFiling(f: Filing, max: number): Filing {
  if (f.queue.length === 0) return f;
  const now = f.queue.slice(0, max);
  const shown = { ...f.shown };
  const bumps = { ...f.bumps };
  for (const id of now) {
    shown[id] = f.target[id] ?? shown[id] ?? 0;
    bumps[id] = (bumps[id] ?? 0) + 1;
  }
  return { ...f, shown, bumps, queue: f.queue.slice(max) };
}

/** Reduced motion: every count prints at once, nothing bumps. */
export function settleFiling(f: Filing): Filing {
  return { ...f, shown: f.target, queue: [] };
}

/**
 * Tracks per category at the cutoff, by /api/status's rule (existing
 * categories, tracks still in the library), so the first report after a
 * batch moves only what the batch changed.
 */
export function placedCounts(
  library: {
    categories: Readonly<Record<string, unknown>>;
    tracks: Readonly<Record<string, unknown>>;
    assignments: Readonly<Record<string, Assignment>>;
  },
  threshold: number,
): Record<string, number> {
  const members = categoryMembers({ ...library.assignments }, threshold);
  return Object.fromEntries(
    Object.keys(library.categories).map((id) => [
      id,
      [...(members.get(id) ?? [])].filter((t) => t in library.tracks).length,
    ]),
  );
}

/**
 * Tracks per u for the whole run, from where it should end: the tracks already
 * sorted say how many playlists a track lands in, and the unsorted ones will
 * land the same way. Held fixed, the stacks grow into the crate instead of the
 * crate rescaling every batch. Mirrors `tracksPerU`'s room and front share.
 */
export function projectedScale(
  countsFrontToBack: readonly number[],
  tracks: { sorted: number; unsorted: number },
): number {
  const n = countsFrontToBack.length;
  const room = CRATE.FRONT_TOP - CRATE.BACK_TOP - (n - 1) * CRATE.DIVIDER;
  const placed = countsFrontToBack.reduce((a, b) => a + b, 0);
  const perTrack =
    tracks.sorted > 0 && placed > 0
      ? placed / tracks.sorted
      : FIRST_RUN_PLAYLISTS_PER_TRACK;
  const projected = placed + tracks.unsorted * perTrack;
  // The back divider's records stand behind the fill line (tracksPerU).
  const inFront = n > 1 ? (projected * (n - 1)) / n : projected;
  return n === 0 || room <= 0 || inFront <= 0 ? 0 : inFront / room;
}

/**
 * The scale the crate draws at: the run's projection until the counts outgrow
 * it, and never so fine that the back divider's records rise over the back
 * rail. `tracksPerU` leaves that stack out, and a first run, filed in
 * catalogue order, can put a large playlist at the back.
 */
export function filingScale(
  countsFrontToBack: readonly number[],
  projected: number,
): number {
  const n = countsFrontToBack.length;
  const total = countsFrontToBack.reduce((a, b) => a + b, 0);
  // Every record, the back stack's too, between the front divider and the
  // rail; a stack also covers its own card less the trim.
  const room =
    CRATE.FRONT_TOP -
    CRATE.BACK_Y -
    (n - 1) * CRATE.DIVIDER -
    (CRATE.DIVIDER - CRATE.STACK_TRIM);
  const all = n === 0 || room <= 0 || total <= 0 ? 0 : total / room;
  return Math.max(projected, tracksPerU(countsFrontToBack), all);
}

/** A crate tab's count. Five digits would outgrow the narrowest tab: "12k". */
export function tabCount(n: number): string {
  return n < 10_000 ? n.toLocaleString("en-US") : `${Math.floor(n / 1000)}k`;
}
