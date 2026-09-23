"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type Over,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { ActionBar } from "@/src/components/design/ActionBar";
import { Button } from "@/src/components/design/Button";
import { EASE_OUT_EXPO, useMotionConfig } from "@/src/hooks/useMotionConfig";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { ConfidenceSlider } from "./ConfidenceSlider";
import { MoveDialog, type MovingSong } from "./MoveDialog";
import { PlaylistIndex, type IndexEntry } from "./PlaylistIndex";
import { SongList, type Song } from "./SongList";
import {
  StatusLine,
  type Moved,
  type Status,
  type StatusBody,
} from "./StatusLine";
import {
  dropDestination,
  moveMessage,
  otherPlaylistsLeft,
  pin,
  type DragSource,
  type DropTarget,
} from "./moves";
import type { Library, RunSummary } from "./useClassifyRun";
import { useMediaQuery } from "./useMediaQuery";

type DragData = DragSource & { title: string; artist: string };
type DropData = DropTarget & { name: string };

async function saveToCache(body: unknown): Promise<boolean> {
  try {
    const res = await fetch("/api/cache", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Stable id, so the line doesn't fade in again on every slider step.
const UNSAVED: Status = {
  kind: "warning",
  id: -1,
  text: "Confidence isn't saved until Apply to Spotify.",
};

const dragData = (a: Active | Over | null) =>
  a?.data.current as DragData | undefined;
const dropData = (o: Over | null) => o?.data.current as DropData | undefined;

// The lifted song floats just above and right of the pointer, so the playlist
// row under the pointer stays readable while you aim.
const abovePointer: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  overlayNodeRect,
  transform,
}) => {
  const start = activatorEvent && getEventCoordinates(activatorEvent);
  if (!start || !draggingNodeRect) return transform;
  const height = overlayNodeRect?.height ?? draggingNodeRect.height;
  return {
    ...transform,
    x: transform.x + start.x - draggingNodeRect.left + 12,
    y: transform.y + start.y - draggingNodeRect.top - height - 8,
  };
};

/**
 * The finished library: the index of playlists, one playlist's songs, and the
 * bar holding the slider and "Apply to Spotify". Nothing here saves the slider
 * until Apply: /label's blind study reads the saved value.
 */
export function TuneView({
  library,
  summary,
}: {
  library: Library;
  summary: RunSummary | null;
}) {
  const router = useRouter();
  const { reduced, fade } = useMotionConfig();
  const wide = useMediaQuery("(min-width: 768px)");
  const canDrag = useMediaQuery("(pointer: fine) and (min-width: 768px)");
  const pointer = useSensor(PointerSensor, {
    // A click on a row opens "Move to…"; only a real drag moves it.
    activationConstraint: { distance: 6 },
  });
  const dragSensors = useSensors(pointer);
  const noSensors = useSensors();

  const [assignments, setAssignments] = useState(library.assignments);
  const [saved, setSaved] = useState(library.config.confidence_threshold);
  const [threshold, setThreshold] = useState(saved);
  // The status id current when the slider last moved: news after it outranks
  // the unsaved note.
  const [sliderAt, setSliderAt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [moving, setMoving] = useState<MovingSong | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(
    summary ? { kind: "summary", id: 0, summary } : null,
  );
  const [saving, setSaving] = useState(false);
  const [refocus, setRefocus] = useState<{ trackId: string } | null>(null);
  const statusIds = useRef(0);
  const undoRef = useRef<HTMLButtonElement>(null);
  const saves = useRef<Promise<unknown>>(Promise.resolve());

  const playlists = useMemo(
    () =>
      Object.entries(library.categories).map(([id, c]) => ({
        id,
        name: c.name,
      })),
    [library.categories],
  );
  const members = useMemo(
    () => categoryMembers(assignments, threshold),
    [assignments, threshold],
  );
  const entries: IndexEntry[] = playlists.map((p) => ({
    ...p,
    count: members.get(p.id)?.size ?? 0,
  }));
  // On a wide screen one playlist is always showing; on a phone none may be open.
  const current = wide ? (picked ?? playlists[0]?.id ?? null) : picked;
  const nameOf = (id: string) => playlists.find((p) => p.id === id)?.name ?? "";

  const songs: Song[] = Array.from((current && members.get(current)) || []).map(
    (id) => {
      const track = library.tracks[id];
      return {
        id,
        title: track?.title ?? "Unknown track",
        artist: (track && library.artists[track.artist_id]?.name) ?? "",
      };
    },
  );

  // A phone opens playlists in place; closing the one above would otherwise
  // throw the tapped row off screen.
  useEffect(() => {
    if (wide || !current) return;
    document
      .querySelector(`[data-playlist="${CSS.escape(current)}"]`)
      ?.scrollIntoView?.({
        block: "start",
        behavior: reduced ? "auto" : "smooth",
      });
  }, [wide, current, reduced]);

  // After the render that removed the control holding focus (Undo, or a row
  // that moved away and came back), focus the song if it is in the open list.
  useEffect(() => {
    if (!refocus) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    document
      .querySelector<HTMLElement>(
        `[data-track="${CSS.escape(refocus.trackId)}"]`,
      )
      ?.focus();
  }, [refocus]);

  const nextStatus = (body: StatusBody): Status =>
    ({ ...body, id: ++statusIds.current }) as Status;
  const line =
    threshold !== saved && !(status && status.id > sliderAt) ? UNSAVED : status;

  // PATCH /api/cache rewrites the whole file, so two saves in flight can undo
  // each other on disk. One at a time, in the order they were made.
  function save(body: unknown): Promise<boolean> {
    const next = saves.current.then(() => saveToCache(body));
    saves.current = next;
    return next;
  }

  function tune(value: number) {
    setThreshold(value);
    setSliderAt(++statusIds.current);
  }

  function pick(id: string) {
    setPicked(!wide && picked === id ? null : id);
  }

  async function move(trackId: string, from: string, to: string) {
    const previous = assignments[trackId];
    if (!previous) return;
    const next = pin(previous, to, new Date().toISOString());
    const title = library.tracks[trackId]?.title ?? "Unknown track";
    setAssignments((a) => ({ ...a, [trackId]: next }));
    setStatus(
      nextStatus({
        kind: "moved",
        text: moveMessage(
          title,
          nameOf(to),
          otherPlaylistsLeft(previous, threshold, from, to),
        ),
        trackId,
        title,
        previous,
        next,
      }),
    );
    if (await save({ assignments: { [trackId]: next } })) return;
    setAssignments((a) =>
      a[trackId] === next ? { ...a, [trackId]: previous } : a,
    );
    setStatus(nextStatus({ kind: "error", text: "Couldn't save that move." }));
    setRefocus({ trackId });
  }

  async function undo(moved: Moved) {
    const { trackId, previous, next, title } = moved;
    setAssignments((a) => ({ ...a, [trackId]: previous }));
    setStatus(nextStatus({ kind: "note", text: `‘${title}’ is back.` }));
    setRefocus({ trackId });
    if (await save({ assignments: { [trackId]: previous } })) return;
    setAssignments((a) =>
      a[trackId] === previous ? { ...a, [trackId]: next } : a,
    );
    setStatus(nextStatus({ kind: "error", text: "Couldn't undo that move." }));
  }

  function pickDestination(to: string) {
    if (!moving) return;
    setMoving(null);
    void move(moving.trackId, moving.fromCategoryId, to);
    // The row just left this list, so focus can't go back to it.
    requestAnimationFrame(() => undoRef.current?.focus());
  }

  function onDragEnd(e: DragEndEvent) {
    const source = dragData(e.active);
    const to = dropDestination(source, dropData(e.over));
    setDragging(null);
    setOverId(null);
    if (source && to) void move(source.trackId, source.fromCategoryId, to);
  }

  // Only the index rows are drop targets, and they carry playlist names.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${dragData(active)?.title}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${dragData(active)?.title} is over ${dropData(over)?.name}.`
        : `${dragData(active)?.title} is not over a playlist.`,
    onDragEnd: ({ active, over }) =>
      dropDestination(dragData(active), dropData(over))
        ? `${dragData(active)?.title} moved to ${dropData(over)?.name}.`
        : `${dragData(active)?.title} was put back.`,
    onDragCancel: ({ active }) => `${dragData(active)?.title} was put back.`,
  };

  async function applyToSpotify() {
    setSaving(true);
    // Only the slider: the prefix and model are /setup's to choose.
    if (await save({ config: { confidence_threshold: threshold } })) {
      setSaved(threshold);
      router.push("/apply");
      return;
    }
    setSaving(false);
    setStatus(
      nextStatus({
        kind: "error",
        text: "Couldn't save the setting. Try again.",
      }),
    );
  }

  const openSongs = (id: string) =>
    songs.length === 0 ? (
      <Empty threshold={threshold} />
    ) : (
      <SongList
        key={id}
        categoryId={id}
        songs={songs}
        label={nameOf(id)}
        pageSize={wide ? 100 : 50}
        draggable={canDrag}
        onMove={(song) =>
          setMoving({ trackId: song.id, title: song.title, fromCategoryId: id })
        }
      />
    );

  const index = (
    <PlaylistIndex
      playlists={entries}
      mode={wide ? "select" : "expand"}
      current={current}
      onPick={pick}
      open={
        !wide && current ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fade}
            className="pb-6"
          >
            {openSongs(current)}
          </motion.div>
        ) : null
      }
    />
  );

  // The song landing somewhere else needs no fly-back; a refused drop does.
  const landing =
    dragging !== null && overId !== null && overId !== dragging.fromCategoryId;

  return (
    <>
      <DndContext
        sensors={canDrag ? dragSensors : noSensors}
        collisionDetection={pointerWithin}
        accessibility={{ announcements }}
        onDragStart={(e) => setDragging(dragData(e.active) ?? null)}
        onDragOver={(e) => setOverId(dropData(e.over)?.categoryId ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
          setOverId(null);
        }}
      >
        {wide ? (
          <div className="grid grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-x-12">
            <div className="sticky top-8 -ml-2 max-h-[calc(100dvh-9rem)] self-start overflow-y-auto overscroll-contain [scrollbar-width:thin]">
              {index}
            </div>
            {current && (
              <motion.section
                key={current}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduced ? fade : { duration: 0.3, ease: EASE_OUT_EXPO }
                }
                className="min-w-0"
              >
                <h2 className="mb-6 font-[family-name:var(--font-display)] text-4xl leading-tight tracking-tight text-[var(--color-text-primary)]">
                  {nameOf(current)}
                </h2>
                {openSongs(current)}
              </motion.section>
            )}
          </div>
        ) : (
          index
        )}
        <DragOverlay
          dropAnimation={reduced || landing ? null : undefined}
          modifiers={[abovePointer]}
          style={{ width: "min(24rem, 50vw)" }}
        >
          {dragging && (
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: reduced ? 1 : 1.02 }}
              transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
              className="grid cursor-grabbing grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-baseline gap-x-4 border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-sm"
            >
              <span className="truncate text-[var(--color-text-primary)]">
                {dragging.title}
              </span>
              <span className="truncate text-[var(--color-text-secondary)]">
                {dragging.artist}
              </span>
            </motion.div>
          )}
        </DragOverlay>
      </DndContext>

      <MoveDialog
        song={moving}
        playlists={playlists}
        onPick={pickDestination}
        onClose={() => setMoving(null)}
      />

      <ActionBar
        start={
          <ConfidenceSlider
            value={threshold}
            onChange={tune}
            className="w-[calc(100vw_-_2*var(--spacing-gutter)_-_10rem)] md:w-80"
          />
        }
        status={<StatusLine status={line} onUndo={undo} undoRef={undoRef} />}
        end={
          <Button
            onClick={applyToSpotify}
            disabled={saving}
            aria-busy={saving || undefined}
          >
            Apply to Spotify
          </Button>
        }
      />
    </>
  );
}

function Empty({ threshold }: { threshold: number }) {
  return (
    <div className="px-2">
      <p className="text-[var(--color-text-secondary)]">
        Nothing lands here at {threshold}.
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
        Spotify will get an empty playlist.
      </p>
    </div>
  );
}
