"use client";
import { useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  DndContext,
  MouseSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import {
  deleteCategory,
  duplicateNameKeys,
  mergeCategory,
  nameKey,
  undoEdit,
  type EditResult,
  type UndoableEdit,
} from "@/src/lib/categories/edits";
import type { DraftCategory } from "@/src/lib/categories/merge";
import { AddCategoryRow } from "./AddCategoryRow";
import { CategoryRow, ROW_GRID } from "./CategoryRow";
import type { TrackLookupEntry } from "./TrackSearchModal";
import { useFocusAfterRender } from "./useFocusAfterRender";

export interface CategoryIndexProps {
  categories: DraftCategory[];
  tracks: Record<string, TrackLookupEntry>;
  onChange: (next: DraftCategory[]) => void;
  onAddTrack: (categoryId: string) => void;
  /** What a drop would do right now, for the page's status line. */
  onDragHint: (hint: string | null) => void;
}

// dnd-kit's defaults announce the dragged UUID; the page's status line says
// the same thing in names instead.
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

const without = (set: ReadonlySet<string>, id: string) =>
  new Set([...set].filter((x) => x !== id));

/** The draft as a numbered index: one line per category, opened to edit. */
export function CategoryIndex({
  categories,
  tracks,
  onChange,
  onAddTrack,
  onDragHint,
}: CategoryIndexProps) {
  const { itemDelay } = useMotionConfig();
  const listRef = useRef<HTMLOListElement>(null);
  const focusAfter = useFocusAfterRender(listRef);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<{ edit: UndoableEdit; seq: number } | null>(
    null,
  );
  // Only the first render staggers in: a row added or restored later has
  // nothing to wait for.
  const [touched, setTouched] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  );

  const dupes = duplicateNameKeys(categories);
  const nameOf = (id: unknown) =>
    categories.find((c) => c.id === id)?.name ?? "";

  function edit(next: DraftCategory[]) {
    setTouched(true);
    onChange(next);
  }

  function remember(result: EditResult | null, id: string) {
    if (!result) return;
    setExpanded((s) => without(s, id));
    setUndo((u) => ({ edit: result.undo, seq: (u?.seq ?? 0) + 1 }));
    edit(result.draft);
    focusAfter("undo");
  }

  function undoLast() {
    if (!undo) return;
    const restored =
      undo.edit.kind === "delete" ? undo.edit.category : undo.edit.source;
    edit(undoEdit(categories, undo.edit));
    setUndo(null);
    focusAfter(`row:${restored.id}`);
  }

  const dropHint = (active: unknown) =>
    `Drop ${nameOf(active)} on another category to merge it.`;

  function onDragOver({ active, over }: DragOverEvent) {
    onDragHint(
      over && over.id !== active.id
        ? `Merge ${nameOf(active.id)} into ${nameOf(over.id)}`
        : dropHint(active.id),
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    onDragHint(null);
    if (!over || over.id === active.id) return;
    const source = String(active.id);
    remember(mergeCategory(categories, source, String(over.id)), source);
  }

  const rows = categories.map((c, i) => (
    <CategoryRow
      key={c.id}
      category={c}
      number={i + 1}
      tracks={tracks}
      categories={categories}
      expanded={expanded.has(c.id)}
      duplicate={dupes.has(nameKey(c.name))}
      entranceDelay={touched ? 0 : itemDelay(i)}
      onOpen={() => {
        setExpanded((s) => new Set(s).add(c.id));
        focusAfter(`name:${c.id}`);
      }}
      onClose={() => {
        setExpanded((s) => without(s, c.id));
        focusAfter(`row:${c.id}`);
      }}
      onChange={(next) =>
        edit(categories.map((x) => (x.id === next.id ? next : x)))
      }
      onDelete={() => remember(deleteCategory(categories, c.id), c.id)}
      onMerge={(targetId) =>
        remember(mergeCategory(categories, c.id, targetId), c.id)
      }
      onAddTrack={() => onAddTrack(c.id)}
    />
  ));
  const at = undo ? Math.min(undo.edit.index, rows.length) : 0;
  const items = undo
    ? [
        ...rows.slice(0, at),
        <UndoLine
          key={`undo-${undo.seq}`}
          text={
            undo.edit.kind === "delete"
              ? `Deleted ${undo.edit.category.name}.`
              : `Merged ${undo.edit.source.name} into ${undo.edit.targetName}.`
          }
          onUndo={undoLast}
        />,
        ...rows.slice(at),
      ]
    : rows;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      accessibility={{ announcements: SILENT }}
      onDragStart={({ active }: DragStartEvent) =>
        onDragHint(dropHint(active.id))
      }
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => onDragHint(null)}
    >
      <ol
        ref={listRef}
        className="border-t border-[var(--color-border-default)]"
      >
        {items}
        <AddCategoryRow
          number={categories.length + 1}
          taken={new Set(categories.map((c) => nameKey(c.name)))}
          onAdd={(name, description) =>
            edit([
              ...categories,
              {
                id: crypto.randomUUID(),
                name,
                description,
                example_track_ids: [],
              },
            ])
          }
        />
      </ol>
    </DndContext>
  );
}

/** Stands in the removed row's place until the next delete, merge or undo. */
function UndoLine({ text, onUndo }: { text: string; onUndo: () => void }) {
  const { item, spring } = useMotionConfig();
  const textId = useId();
  return (
    <motion.li
      variants={item}
      initial="hidden"
      animate="visible"
      transition={spring}
      className={clsx(
        ROW_GRID,
        "border-b border-[var(--color-border-default)] py-3",
      )}
    >
      <span aria-hidden />
      <p className="flex flex-wrap items-baseline gap-x-4 py-1 text-sm text-[var(--color-text-tertiary)] col-start-2 lg:col-end-4">
        <span id={textId}>{text}</span>
        <Button
          variant="ghost"
          size="sm"
          data-focus="undo"
          aria-describedby={textId}
          onClick={onUndo}
        >
          Undo
        </Button>
      </p>
    </motion.li>
  );
}
