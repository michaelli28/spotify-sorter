"use client";
import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { Count } from "./Count";
import type { DragSource, DropTarget } from "./moves";
import { useRovingFocus, type RovingRowProps } from "./roving";

export interface IndexEntry {
  id: string;
  name: string;
  count: number;
}

interface Props {
  playlists: IndexEntry[];
  /** "select": one playlist shown beside the list. "expand": opens in place. */
  mode: "select" | "expand";
  current: string | null;
  onPick: (id: string) => void;
  /** Expand mode: what opens under the current row. */
  open?: ReactNode;
}

export const countLabel = (n: number): string =>
  `${n.toLocaleString()} track${n === 1 ? "" : "s"}`;

/** The playlists in library order, never re-sorted. Rows are drop targets. */
export function PlaylistIndex({
  playlists,
  mode,
  current,
  onPick,
  open,
}: Props) {
  const { item, spring, itemDelay } = useMotionConfig();
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
    <ol aria-label="Playlists" onKeyDown={roving.onKeyDown}>
      {playlists.map((p, i) => (
        <motion.li
          key={p.id}
          data-playlist={p.id}
          variants={item}
          initial="hidden"
          animate="visible"
          transition={{ ...spring, delay: itemDelay(i) }}
        >
          <Row
            entry={p}
            number={i + 1}
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
  number,
  mode,
  current,
  onPick,
  roving,
}: {
  entry: IndexEntry;
  number: number;
  mode: Props["mode"];
  current: boolean;
  onPick: (id: string) => void;
  roving: RovingRowProps;
}) {
  const { spring } = useMotionConfig();
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
        "group grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-2 text-left",
        "transition-colors duration-200 focus-visible:outline-offset-[-2px]",
        expand ? "min-h-12 py-3" : "py-1.5",
        expand && current && "sticky top-0 z-10 bg-[var(--color-bg-base)]",
        target && "bg-[var(--color-bg-elevated)]",
      )}
    >
      <span
        aria-hidden
        className="text-right font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]"
      >
        {String(number).padStart(2, "0")}
      </span>
      <span className="truncate">
        <span
          className={clsx(
            "relative font-[family-name:var(--font-display)] text-lg leading-snug transition-colors duration-200",
            current || target
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]",
          )}
        >
          {entry.name}
          {current && !expand && (
            <motion.span
              layoutId="playlist-selected"
              transition={spring}
              className="absolute inset-x-0 bottom-0 h-px bg-[var(--color-text-primary)]"
            />
          )}
        </span>
      </span>
      <Count
        value={entry.count}
        className={clsx(
          "font-[family-name:var(--font-mono)] text-xs tabular-nums",
          // Apply still creates an empty playlist: the one count worth ink.
          entry.count === 0
            ? "text-[var(--color-warning)]"
            : "text-[var(--color-text-tertiary)]",
        )}
      />
    </button>
  );
}
