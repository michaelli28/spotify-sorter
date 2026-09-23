import type { Temperature } from "@/src/lib/sleeves/temperature";

export interface DraftCategory {
  id: string;
  name: string;
  description: string;
  example_track_ids: string[];
  /** The owner's colour override; absent = guessed from the name. */
  temperature?: Temperature;
}

export function mergeCategories(
  cats: DraftCategory[],
  sourceId: string,
  targetId: string,
): DraftCategory[] {
  if (sourceId === targetId) return cats;
  const source = cats.find((c) => c.id === sourceId);
  const target = cats.find((c) => c.id === targetId);
  if (!source || !target) return cats;
  const union = Array.from(
    new Set([...target.example_track_ids, ...source.example_track_ids]),
  );
  return cats
    .filter((c) => c.id !== sourceId)
    .map((c) => (c.id === targetId ? { ...c, example_track_ids: union } : c));
}
