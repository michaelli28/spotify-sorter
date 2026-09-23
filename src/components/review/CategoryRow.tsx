"use client";
import { memo, useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { Sleeve } from "@/src/components/graphics/Sleeve";
import { Tab } from "@/src/components/graphics/Tab";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { DraftCategory } from "@/src/lib/categories/merge";
import { effectiveTemperature } from "@/src/lib/sleeves/lexicon";
import { SLEEVE_MORPH, sleeveLayoutId } from "./PrintedSleeve";

/** What the divider's quantity column prints (brief §3, "States"). */
export type Qty =
  /** Nothing placed yet: no column at all, never a stack of zeros. */
  | { kind: "hidden" }
  /** Added since the last Classify: no saved number to show. */
  | { kind: "new" }
  /** `stale`: a merge target, whose saved number no longer holds. */
  | { kind: "count"; count: number; scale: number; stale: boolean };

// The name's column: 1px border + padding + sleeve + gap (65px; 57px on
// phones). Offsets count from inside the border, so the dashed blanks (1.5px
// border) take half a pixel off to land in the same column.
export const TAB_AT = "absolute -top-4 left-16 max-tab:left-14";
export const TAB_AT_DASHED =
  "absolute -top-4 left-[63.5px] max-tab:left-[55.5px]";
/** The dashed Undo line's and Add a category's text, on the name's column. */
export const NAME_INSET = "pl-[63.5px] max-tab:pl-[55.5px]";

export interface CategoryRowProps {
  category: DraftCategory;
  /** The saved list, in catalogue order: sleeves print against it. */
  catalogue: readonly DraftCategory[];
  /** 1-based place in the bin: the tab's catalogue number. */
  number: number;
  open: boolean;
  /** ≤900px: the open divider holds its editor in place of the row. */
  editor: ReactNode;
  /** The side sheet's id, while this divider is the one pulled into it. */
  controls?: string;
  duplicate: boolean;
  qty: Qty;
  /** null: no entrance (rows added after the page arrived). */
  entranceDelay: number | null;
  onToggle: () => void;
}

/**
 * One category as a card-stock divider (brief §3 Review): its numbered tab,
 * its sleeve, name and description on one line, then a bar and the count on
 * the bin's shared scale. Drag it onto another divider to merge.
 */
export function CategoryRow({
  category,
  catalogue,
  number,
  open,
  editor,
  controls,
  duplicate,
  qty,
  entranceDelay,
  onToggle,
}: CategoryRowProps) {
  const { reduced } = useMotionConfig();
  const descriptionId = useId();
  const qtyId = useId();
  const id = category.id;

  // Mouse only: keyboard and touch merge through Merge into…, so a scroll
  // gesture can never start a drag.
  const drag = useDraggable({ id, disabled: open });
  const drop = useDroppable({ id });
  const dragging = drag.isDragging && drag.transform !== null;
  const target = drop.isOver && !drag.isDragging;
  const showQty = qty.kind !== "hidden";

  return (
    <motion.li
      data-row={id}
      initial={
        entranceDelay === null
          ? false
          : reduced
            ? { opacity: 0 }
            : { opacity: 0, rotateX: -38, y: 8 }
      }
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={
        reduced
          ? { duration: DURATION.reduced }
          : { duration: 0.42, ease: EASE_OUT, delay: entranceDelay ?? 0 }
      }
      // Flips up from its bottom edge, like a divider set back in the bin.
      style={{ transformPerspective: 900, originY: 1 }}
      // Each row is its own layer: a lifted divider must clear the ones after it.
      className={clsx("relative", dragging && "z-20")}
    >
      <div
        ref={(el) => {
          drag.setNodeRef(el);
          drop.setNodeRef(el);
        }}
        data-card={id}
        style={
          dragging
            ? { translate: `${drag.transform!.x}px ${drag.transform!.y}px` }
            : undefined
        }
        className={clsx(
          "group/divider relative rounded-[3px] border ease-out",
          // The follow is never eased; the lift is, and a cancelled drop settles back.
          dragging
            ? "scale-[1.02] -rotate-1 transition-[background-color,border-color,scale,rotate] duration-180"
            : "transition-[background-color,border-color,scale,rotate,translate] duration-240",
          open
            ? editor
              ? "border-ink bg-card"
              : "border-ink bg-tint"
            : target
              ? "border-ink bg-tint"
              : "border-rule-strong bg-card",
        )}
      >
        <Tab
          catalogueNo={number}
          temperature={effectiveTemperature(category)}
          size="review"
          reversed={open}
          aria-hidden
          className={clsx(
            TAB_AT,
            target
              ? "-translate-y-1"
              : !open && "group-hover/divider:-translate-y-[3px]",
          )}
        />
        {editor ?? (
          <button
            type="button"
            data-focus={`row:${id}`}
            aria-expanded={open}
            aria-controls={controls}
            aria-describedby={
              clsx(descriptionId, showQty && qtyId) || undefined
            }
            onClick={onToggle}
            {...drag.listeners}
            className={clsx(
              "grid w-full items-center gap-3 px-3 py-2 text-left max-tab:gap-2.5 max-tab:px-2.5",
              "cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:cursor-grab",
              showQty
                ? "grid-cols-[40px_minmax(0,1fr)_148px] max-tab:grid-cols-[36px_minmax(0,1fr)_56px]"
                : "grid-cols-[40px_minmax(0,1fr)] max-tab:grid-cols-[36px_minmax(0,1fr)]",
            )}
          >
            <span className="block size-10 max-tab:size-9">
              {open ? (
                // Pulled into the sheet: the slot stays empty until it closes.
                <span className="block size-full rounded-[1px] border-[1.5px] border-dashed border-ink-3" />
              ) : (
                <RowSleeve category={category} catalogue={catalogue} />
              )}
            </span>
            {/* The name keeps its width. The description takes what is left,
                and with under 12ch left it wraps onto a second line, which
                the one-line box (plus room for the hover underline) clips. */}
            <span className="-mb-1 flex h-[calc(1lh+4px)] min-w-0 flex-wrap items-baseline gap-x-3 gap-y-20 overflow-hidden text-lead leading-tight max-tab:text-body">
              <span
                className={clsx(
                  "max-w-full shrink-0 truncate font-semibold tracking-[-0.005em]",
                  "decoration-rule-strong decoration-[1.5px] underline-offset-[5px]",
                  !open && !dragging && "group-hover/divider:underline",
                  // A clash stays marked after its sheet closes.
                  duplicate ? "text-danger" : "text-ink",
                )}
              >
                {category.name}
              </span>
              {/* Read as the button's description, not its name. */}
              <span
                id={descriptionId}
                aria-hidden
                className="min-w-[12ch] flex-[1_1_12ch] truncate text-body text-ink-2 max-tab:hidden"
              >
                {category.description}
              </span>
            </span>
            {showQty && <Quantity id={qtyId} qty={qty} />}
          </button>
        )}
      </div>
    </motion.li>
  );
}

/**
 * The row's sleeve, holding the category's layoutId while the divider is
 * closed. Memoised: a drag re-renders every row on each move, and a sleeve
 * that re-renders makes the layout group measure all 41.
 */
const RowSleeve = memo(function RowSleeve({
  category,
  catalogue,
}: {
  category: DraftCategory;
  catalogue: readonly DraftCategory[];
}) {
  return (
    <motion.span
      layoutId={sleeveLayoutId(category.id)}
      transition={SLEEVE_MORPH}
      className="block size-full"
    >
      <Sleeve
        category={category}
        catalogue={catalogue}
        size={40}
        className="block size-full border border-ink"
      />
    </motion.span>
  );
});

function Quantity({ id, qty }: { id: string; qty: Qty }) {
  if (qty.kind === "hidden") return null;
  // What a screen reader hears, as one string: the marks below are hidden.
  const spoken =
    qty.kind === "new"
      ? "new, not sorted yet"
      : `${qty.count.toLocaleString()} ${qty.count === 1 ? "track" : "tracks"}${qty.stale ? ", before the merge" : ""}`;
  return (
    <>
      <span id={id} hidden>
        {spoken}
      </span>
      {qty.kind === "new" ? (
        <span aria-hidden className="mono text-right text-ink-3">
          new
        </span>
      ) : (
        <span
          aria-hidden
          className="grid grid-cols-[96px_minmax(40px,auto)] items-center gap-3 max-tab:grid-cols-1 max-tab:gap-1"
        >
          <span className="block h-1.5 max-tab:row-start-2">
            {qty.count > 0 && (
              <span
                // Grows from the left on the bin's shared scale, as on home.
                style={{ scale: `${Math.max(qty.scale, 0.02)} 1` }}
                className={clsx(
                  "block h-full origin-left",
                  qty.stale ? "bg-ink-3" : "bg-ink",
                )}
              />
            )}
          </span>
          <span
            className={clsx(
              "num text-right font-semibold",
              qty.stale ? "text-ink-3" : "text-ink",
            )}
          >
            {qty.count.toLocaleString()}
          </span>
        </span>
      )}
    </>
  );
}
