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
import { useNavLock } from "@/src/components/design/NavLock";
import { EASE_OUT } from "@/src/components/design/motion";
import { AlbumArt } from "@/src/components/graphics/AlbumArt";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { effectiveTemperature } from "@/src/lib/sleeves/lexicon";
import { CutoffRuler, RULER_MIN } from "./CutoffRuler";
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
import { DESK_UP, TAB_UP, useMediaQuery } from "@/src/hooks/useMediaQuery";

/** Dragging a song needs a mouse and room for the index beside the list. */
const DRAG_UP = `(pointer: fine) and ${DESK_UP}`;

type DragData = DragSource & { title: string; artist: string };
type DropData = DropTarget & { name: string };
type Playlist = Omit<IndexEntry, "count">;

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

// Stable id, so the line doesn't fade in again on every ruler step.
const UNSAVED: Status = {
  kind: "warning",
  id: -1,
  text: "The fit isn't saved until Apply to Spotify.",
};

const dragData = (a: Active | Over | null) =>
  a?.data.current as DragData | undefined;
const dropData = (o: Over | null) => o?.data.current as DropData | undefined;

/** Largest first; a tie keeps the catalogue order. */
function bySize(
  playlists: readonly Playlist[],
  members: Map<string, Set<string>>,
): string[] {
  const size = (id: string) => members.get(id)?.size ?? 0;
  return [...playlists]
    .sort((a, b) => size(b.id) - size(a.id) || a.catalogueNo - b.catalogueNo)
    .map((p) => p.id);
}

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
 * cutoff ruler beside "Apply to Spotify". Nothing here saves the cutoff until
 * Apply: /label's blind study reads the saved value.
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
  // Desk: index and songs side by side. Below it, playlists open in place.
  const desk = useMediaQuery(DESK_UP);
  // The ruler sits in the top strip from a tablet up; a phone's strip has no
  // room beside Apply, so there it gets a second row pinned under the strip.
  const tab = useMediaQuery(TAB_UP);
  const canDrag = useMediaQuery(DRAG_UP);
  const pointer = useSensor(PointerSensor, {
    // A click on a row opens "Move to…"; only a real drag moves it.
    activationConstraint: { distance: 6 },
  });
  const dragSensors = useSensors(pointer);
  const noSensors = useSensors();

  const playlists = useMemo<Playlist[]>(
    () =>
      Object.entries(library.categories).map(([id, c], i) => ({
        id,
        name: c.name,
        catalogueNo: i + 1,
        temperature: effectiveTemperature({ id, ...c }),
      })),
    [library.categories],
  );
  const [assignments, setAssignments] = useState(library.assignments);
  const [saved, setSaved] = useState(library.config.confidence_threshold);
  const [threshold, setThreshold] = useState(saved);
  // Re-sorted by the ruler only: a move never pulls a row out from under you.
  const [order, setOrder] = useState(() =>
    bySize(playlists, categoryMembers(library.assignments, saved)),
  );
  // On a desk one playlist always shows: the largest when the page opened.
  const [first] = useState(() => order[0] ?? null);
  // The status id current when the ruler last moved: news after it outranks
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
  // Leaving while the cutoff saves would open /apply on the old one.
  useNavLock(saving);

  const members = useMemo(
    () => categoryMembers(assignments, threshold),
    [assignments, threshold],
  );
  // Bars share one scale, the most any playlist holds at the ruler's lowest
  // mark, so raising the cutoff visibly empties them.
  const scale = useMemo(() => {
    const low = categoryMembers(assignments, Math.min(RULER_MIN, saved));
    return Math.max(0, ...[...low.values()].map((s) => s.size));
  }, [assignments, saved]);
  const byId = useMemo(
    () => new Map(playlists.map((p) => [p.id, p])),
    [playlists],
  );
  const entries: IndexEntry[] = order.flatMap((id) => {
    const p = byId.get(id);
    return p ? [{ ...p, count: members.get(id)?.size ?? 0 }] : [];
  });
  const current = desk ? (picked ?? first) : picked;
  const nameOf = (id: string) => byId.get(id)?.name ?? "";

  // Below desk the open playlist's songs sit inside the index, so a re-sort
  // would carry the list you are tuning off screen: the ruler's order waits
  // until it closes.
  const held = !desk && current !== null;
  const [stale, setStale] = useState(false);
  if (stale && !held) {
    setStale(false);
    setOrder(bySize(playlists, members));
  }

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
    if (desk || !current) return;
    document
      .querySelector(`[data-playlist="${CSS.escape(current)}"]`)
      ?.scrollIntoView?.({
        block: "start",
        behavior: reduced ? "auto" : "smooth",
      });
  }, [desk, current, reduced]);

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
    if (held) setStale(true);
    else setOrder(bySize(playlists, categoryMembers(assignments, value)));
  }

  function pick(id: string) {
    setPicked(!desk && picked === id ? null : id);
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
        : `${dragData(active)?.title} is not over a category.`,
    onDragEnd: ({ active, over }) =>
      dropDestination(dragData(active), dropData(over))
        ? `${dragData(active)?.title} moved to ${dropData(over)?.name}.`
        : `${dragData(active)?.title} was put back.`,
    onDragCancel: ({ active }) => `${dragData(active)?.title} was put back.`,
  };

  async function applyToSpotify() {
    setSaving(true);
    // Only the cutoff: the prefix and model are /setup's to choose.
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

  const statusLine = (
    <StatusLine status={line} onUndo={undo} undoRef={undoRef} />
  );

  const ruler = (className: string) => (
    <CutoffRuler
      value={threshold}
      onChange={tune}
      saved={saved}
      className={className}
    />
  );

  const openSongs = (id: string) =>
    songs.length === 0 ? (
      <Empty threshold={threshold} />
    ) : (
      <SongList
        key={id}
        categoryId={id}
        songs={songs}
        label={nameOf(id)}
        pageSize={desk ? 100 : 50}
        columns={desk && songs.length > 8 ? 2 : 1}
        // In the pane the numbers align with its heading; in place, the
        // index is already outdented.
        className={desk ? "-mx-2" : undefined}
        draggable={canDrag}
        onMove={(song) =>
          setMoving({ trackId: song.id, title: song.title, fromCategoryId: id })
        }
      />
    );

  const index = (
    <PlaylistIndex
      playlists={entries}
      scale={scale}
      mode={desk ? "select" : "expand"}
      current={current}
      onPick={pick}
      open={
        !desk && current ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fade}
            className="pt-2 pb-6"
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
    // --ruler-band: the phone band's height, so the open row and focus can
    // clear it (PlaylistIndex, SongList).
    <div className="max-tab:[--ruler-band:6rem]">
      {/* A phone's strip has no room beside Apply, so the ruler and its news
          take a second row pinned under it: full width, above what they
          change, and never a bottom bar. Fixed height, so a line of news
          arriving never pushes the list. */}
      {!tab && (
        <div
          data-ruler-band
          className="paper-tooth sticky top-strip z-20 -mx-gutter mb-4 flex h-(--ruler-band) flex-col justify-center border-b border-rule-strong px-gutter tab:hidden"
        >
          {ruler("w-full")}
          <p
            role="status"
            aria-live="polite"
            className="flex min-h-11 min-w-0 items-center text-ink-2"
          >
            {statusLine}
          </p>
        </div>
      )}
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
        {desk ? (
          <div className="grid grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-x-12 xl:gap-x-16">
            {/* The index scrolls inside its own column, pinned under the strip. */}
            {/* layoutScroll: the rows' FLIP measures through this scroll. */}
            <motion.div
              layoutScroll
              className="sticky top-[calc(var(--strip-h)+var(--space-md))] -mx-2.5 max-h-[calc(100dvh-var(--strip-h)-2*var(--space-md))] self-start overflow-y-auto overscroll-contain px-px pb-1 [scrollbar-width:thin]"
            >
              {index}
            </motion.div>
            {current && (
              <motion.section
                key={current}
                aria-labelledby="open-playlist"
                initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? fade : { duration: 0.24, ease: EASE_OUT }}
                className="@container min-w-0"
              >
                <h2
                  id="open-playlist"
                  className="mb-4 border-b border-rule pb-3 font-display text-title text-ink"
                >
                  {nameOf(current)}
                </h2>
                {openSongs(current)}
              </motion.section>
            )}
          </div>
        ) : (
          // Outdented like the desk column, so the tabs align with the title.
          <div className="-mx-2.5">{index}</div>
        )}
        <DragOverlay
          dropAnimation={reduced || landing ? null : undefined}
          modifiers={[abovePointer]}
          style={{ width: "min(22rem, 50vw)" }}
        >
          {dragging && (
            <motion.div
              initial={{ scale: 1, rotate: 0 }}
              animate={{
                scale: reduced ? 1 : 1.02,
                rotate: reduced ? 0 : -1,
              }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex cursor-grabbing items-center gap-3 rounded-[3px] border border-ink bg-card px-2 py-1.5"
            >
              <AlbumArt trackId={dragging.trackId} size={32} link={false} />
              <span className="min-w-0 leading-snug">
                <span className="block truncate font-semibold text-ink">
                  {dragging.title}
                </span>
                <span className="block truncate text-ink-2">
                  {dragging.artist}
                </span>
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

      {/* The ruler grows with the strip, leaving the status line room for
          "The fit isn't saved until Apply to Spotify." from 1024px;
          narrower, a long line truncates and keeps its full text as a title. */}
      <ActionBar
        start={tab ? ruler("w-72 lg:w-80 xl:w-[32rem]") : undefined}
        status={tab ? statusLine : null}
        end={
          <Button onClick={applyToSpotify} busy={saving}>
            Apply to Spotify
          </Button>
        }
      />
    </div>
  );
}

function Empty({ threshold }: { threshold: number }) {
  return (
    <div className="px-2">
      <p className="text-ink">Nothing lands here at {threshold}.</p>
      <p className="mt-1 text-ink-2">Spotify will get an empty playlist.</p>
    </div>
  );
}
