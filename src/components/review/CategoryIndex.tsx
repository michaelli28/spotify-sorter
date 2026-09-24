"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LayoutGroup, motion } from "framer-motion";
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
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import {
  Tab,
  TemperatureKey,
  TemperatureLegend,
} from "@/src/components/graphics/Tab";
import { DESK_UP, useMediaQuery } from "@/src/hooks/useMediaQuery";
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
import { effectiveTemperature } from "@/src/lib/sleeves/lexicon";
import { AddCategoryRow } from "./AddCategoryRow";
import { CategoryRow, NAME_INSET, type Qty } from "./CategoryRow";
import { CategorySheet, type CategorySheetProps } from "./CategorySheet";
import { flyOut, type Leaving } from "./ghost";
import type { LibraryStats } from "./stats";
import type { TrackLookupEntry } from "./TrackSearchModal";
import { useFocusAfterRender } from "./useFocusAfterRender";

export interface CategoryIndexProps {
  categories: DraftCategory[];
  /** What the cache holds, in catalogue order: sleeves print against it. */
  saved: readonly DraftCategory[];
  tracks: Record<string, TrackLookupEntry>;
  stats: LibraryStats;
  /** False while nothing is placed: no counts, no chart. */
  placed: boolean;
  showMostly: boolean;
  onChange: (next: DraftCategory[]) => void;
  onAddTrack: (categoryId: string) => void;
  /** What a drop would do right now, for the page's status line. */
  onDragHint: (hint: string | null) => void;
  onRepropose: () => void;
}

// dnd-kit's defaults announce the dragged UUID; the page's status line says
// the same thing in names instead.
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

// Below the top strip, with the brief's 16px of air.
const STICKY = "sticky top-[calc(var(--strip-h)+var(--space-sm))] pt-4";

const cardOf = (root: HTMLElement | null, id: string) =>
  root?.querySelector<HTMLElement>(`[data-card=${JSON.stringify(id)}]`) ?? null;

/** The id a #hash names; null for a hand-mangled one ("%E0%A4%A"). */
function hashId(hash: string): string | null {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
}

/**
 * The bin and the pulled sheet (brief §3 Review): list + detail. One divider
 * is open at a time; on desktop it is pulled into the sticky sheet beside the
 * bin, at ≤900px its editor opens inside the divider.
 */
