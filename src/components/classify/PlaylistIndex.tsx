"use client";
import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Tab } from "@/src/components/graphics/Tab";
import { EASE_IN_OUT } from "@/src/components/design/motion";
import type { Temperature } from "@/src/lib/sleeves/temperature";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { Count } from "./Count";
import type { DragSource, DropTarget } from "./moves";
import { useRovingFocus, type RovingRowProps } from "./roving";

export interface IndexEntry {
  id: string;
  name: string;
  count: number;
  catalogueNo: number;
  temperature: Temperature;
}

interface Props {
  /** In display order: the caller sorts (largest first, re-sorted by the ruler). */
  playlists: IndexEntry[];
  /** The bars' full length: the largest count the ruler can produce. */
  scale: number;
  /** "select": one playlist shown beside the list. "expand": opens in place. */
  mode: "select" | "expand";
  current: string | null;
  onPick: (id: string) => void;
  /** Expand mode: what opens under the current row. */
  open?: ReactNode;
}

export const countLabel = (n: number): string =>
  `${n.toLocaleString("en-US")} track${n === 1 ? "" : "s"}`;

// Re-sorting slides rows to their new places (FLIP), both ends on screen.
const FLIP = { duration: 0.24, ease: EASE_IN_OUT };

// TuneView sets --ruler-band on phones: the pinned band under the strip.
const BAND_CLEAR = "max-tab:scroll-mt-[var(--ruler-band,0px)]";

/** The playlists as a column of index rows. Rows are drop targets. */
export function PlaylistIndex({
  playlists,
  scale,
  mode,
  current,
  onPick,
  open,
}: Props) {
  const { reduced, item, spring, itemDelay } = useMotionConfig();
  const roving = useRovingFocus(
    "playlist",
    playlists.map((p) => p.id),
    current,
  );
  // Safari doesn't focus a clicked button, so a pick moves the Tab stop too.
  const pick = (id: string) => {
    roving.setStop(id);
    onPick(id);
  };
  return (
    <ol
      aria-label="Categories"
      onKeyDown={roving.onKeyDown}
      className="@container flex flex-col gap-1"
    >
      {playlists.map((p, i) => (
        <motion.li
          key={p.id}
          data-playlist={p.id}
          // A row opened on a phone scrolls to the top, below the band.
          className={BAND_CLEAR}
          layout={reduced ? false : "position"}
          variants={item}
          initial="hidden"
          animate="visible"
          transition={{ ...spring, delay: itemDelay(i), layout: FLIP }}
        >
          <Row
            entry={p}
            scale={scale}
            mode={mode}
            current={p.id === current}
            onPick={pick}
            roving={roving.rowProps(p.id)}
          />
          {mode === "expand" && p.id === current && open}
        </motion.li>
      ))}
    </ol>
  );
}

function Row({
  entry,
  scale,
  mode,
  current,
  onPick,
  roving,
}: {
  entry: IndexEntry;
  scale: number;
  mode: Props["mode"];
  current: boolean;
  onPick: (id: string) => void;
  roving: RovingRowProps;
}) {
  const { snap } = useMotionConfig();
  const { setNodeRef, isOver, active } = useDroppable({
    id: `playlist:${entry.id}`,
    data: { categoryId: entry.id, name: entry.name } satisfies DropTarget & {
      name: string;
    },
  });
  const source = active?.data.current as DragSource | undefined;
  // Dropping a song back where it came from does nothing, so it doesn't light.
  const target = isOver && source?.fromCategoryId !== entry.id;
  const expand = mode === "expand";
  const open = current && !expand;

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...roving}
      aria-label={`${entry.name}, ${countLabel(entry.count)}`}
      aria-pressed={expand ? undefined : current}
      aria-expanded={expand ? current : undefined}
      onClick={() => onPick(entry.id)}
      className={clsx(
        "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[3px] border px-2.5 text-left",
        "transition-colors duration-180 ease-out focus-visible:outline-offset-[-2px]",
        // On a phone, focus scrolls clear of the ruler band under the strip.
        BAND_CLEAR,
        expand ? "min-h-14 py-2.5" : "min-h-12 py-2",
        // The open row is pinned under the strip (and a phone's ruler band)
        // while its songs scroll.
        expand &&
          current &&
          "paper-tooth sticky top-strip z-10 max-tab:top-[calc(var(--strip-h)+var(--ruler-band,0px))]",
        target
          ? "border-ink bg-card"
          : open
            ? "border-ink bg-tint"
            : "border-transparent hover:bg-paper-deep",
      )}
    >
      <Tab
        catalogueNo={entry.catalogueNo}
        temperature={entry.temperature}
        size="review"
        reversed={open || (expand && current)}
        className="group-hover:-translate-y-[3px] motion-reduce:group-hover:translate-y-0"
      />
      <span className="truncate font-semibold text-ink decoration-rule-strong decoration-[1.5px] underline-offset-[5px] group-hover:underline">
        {entry.name}
      </span>
      {/* Review's count grammar, so one count reads the same on both pages:
          a 96px bar beside the count in a wide index, the count over a short
          bar in a narrow one (the desk column, a phone). */}
      <span
        aria-hidden
        className="grid w-14 grid-cols-1 items-center gap-y-1 @min-[34rem]:w-auto @min-[34rem]:grid-cols-[96px_minmax(40px,auto)] @min-[34rem]:gap-x-3"
      >
        {/* One scale for every row and every cutoff, so a bar shrinks when
            the ruler rises instead of every bar re-normalising. */}
        <span className="row-start-2 block h-1.5 @min-[34rem]:row-start-1">
          <motion.span
            className="block h-full origin-left bg-ink"
            initial={false}
            animate={{
              scaleX: scale > 0 ? Math.min(entry.count / scale, 1) : 0,
            }}
            transition={snap}
          />
        </span>
        <Count
          value={entry.count}
          className={clsx(
            "num text-right font-semibold",
            // Apply still creates an empty playlist: the one count worth ink.
            entry.count === 0 ? "text-warn-ink" : "text-ink",
          )}
        />
      </span>
    </button>
  );
}
