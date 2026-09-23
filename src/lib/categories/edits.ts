import { categoryDelta } from "./delta";
import { mergeCategories, type DraftCategory } from "./merge";

export interface CategoryRename {
  id: string;
  from: string;
  to: string;
}

export interface CategoryEdits {
  added: DraftCategory[];
  removed: DraftCategory[];
  renamed: CategoryRename[];
  /** Saved categories whose description changed (renamed or not). */
  redescribed: DraftCategory[];
  /** Saved, not renamed, whose description, colour or sample tracks changed. */
  edited: number;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** What saving `draft` would change about `saved`. */
export function categoryEdits(
  saved: readonly DraftCategory[],
  draft: readonly DraftCategory[],
): CategoryEdits {
  const { added, removed } = categoryDelta(saved, draft);
  const before = new Map(saved.map((c) => [c.id, c]));
  const renamed: CategoryRename[] = [];
  const redescribed: DraftCategory[] = [];
  let edited = 0;
  for (const c of draft) {
    const old = before.get(c.id);
    if (!old) continue;
    const describedAnew = old.description !== c.description;
    if (describedAnew) redescribed.push(c);
    if (old.name !== c.name) {
      renamed.push({ id: c.id, from: old.name, to: c.name });
    } else if (
      describedAnew ||
      old.temperature !== c.temperature ||
      !sameList(old.example_track_ids, c.example_track_ids)
    ) {
      edited++;
    }
  }
  return {
    added,
    removed,
    renamed,
    redescribed,
    edited,
  };
}

/** "1 deleted · 1 renamed · 1 new · 2 edited", or null when nothing changed. */
export function describeEdits(e: CategoryEdits): string | null {
  const parts = [
    e.removed.length > 0 && `${e.removed.length} deleted`,
    e.renamed.length > 0 && `${e.renamed.length} renamed`,
    e.added.length > 0 && `${e.added.length} new`,
    e.edited > 0 && `${e.edited} edited`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Two names clash when they'd make the same playlist and definitions.md heading. */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function duplicateNameKeys(
  draft: readonly DraftCategory[],
): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of draft) {
    const key = nameKey(c.name);
    if (!key) continue;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return dupes;
}

/**
 * One undo slot. It records the inverse of a single delete or merge rather
 * than a snapshot of the whole draft, so undoing never reverts edits made to
 * other categories since.
 */
export type UndoableEdit =
  | { kind: "delete"; category: DraftCategory; index: number }
  | {
      kind: "merge";
      source: DraftCategory;
      index: number;
      targetId: string;
      targetName: string;
      /** Samples the merge brought into the target, taken back on undo. */
      added: string[];
    };

export interface EditResult {
  draft: DraftCategory[];
  undo: UndoableEdit;
}

export function deleteCategory(
  draft: readonly DraftCategory[],
  id: string,
): EditResult | null {
  const index = draft.findIndex((c) => c.id === id);
  if (index === -1) return null;
  return {
    draft: draft.filter((c) => c.id !== id),
    undo: { kind: "delete", category: draft[index]!, index },
  };
}

export function mergeCategory(
  draft: readonly DraftCategory[],
  sourceId: string,
  targetId: string,
): EditResult | null {
  const index = draft.findIndex((c) => c.id === sourceId);
  const target = draft.find((c) => c.id === targetId);
  if (index === -1 || !target || sourceId === targetId) return null;
  const source = draft[index]!;
  return {
    draft: mergeCategories([...draft], sourceId, targetId),
    undo: {
      kind: "merge",
      source,
      index,
      targetId,
      targetName: target.name,
      added: source.example_track_ids.filter(
        (t) => !target.example_track_ids.includes(t),
      ),
    },
  };
}

export function undoEdit(
  draft: readonly DraftCategory[],
  undo: UndoableEdit,
): DraftCategory[] {
  const restored = undo.kind === "delete" ? undo.category : undo.source;
  const rest =
    undo.kind === "merge"
      ? draft.map((c) =>
          c.id === undo.targetId
            ? {
                ...c,
                example_track_ids: c.example_track_ids.filter(
                  (t) => !undo.added.includes(t),
                ),
              }
            : c,
        )
      : [...draft];
  const at = Math.min(undo.index, rest.length);
  return [...rest.slice(0, at), restored, ...rest.slice(at)];
}