export function CategoryIndex({
  categories,
  saved,
  tracks,
  stats,
  placed,
  showMostly,
  onChange,
  onAddTrack,
  onDragHint,
  onRepropose,
}: CategoryIndexProps) {
  const { itemDelay, reduced } = useMotionConfig();
  const wide = useMediaQuery(DESK_UP, true);
  const rootRef = useRef<HTMLDivElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const focusAfter = useFocusAfterRender(rootRef);
  const sheetId = useId();
  // The key's "what they mean": the legend opens under the column head.
  const legendId = useId();
  const [explained, setExplained] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // The 240ms a sleeve is morphing from its row into the side sheet.
  const [flying, setFlying] = useState(false);
  const [undo, setUndo] = useState<{ edit: UndoableEdit; seq: number } | null>(
    null,
  );
  // Merge targets: their saved count no longer holds until Classify.
  const [stale, setStale] = useState<ReadonlyMap<string, number>>(new Map());
  // Only the first render staggers in: a row added or restored later has
  // nothing to wait for.
  const [touched, setTouched] = useState(false);
  // Where the divider being opened sat, so the page can hold it in place.
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const ids = useRef(new Set<string>());
  useLayoutEffect(() => {
    ids.current = new Set(categories.map((c) => c.id));
  }, [categories]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  );

  const dupes = duplicateNameKeys(categories);
  const nameOf = (id: unknown) =>
    categories.find((c) => c.id === id)?.name ?? "";
  const open = categories.find((c) => c.id === openId);

  // /review#<id> (the press list's links) pulls that divider.
  useEffect(() => {
    function fromHash() {
      const id = hashId(window.location.hash);
      if (id === null || !ids.current.has(id)) return;
      setOpenId(id);
      // The sleeve morphs out of its row, as on a click; nothing if unmoving.
      setFlying(true);
      requestAnimationFrame(() =>
        cardOf(rootRef.current, id)?.scrollIntoView?.({ block: "center" }),
      );
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  // Opening a divider while another is open above it (≤900px) would shift it
  // under the pointer; scroll by the same amount so it stays put.
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    const now = cardOf(rootRef.current, a.id)?.getBoundingClientRect().top;
    if (now !== undefined && Math.abs(now - a.top) > 1)
      window.scrollBy(0, now - a.top);
  });

  // A newly pulled divider starts at the top of the sheet.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [openId]);

  function edit(next: DraftCategory[]) {
    setTouched(true);
    onChange(next);
  }

  useEffect(() => {
    if (!flying) return;
    const t = setTimeout(() => setFlying(false), DURATION.state * 1000 + 40);
    return () => clearTimeout(t);
  }, [flying]);

  function openRow(id: string) {
    const top = cardOf(rootRef.current, id)?.getBoundingClientRect().top;
    anchor.current = top === undefined ? null : { id, top };
    setOpenId(id);
    if (wide && !reduced) setFlying(true);
    focusAfter(`name:${id}`);
  }

  function closeRow(id: string) {
    setOpenId(null);
    focusAfter(`row:${id}`);
  }

  function remember(result: EditResult | null, id: string, kind: Leaving) {
    if (!result) return;
    flyOut(cardOf(rootRef.current, id), ghosts.current, kind, reduced);
    if (openId === id) setOpenId(null);
    setUndo((u) => ({ edit: result.undo, seq: (u?.seq ?? 0) + 1 }));
    if (result.undo.kind === "merge") {
      const target = result.undo.targetId;
      setStale((s) => new Map(s).set(target, (s.get(target) ?? 0) + 1));
    }
    edit(result.draft);
    focusAfter("undo");
  }

  function undoLast() {
    if (!undo) return;
    const { edit: last } = undo;
    const restored = last.kind === "delete" ? last.category : last.source;
    if (last.kind === "merge")
      setStale((s) => {
        const next = new Map(s);
        const n = (next.get(last.targetId) ?? 0) - 1;
        if (n > 0) next.set(last.targetId, n);
        else next.delete(last.targetId);
        return next;
      });
    edit(undoEdit(categories, last));
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
    remember(
      mergeCategory(categories, source, String(over.id)),
      source,
      "merge",
    );
  }

  function qtyOf(c: DraftCategory): Qty {
    if (!placed) return { kind: "hidden" };
    const s = stats.byCategory[c.id];
    if (!s) return { kind: "new" };
    return {
      kind: "count",
      count: s.count,
      scale: stats.max > 0 ? s.count / stats.max : 0,
      stale: stale.has(c.id),
    };
  }

  function sheetFor(
    c: DraftCategory,
    variant: CategorySheetProps["variant"],
  ): ReactNode {
    return (
      <CategorySheet
        key={c.id}
        variant={variant}
        category={c}
        catalogue={saved}
        categories={categories}
        tracks={tracks}
        stats={stats.byCategory[c.id]}
        fit={stats.fit}
        placed={placed}
        stale={stale.has(c.id)}
        showMostly={showMostly}
        duplicate={dupes.has(nameKey(c.name))}
        onChange={(next) =>
          edit(categories.map((x) => (x.id === next.id ? next : x)))
        }
        onClose={() => closeRow(c.id)}
        onDelete={() =>
          remember(deleteCategory(categories, c.id), c.id, "delete")
        }
        onMerge={(targetId) =>
          remember(mergeCategory(categories, c.id, targetId), c.id, "merge")
        }
        onAddTrack={() => onAddTrack(c.id)}
      />
    );
  }

  const rows = categories.map((c, i) => {
    const isOpen = c.id === openId;
    return (
      <CategoryRow
        key={c.id}
        category={c}
        catalogue={saved}
        number={i + 1}
        open={isOpen}
        editor={
          isOpen && !wide ? (
            <InlineEditor>{sheetFor(c, "inline")}</InlineEditor>
          ) : null
        }
        controls={isOpen && wide ? sheetId : undefined}
        duplicate={dupes.has(nameKey(c.name))}
        qty={qtyOf(c)}
        entranceDelay={touched ? null : itemDelay(i)}
        onToggle={() => (isOpen ? closeRow(c.id) : openRow(c.id))}
      />
    );
  });
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
  const openNumber = open ? categories.indexOf(open) + 1 : 0;

  return (
    <LayoutGroup id="review-sleeves">
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
        <div
          ref={rootRef}
          className="grid items-start gap-12 [--sheet-w:380px] desk:grid-cols-[minmax(0,1fr)_var(--sheet-w)] min-[1101px]:[--sheet-w:440px]"
        >
          {/* Full-bleed on phones, so a lifted divider mustn't widen the page. */}
          <div className="rounded-[3px] border border-rule-strong bg-paper-deep px-4 pt-3 pb-4 max-tab:-mx-gutter max-tab:overflow-x-clip max-tab:rounded-none max-tab:border-x-0 max-tab:px-gutter">
            <div className="flex items-center justify-between gap-4 px-3 text-ink-2 max-tab:px-0.5">
              <TemperatureKey
                className="max-tab:gap-x-2.5"
                explained={explained}
                explainId={legendId}
                onExplain={() => setExplained((open) => !open)}
              />
              {placed && (
                <span className="mono whitespace-nowrap">
                  <span className="max-tab:hidden">Tracks at </span>fit{" "}
                  {stats.fit}
                </span>
              )}
            </div>
            {explained && (
              <TemperatureLegend
                id={legendId}
                className="mx-3 mt-3 mb-1 max-tab:mx-0.5"
              >
                Colours are guessed from each category’s name. Open a category
                to change its Colour.
              </TemperatureLegend>
            )}
            {/* Tabs stand 16px proud: the 8px gap tucks each over the card behind. */}
            <div className="relative">
              <ol className="flex flex-col gap-2 pt-6">
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
              <div
                ref={ghosts}
                aria-hidden
                className="pointer-events-none absolute inset-0"
              />
            </div>
            <div className="flex px-3 pt-3 max-tab:px-0.5">
              <Button variant="ghost" onClick={onRepropose}>
                Re-propose all…
              </Button>
            </div>
          </div>

          {wide && open && (
            <aside id={sheetId} aria-label="Open category" className={STICKY}>
              <Tab
                catalogueNo={openNumber}
                temperature={effectiveTemperature(open)}
                size="review"
                reversed
                aria-hidden
                className="absolute top-[3px] left-0 border-[1.5px]"
              />
              <motion.div
                ref={scroller}
                // Measured with its scroll, so a sleeve leaves from where it shows.
                layoutScroll
                className={clsx(
                  // relative: anything absolute inside scrolls with it.
                  // scroll-pt: a control focused on the way up lands below
                  // the pinned action row (45px), not under it.
                  "relative max-h-[calc(100dvh-var(--strip-h)-48px)] scroll-pt-14 overscroll-contain rounded-[0_3px_3px_3px] border-[1.5px] border-ink bg-card px-6 pb-6 [scrollbar-color:var(--rule-strong)_transparent] [scrollbar-width:thin]",
                  // While a sleeve flies in from the bin the frame can't
                  // clip it sideways; clip (not hidden) keeps y from scrolling.
                  flying
                    ? "overflow-x-visible overflow-y-clip"
                    : "overflow-y-auto",
                )}
              >
                {sheetFor(open, "side")}
              </motion.div>
            </aside>
          )}
          {/* The sheet's column never sits blank: a dashed slot, like the
              open divider's empty sleeve slot, says what goes there. */}
          {wide && !open && categories.length > 0 && (
            <div className={STICKY}>
              <p className="grid min-h-60 place-items-center rounded-[3px] border-[1.5px] border-dashed border-rule-strong px-6 text-center text-ink-2">
                Open a category to edit it here.
              </p>
            </div>
          )}
        </div>
      </DndContext>
    </LayoutGroup>
  );
}

/** ≤900px: the sheet opens inside its divider, growing from the row. */
function InlineEditor({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-240 ease-out starting:grid-rows-[0fr] motion-reduce:transition-none">
      <div className="min-h-0 overflow-hidden">
        <div className="p-4 pb-6 max-tab:px-2.5">{children}</div>
      </div>
    </div>
  );
}

/** Stands in the removed divider's place until the next delete, merge or undo. */
function UndoLine({ text, onUndo }: { text: string; onUndo: () => void }) {
  const { reduced } = useMotionConfig();
  const textId = useId();
  return (
    <motion.li
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? DURATION.reduced : DURATION.state,
        ease: EASE_OUT,
      }}
      className={clsx(
        "flex min-h-[58px] flex-wrap items-center gap-x-4 rounded-[3px] border-[1.5px] border-dashed border-rule-strong pr-3 text-ink-2 max-tab:min-h-[54px]",
        NAME_INSET,
      )}
    >
      <span id={textId}>{text}</span>
      <Button
        variant="quiet"
        data-focus="undo"
        aria-describedby={textId}
        onClick={onUndo}
      >
        Undo
      </Button>
    </motion.li>
  );
}
