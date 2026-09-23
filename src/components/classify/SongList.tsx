"use client";
import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { dragId, type DragSource } from "./moves";
import { useRovingFocus, type RovingRowProps } from "./roving";

export interface Song {
  id: string;
  title: string;
  artist: string;
}

interface Props {
  categoryId: string;
  songs: Song[];
  /** The playlist's name, which names the list. */
  label: string;
  pageSize: number;
  draggable: boolean;
  onMove: (song: Song) => void;
}

/**
 * One playlist's songs as liner notes, in library order. Each row is a button
 * that opens "Move to…", and on a fine pointer can be dragged to the index.
 * Key it by playlist so paging resets and the new list fades in.
 */
export function SongList({
  categoryId,
  songs,
  label,
  pageSize,
  draggable,
  onMove,
}: Props) {
  const [shown, setShown] = useState(pageSize);
  // A page that just opened staggers in from its first row. Later arrivals
  // (the slider letting a song in) fade in at once, without a queue.
  const [staggerFrom, setStaggerFrom] = useState<number | null>(0);
  const { item, spring, itemDelay } = useMotionConfig();
  const visible = songs.slice(0, shown);
  const roving = useRovingFocus(
    "song",
    visible.map((s) => s.id),
  );

  useEffect(() => {
    if (staggerFrom === null) return;
    const settled = setTimeout(() => setStaggerFrom(null), 800);
    return () => clearTimeout(settled);
  }, [staggerFrom]);

  return (
    <>
      <ol aria-label={label} onKeyDown={roving.onKeyDown}>
        {visible.map((song, i) => (
          <motion.li
            key={song.id}
            variants={item}
            initial="hidden"
            animate="visible"
            transition={{
              ...spring,
              delay:
                staggerFrom !== null && i >= staggerFrom
                  ? itemDelay(i - staggerFrom)
                  : 0,
            }}
          >
            <SongRow
              song={song}
              number={i + 1}
              categoryId={categoryId}
              draggable={draggable}
              onMove={onMove}
              roving={roving.rowProps(song.id)}
            />
          </motion.li>
        ))}
      </ol>
      {songs.length > shown && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 -ml-1"
          onClick={() => {
            setStaggerFrom(shown);
            setShown(shown + pageSize);
          }}
        >
          Show {Math.min(pageSize, songs.length - shown)} more
        </Button>
      )}
    </>
  );
}

function SongRow({
  song,
  number,
  categoryId,
  draggable,
  onMove,
  roving,
}: {
  song: Song;
  number: number;
  categoryId: string;
  draggable: boolean;
  onMove: (song: Song) => void;
  roving: RovingRowProps;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: dragId(categoryId, song.id),
    data: {
      trackId: song.id,
      fromCategoryId: categoryId,
      title: song.title,
      artist: song.artist,
    } satisfies DragSource & { title: string; artist: string },
    disabled: !draggable,
  });
  return (
    // Same columns as TrackRow, but the whole line is the control.
    <button
      ref={setNodeRef}
      type="button"
      {...roving}
      data-track={song.id}
      aria-haspopup="dialog"
      aria-label={`Move ${song.title} by ${song.artist}`}
      title={`${song.title} · ${song.artist}`}
      onClick={() => onMove(song)}
      {...(draggable ? listeners : {})}
      className={clsx(
        "grid w-full grid-cols-[2rem_minmax(0,3fr)_minmax(0,2fr)] items-baseline gap-x-4 px-2 py-1.5 text-left text-sm",
        "transition-colors duration-200 hover:bg-[var(--color-bg-surface)] focus-visible:outline-offset-[-2px]",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <span
        aria-hidden
        className="text-right font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]"
      >
        {String(number).padStart(2, "0")}
      </span>
      <span className="truncate text-[var(--color-text-primary)]">
        {song.title}
      </span>
      <span className="truncate text-[var(--color-text-secondary)]">
        {song.artist}
      </span>
    </button>
  );
}
