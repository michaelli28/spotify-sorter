"use client";
import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { AlbumArt } from "@/src/components/graphics/AlbumArt";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { dragId, type DragSource } from "./moves";
import { useRovingFocus, type RovingRowProps } from "./roving";

export interface Song {
  id: string;
  title: string;
  artist: string;
}

// Below desk the list opens under its playlist's row, which sticks under the
// strip (56px, 3.5rem): focus scrolls clear of it, and on a phone clear of the
// ruler band pinned above that row too.
const SCROLL_CLEAR =
  "max-desk:scroll-mt-14 max-tab:scroll-mt-[calc(3.5rem+var(--ruler-band,0px))]";

interface Props {
  categoryId: string;
  songs: Song[];
  /** The playlist's name, which names the list. */
  label: string;
  pageSize: number;
  draggable: boolean;
  /**
   * 2: two columns, read across, once the nearest @container is 44rem wide
   * (narrower, titles cut short). Row by row, so "Show more" adds at the foot
   * and the arrow keys keep the numbered order.
   */
  columns: 1 | 2;
  className?: string;
  onMove: (song: Song) => void;
}

/**
 * One playlist's songs as liner notes (brief §5): art, title over artist, in
 * library order. Each row is a button that opens "Move to…", and on a fine
 * pointer can be dragged to the index. Key it by playlist so paging resets
 * and the new list fades in. Never a score, rank or bin.
 */
export function SongList({
  categoryId,
  songs,
  label,
  pageSize,
  draggable,
  columns,
  className,
  onMove,
}: Props) {
  const [shown, setShown] = useState(pageSize);
  // A page that just opened staggers in from its first row. Later arrivals
  // (the ruler letting a song in) fade in at once, without a queue.
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
      <ol
        aria-label={label}
        onKeyDown={roving.onKeyDown}
        className={clsx(
          columns === 2 && "grid gap-x-8 @min-[44rem]:grid-cols-2",
          className,
        )}
      >
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
          className={clsx("mt-4", SCROLL_CLEAR)}
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
    // TrackRow's liner notes, but the whole line is the control.
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
        "group flex w-full items-center gap-3 rounded-[3px] px-2 py-1.5 text-left",
        "transition-colors duration-180 ease-out hover:bg-paper-deep focus-visible:outline-offset-[-2px]",
        SCROLL_CLEAR,
        // The art is part of the row: it mustn't start a native image drag.
        "[&_img]:pointer-events-none [&_img]:select-none",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <span aria-hidden className="mono num w-5 shrink-0 text-right text-ink-3">
        {String(number).padStart(2, "0")}
      </span>
      <AlbumArt trackId={song.id} size={40} link={false} />
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block truncate font-semibold text-ink group-hover:underline decoration-[1.5px] underline-offset-4">
          {song.title}
        </span>
        <span className="block truncate text-ink-2">{song.artist}</span>
      </span>
    </button>
  );
}
