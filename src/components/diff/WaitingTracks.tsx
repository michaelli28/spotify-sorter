"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { TrackRow } from "@/src/components/design/TrackRow";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { AlbumArt } from "@/src/components/graphics/AlbumArt";
import type {
  UnsortedList,
  WaitingTrack,
} from "@/src/components/diff/summary";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

// The slip prints the newest few; the route lists newest scan first.
const SHOWN = 8;

type List =
  | { state: "loading" }
  | { state: "failed"; retrying?: true }
  | { state: "ready"; tracks: WaitingTrack[] };

export interface WaitingTracksProps {
  /** Id of the heading that names the list: the page's sentence. */
  labelledBy: string;
  /** Every unsorted track, including the ones not listed. */
  total: number;
  className?: string;
}

/**
 * The delivery note, read from the list route on its own, like RemovedNote:
 * it is a sample of what waits, so a list that fails or hangs never holds up
 * the way forward. The route leaves out the labelling sample's songs.
 */
export function WaitingTracks({
  labelledBy,
  total,
  className,
}: WaitingTracksProps) {
  const slot = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<List>({ state: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/library/unsorted?limit=${SHOWN}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as UnsortedList;
      })
      .then((d): List => ({ state: "ready", tracks: d.tracks }))
      .catch((): List => ({ state: "failed" }))
      .then((next) => {
        if (!ctrl.signal.aborted) setList(next);
      });
    return () => ctrl.abort();
  }, [attempt]);

  const newest = list.state === "ready" ? list.tracks.slice(0, SHOWN) : [];

  return (
    // tabIndex -1: Try again unmounts itself once the list lands, so focus
    // waits here instead of dropping to <body>. Not a control, so no ring.
    // Empty while the list loads, and then it takes no room.
    <div
      ref={slot}
      tabIndex={-1}
      className={clsx("outline-none empty:hidden", className)}
    >
      {list.state === "failed" && (
        <div className="flex flex-wrap items-baseline gap-x-4 text-ink-2">
          <p>Couldn’t list the new tracks.</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={list.retrying}
            onClick={() => {
              slot.current?.focus();
              setList({ state: "failed", retrying: true });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {/* Every waiting song can be in the labelling sample: then no slip. */}
      {newest.length > 0 && (
        <Slip
          labelledBy={labelledBy}
          tracks={newest}
          more={total - newest.length}
        />
      )}
    </div>
  );
}

/**
 * Card stock, ruled like a slip. No index column: these are a sample of the
 * unsorted tracks, not a running order, so a number would claim a position
 * they don't have.
 */
function Slip({
  labelledBy,
  tracks,
  more,
}: {
  labelledBy: string;
  tracks: WaitingTrack[];
  more: number;
}) {
  const { reduced } = useMotionConfig();
  return (
    // Handed over the counter: it lands from a slight tilt, just after the
    // sentence. Opacity only when reduced.
    <motion.div
      initial={{ opacity: 0, y: 16, rotate: -0.8 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={
        reduced
          ? { duration: DURATION.reduced }
          : { duration: DURATION.scene, ease: EASE_OUT, delay: 0.08 }
      }
      className={clsx(
        "origin-bottom-left rounded-[3px] border border-rule-strong bg-card",
        // Phones: the slip runs edge to edge, like the review bin.
        "max-tab:-mx-gutter max-tab:rounded-none max-tab:border-x-0",
      )}
    >
      {/* TrackRow sets py-1; the list's child selector outranks it. */}
      <ol
        aria-labelledby={labelledBy}
        className="px-panel py-1 [&>li]:py-2.5 [&>li+li]:border-t [&>li+li]:border-rule"
      >
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            title={t.title}
            artist={t.artist}
            href={`spotify:track:${t.id}`}
            media={<AlbumArt trackId={t.id} size={44} link={false} />}
          />
        ))}
      </ol>
      {/* The slip is torn off after the newest few: a perforation, then what
          it doesn't print. */}
      {more > 0 && (
        <p className="border-t border-dashed border-rule-strong px-panel py-3.5 text-ink-2">
          and {more.toLocaleString("en-US")} more
        </p>
      )}
    </motion.div>
  );
}
