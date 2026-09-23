"use client";
import { useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { getEventCoordinates, type Transform } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { TrackRow } from "@/src/components/design/TrackRow";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { DraftCategory } from "@/src/lib/categories/merge";
import { FieldTextarea } from "./FieldTextarea";
import { MergePicker } from "./MergePicker";
import type { TrackLookupEntry } from "./TrackSearchModal";
import { useFocusAfterRender } from "./useFocusAfterRender";

// One grid for every line of the index (rows, the undo line, the add row), so
// names and descriptions sit in the same columns all the way down.
export const ROW_GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-4 lg:grid-cols-[2rem_minmax(0,22rem)_minmax(0,1fr)] lg:gap-x-8";
export const INDEX_TYPE =
  "font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]";
export const position = (n: number) => String(n).padStart(2, "0");

export interface CategoryRowProps {
  category: DraftCategory;
  /** 1-based place in the index. */
  number: number;
  tracks: Record<string, TrackLookupEntry>;
  /** Everything in the draft, for Merge into…'s list. */
  categories: readonly DraftCategory[];
  expanded: boolean;
  duplicate: boolean;
  entranceDelay: number;
  onOpen: () => void;
  onClose: () => void;
  onChange: (next: DraftCategory) => void;
  onDelete: () => void;
  onMerge: (targetId: string) => void;
  onAddTrack: () => void;
}

export function CategoryRow({
  category,
  number,
  tracks,
  categories,
  expanded,
  duplicate,
  entranceDelay,
  onOpen,
  onClose,
  onChange,
  onDelete,
  onMerge,
  onAddTrack,
}: CategoryRowProps) {
  const { item, spring } = useMotionConfig();
  const rootRef = useRef<HTMLLIElement>(null);
  const focusAfter = useFocusAfterRender(rootRef);
  const [picking, setPicking] = useState(false);
  const [nameAtFocus, setNameAtFocus] = useState(category.name);
  const descriptionId = useId();
  const errorId = useId();
  const id = category.id;

  // Mouse only: keyboard and touch merge through Merge into…, so a scroll
  // gesture can never start a drag.
  const drag = useDraggable({ id, disabled: expanded });
  const drop = useDroppable({ id });
  const target = drop.isOver && !drag.isDragging;

  // An emptied name goes back to what it was when the field took focus.
  function commitName() {
    const trimmed = category.name.trim();
    if (!trimmed) onChange({ ...category, name: nameAtFocus });
    else if (trimmed !== category.name)
      onChange({ ...category, name: trimmed });
  }

  function close() {
    commitName();
    setPicking(false);
    onClose();
  }

  const others = categories.filter((c) => c.id !== id);
  const samples = expanded
    ? category.example_track_ids.flatMap((t) => tracks[t] ?? [])
    : [];

  return (
    <motion.li
      ref={(el) => {
        rootRef.current = el;
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      variants={item}
      initial="hidden"
      animate="visible"
      transition={{ ...spring, delay: entranceDelay }}
      className={clsx(
        "relative border-b border-[var(--color-border-default)] transition-colors duration-200",
        target && "bg-[var(--color-bg-surface)]",
      )}
    >
      {drag.isDragging && drag.transform && (
        <DragTag name={category.name} transform={drag.transform} />
      )}
      <div
        className={clsx(
          "transition-opacity duration-200",
          drag.isDragging && "opacity-40",
        )}
      >
        {expanded ? (
          <div className={clsx(ROW_GRID, "gap-y-2 py-3")}>
            <span aria-hidden className={INDEX_TYPE}>
              {position(number)}
            </span>
            <div className="min-w-0">
              <FieldTextarea
                face="display"
                data-focus={`name:${id}`}
                aria-label="Category name"
                value={category.name}
                invalid={duplicate}
                aria-describedby={duplicate ? errorId : undefined}
                onFocus={() => setNameAtFocus(category.name)}
                onBlur={commitName}
                onValueChange={(name) => onChange({ ...category, name })}
                onEnter={() =>
                  rootRef.current
                    ?.querySelector<HTMLElement>(
                      `[data-focus="description:${id}"]`,
                    )
                    ?.focus()
                }
                onEscape={close}
              />
              {duplicate && (
                <p
                  id={errorId}
                  role="alert"
                  className="mt-1 text-sm text-[var(--color-danger)]"
                >
                  Another category is called this.
                </p>
              )}
            </div>
            <div className="col-start-2 min-w-0 lg:col-start-3">
              <FieldTextarea
                face="body"
                data-focus={`description:${id}`}
                aria-label="Description"
                value={category.description}
                onValueChange={(description) =>
                  onChange({ ...category, description })
                }
                onEscape={close}
              />
            </div>
            <motion.div
              variants={item}
              initial="hidden"
              animate="visible"
              transition={spring}
              className="col-start-2 min-w-0 pb-2 pt-4 lg:col-end-4"
            >
              {samples.length > 0 && (
                <ol className="mb-5">
                  {samples.map((t) => (
                    <TrackRow
                      key={t.id}
                      // The index's own columns: artists under descriptions.
                      className="lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-x-8"
                      title={t.title}
                      artist={t.artist_name}
                      href={`spotify:track:${t.id}`}
                    />
                  ))}
                </ol>
              )}
              {picking ? (
                <MergePicker
                  sourceName={category.name}
                  targets={others}
                  onMerge={onMerge}
                  onCancel={() => {
                    setPicking(false);
                    focusAfter(`merge:${id}`);
                  }}
                />
              ) : (
                // All four fit one line at 390 with the tighter gap; narrower,
                // Close wraps to the start of the next line, not stranded right.
                <div className="-ml-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 md:gap-x-6">
                  <Button variant="ghost" size="sm" onClick={onAddTrack}>
                    Add track
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-focus={`merge:${id}`}
                    disabled={others.length === 0}
                    onClick={() => setPicking(true)}
                  >
                    Merge into…
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onDelete}>
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:ml-auto"
                    onClick={close}
                  >
                    Close
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        ) : (
          <button
            type="button"
            data-focus={`row:${id}`}
            aria-describedby={descriptionId}
            onClick={onOpen}
            {...drag.listeners}
            className={clsx(
              ROW_GRID,
              "group w-full cursor-pointer py-3 text-left",
            )}
          >
            <span aria-hidden className={INDEX_TYPE}>
              {position(number)}
            </span>
            <span
              className={clsx(
                "border-b border-transparent py-1 font-[family-name:var(--font-display)] text-xl leading-tight tracking-tight md:text-2xl",
                // Hover underlines the name itself, at every width; the
                // description that also brightens is hidden below lg.
                "underline decoration-transparent decoration-1 underline-offset-4 transition-colors duration-200 group-hover:decoration-[var(--color-border-strong)]",
                // A clash stays marked after its row closes; the bar alone
                // doesn't say which two rows.
                duplicate
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-text-primary)]",
              )}
            >
              {category.name}
            </span>
            <span
              id={descriptionId}
              aria-hidden
              className="hidden truncate border-b border-transparent py-1 text-sm leading-relaxed text-[var(--color-text-secondary)] transition-colors duration-200 group-hover:text-[var(--color-text-primary)] lg:block"
            >
              {category.description}
            </span>
          </button>
        )}
      </div>
    </motion.li>
  );
}

/**
 * The name, following the pointer on the brief's spring. It sits below and
 * right of the cursor so the row being dropped on stays readable; the row
 * itself stays put, dimmed, to show where it came from.
 */
const TAG_WIDTH = 256;

function DragTag({ name, transform }: { name: string; transform: Transform }) {
  const { activatorEvent, activeNodeRect } = useDndContext();
  const { spring } = useMotionConfig();
  const start = activatorEvent && getEventCoordinates(activatorEvent);
  if (!start || !activeNodeRect) return null;
  const left = start.x - activeNodeRect.left + 16;
  // Held inside the row's width (the tag is at most 16rem), so the page never
  // scrolls sideways under a drag.
  const x = Math.max(
    -left,
    Math.min(transform.x, activeNodeRect.width - TAG_WIDTH - left),
  );
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-20 max-w-64 truncate border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 py-1.5 font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--color-text-primary)]"
      style={{ left, top: start.y - activeNodeRect.top + 16 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, x, y: transform.y }}
      transition={spring}
    >
      {name}
    </motion.div>
  );
}
