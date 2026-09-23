import type { StageEvent } from "./stages";

/** What the scan's crate shows (brief §4.4 A). */
export interface CrateFill {
  /** Playlists read so far. Never goes down within a scan. */
  done: number;
  /** Playlists in scope, from the latest event (never below `done`). */
  total: number;
  /** How full the crate is, 0 to 1: playlists read ÷ in scope. Never goes down. */
  level: number;
  /** Liked Songs has been read. It is a source, not a playlist: a record, no fill. */
  liked: boolean;
}

export const EMPTY_CRATE: CrateFill = {
  done: 0,
  total: 0,
  level: 0,
  liked: false,
};

/** Sources read so far. Each one drops a record into the crate. */
export function sourcesRead(fill: CrateFill): number {
  return fill.done + (fill.liked ? 1 : 0);
}

/**
 * The crate after one progress event. The server sends the same playlists total
 * on every event (scan.ts), but a late or drifting event must still never take a
 * record back out: done and level only ever rise.
 */
export function crateAfter(prev: CrateFill, e: StageEvent): CrateFill {
  if (e.stage !== "playlists") {
    // runScan reads every playlist before Liked Songs and artist genres.
    const liked =
      prev.liked ||
      (e.stage === "liked" && e.total > 0 && e.current >= e.total);
    return prev.level === 1 && liked === prev.liked
      ? prev
      : { ...prev, level: 1, liked };
  }
  const done = Math.max(prev.done, e.current);
  const total = Math.max(e.total, done);
  const level = Math.max(prev.level, total > 0 ? done / total : 0);
  return { ...prev, done, total, level };
}

/** The whole library is read: the crate is full, whatever the playlists said. */
export function crateFull(prev: CrateFill): CrateFill {
  return { ...prev, level: 1 };
}
