// The Apply credits as a print run (brief §4.4 C, spec §7.1): which sleeve each
// row shows, how far the pacer may print, and the lines that name the run.
import type { ApplyResult } from "@/src/lib/pipeline/apply";

/**
 * proof: before the write, the sleeve at rest. pending: a blank slot.
 * current: the slot on the press. failed: where an error stopped the run.
 * printed: written, drum B out of register (no cover yet).
 * registered: its cover is on Spotify, drum B locked in.
 */
export type SleeveState =
  | "proof"
  | "pending"
  | "current"
  | "failed"
  | "printed"
  | "registered";

export type RunView = "ready" | "running" | "error" | "lost" | "done";

/** `done` playlists are written; the server is on index `done` next. */
export interface Progress {
  done: number;
  total: number;
}

export interface PrintInput {
  view: RunView;
  rows: number;
  progress: Progress | null;
}

export interface SleeveInput extends PrintInput {
  /** How many sleeves, from the top, the pacer has let print. */
  printed: number;
  /** done only: rows Spotify confirmed. */
  written?: readonly boolean[];
  /** done only: rows whose cover Spotify took. */
  registered?: readonly boolean[];
}

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** How many sleeves may print: what the stream says is written. */
export function printTarget({ view, rows, progress }: PrintInput): number {
  if (view === "ready") return 0;
  if (view === "done") return rows;
  return Math.min(progress?.done ?? 0, rows);
}

// onProgress("category", i) fires before playlist i is written (apply.ts), so
// event i prints sleeve i - 1: a sleeve never claims a playlist early.
export function sleeveStates(input: SleeveInput): SleeveState[] {
  const { view, rows, progress, printed, written, registered } = input;
  return Array.from({ length: rows }, (_, i): SleeveState => {
    // Stopped before anything was written: still the manifest.
    if (view === "ready" || (view === "error" && !progress)) return "proof";
    if (view === "done") {
      if (!written?.[i] || i >= printed) return "pending";
      return registered?.[i] ? "registered" : "printed";
    }
    const done = progress?.done ?? 0;
    if (i < done) return i < printed ? "printed" : "pending";
    if (progress && i === done) {
      if (view === "running") return "current";
      if (view === "error") return "failed";
    }
    return "pending";
  });
}

/** The strip's line while the write runs. */
export function runStatus(
  progress: Progress | null,
  rows: readonly { name: string }[],
): string {
  if (!progress) return "Starting…";
  const at = Math.min(progress.done + 1, progress.total);
  const current = progress.done < progress.total ? rows[progress.done] : null;
  return `Writing ${count(at)} of ${count(progress.total)}${current ? ` · ${current.name}` : ""}`;
}

/** Error and lost headline: how far the print run got. */
export function printedTitle(written: number, total: number): string {
  return `${count(written)} of ${count(total)} printed.`;
}

/** The close. */
export function onSpotifyTitle(playlists: number): string {
  return `${count(playlists)} ${plural(playlists, "playlist")} on Spotify.`;
}

type Named = { id: string; name: string };

// Tied by category id, not name: a rename in another tab between page load
// and Apply changes the playlist's name, never its category.
function playlistsByRow(
  rows: readonly Named[],
  { playlists }: ApplyResult,
): Map<string, ApplyResult["playlists"][number]> {
  const byCategory = new Map(playlists.map((p) => [p.category_id, p]));
  const out = new Map<string, ApplyResult["playlists"][number]>();
  for (const row of rows) {
    const p = byCategory.get(row.id);
    if (p) out.set(row.id, p);
  }
  return out;
}

/** Row id → the Spotify playlist the run wrote for it. */
export function writtenPlaylists(
  rows: readonly Named[],
  result: ApplyResult,
): Map<string, string> {
  return new Map(
    [...playlistsByRow(rows, result)].map(([row, p]) => [row, p.id]),
  );
}

/** Rows whose playlist this run created, but only when some weren't: a mark on every row says nothing. */
export function freshRows(
  rows: readonly Named[],
  result: ApplyResult,
): Set<string> {
  const matched = [...playlistsByRow(rows, result)];
  const created = matched.filter(([, p]) => p.created);
  if (created.length === 0 || created.length === matched.length) {
    return new Set();
  }
  return new Set(created.map(([row]) => row));
}

/**
 * Names the run by what changed, under the close. The close already counts the
 * playlists, so a run that changed every one of them says so without the count.
 * An existing playlist with nothing new is neither created nor updated.
 */
export function creditsTitle({
  created,
  updated,
  playlists,
}: ApplyResult): string {
  if (created > 0 && updated > 0) {
    return `${count(created)} new, ${count(updated)} updated`;
  }
  const all = playlists.length;
  if (all > 0 && created === all) return all === 1 ? "New" : "All new";
  if (all > 0 && updated === all) return all === 1 ? "Updated" : "All updated";
  if (created > 0)
    return `${count(created)} new ${plural(created, "playlist")}`;
  if (updated > 0) {
    return `${count(updated)} ${plural(updated, "playlist")} updated`;
  }
  return "Already up to date.";
}
