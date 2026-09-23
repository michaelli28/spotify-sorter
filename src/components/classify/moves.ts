import type { Assignment } from "@/src/lib/cache";
import { trackPassesThreshold } from "@/src/lib/classification/threshold";

// One id per copy: a song sits in several playlists at once, and a shared id
// made dnd-kit measure the wrong copy, so drops silently missed.
export const dragId = (categoryId: string, trackId: string): string =>
  `chip:${categoryId}:${trackId}`;

export interface DragSource {
  trackId: string;
  fromCategoryId: string;
}

export interface DropTarget {
  categoryId: string;
}

/** Where a drop moves the song, or null when it would change nothing. */
export function dropDestination(
  source: DragSource | undefined,
  target: DropTarget | undefined,
): string | null {
  if (!source || !target) return null;
  return target.categoryId === source.fromCategoryId ? null : target.categoryId;
}

/** Pins the song to one playlist. The model's matches stay for Undo. */
export function pin(
  previous: Assignment,
  categoryId: string,
  now: string,
): Assignment {
  return { ...previous, override: { category_id: categoryId, set_at: now } };
}

/** Playlists a move also takes the song out of, besides `from` and `to`. */
export function otherPlaylistsLeft(
  previous: Assignment,
  threshold: number,
  from: string,
  to: string,
): number {
  return trackPassesThreshold(previous, threshold).filter(
    (id) => id !== from && id !== to,
  ).length;
}

export function moveMessage(
  title: string,
  toName: string,
  otherLeft: number,
): string {
  const moved = `‘${title}’ → ${toName}.`;
  if (otherLeft === 0) return moved;
  return `${moved} Also left ${otherLeft} other ${otherLeft === 1 ? "category" : "categories"}.`;
}
