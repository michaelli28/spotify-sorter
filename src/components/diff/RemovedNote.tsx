"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

// `added` is ignored: the scan has already saved the new tracks by the time
// /api/spotify/diff reads the cache, so it is ~always empty.
type DiffBody = { removed: string[]; removed_examples: string[] };

type Check =
  | { state: "checking" }
  | { state: "failed" }
  | { state: "done"; removed: number; examples: string[] };

export interface RemovedNoteProps {
  prefix: string;
  /** Whether Apply has made any playlist yet: before that, none keep anything. */
  applied: boolean;
}

/**
 * A footnote: the re-read of every source playlist takes ~40s, and nothing on
 * the page waits for it.
 */
export function RemovedNote({ prefix, applied }: RemovedNoteProps) {
  const { fade, reduced } = useMotionConfig();
  const live = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check>({ state: "checking" });

  useEffect(() => {
    const ctrl = new AbortController();
    // A tick late, so StrictMode's dev remount cancels the first request
    // before it is sent: aborting doesn't stop the route's Spotify reads.
    const start = setTimeout(() => {
      fetch("/api/spotify/diff", { signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as DiffBody;
        })
        .then((d) => {
          if (ctrl.signal.aborted) return;
          setCheck({
            state: "done",
            removed: d.removed.length,
            examples: d.removed_examples,
          });
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setCheck({ state: "failed" });
        });
    }, 0);
    return () => {
      clearTimeout(start);
      ctrl.abort();
    };
  }, [attempt]);

  // Checkpoint only renders after a client fetch, so a reduced-motion
  // `initial={false}` can't disagree with server HTML.
  const swap = {
    initial: reduced ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: fade,
  };

  return (
    // tabIndex -1: Try again unmounts itself, so focus waits here instead
    // of dropping to <body>. Not a control, so no ring.
    <div
      ref={live}
      tabIndex={-1}
      aria-live="polite"
      className="text-sm leading-6 outline-none"
    >
      <AnimatePresence mode="wait" initial={false}>
        {check.state === "checking" && (
          <motion.p
            key="checking"
            {...swap}
            className="text-[var(--color-text-secondary)]"
          >
            Checking Spotify for removed tracks…
          </motion.p>
        )}
        {check.state === "failed" && (
          <motion.div
            key="failed"
            {...swap}
            className="flex flex-wrap items-baseline gap-x-4"
          >
            <p className="text-[var(--color-text-secondary)]">
              Couldn’t check Spotify for removed tracks.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-1"
              onClick={() => {
                live.current?.focus();
                setCheck({ state: "checking" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </motion.div>
        )}
        {check.state === "done" && check.removed > 0 && (
          <motion.div key="done" {...swap} className="space-y-1">
            <Removed
              count={check.removed}
              examples={check.examples}
              prefix={prefix}
              applied={applied}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Removed({
  count,
  examples,
  prefix,
  applied,
}: {
  count: number;
  examples: string[];
} & RemovedNoteProps) {
  const gone = `${count.toLocaleString()} ${count === 1 ? "track is" : "tracks are"} no longer in your sources.`;
  // The route names at most five; the rest are counted, not guessed.
  const more = count - examples.length;
  return (
    <>
      {/* apply.ts only adds. It can't say a removed track was ever placed
          (unsorted, or under the threshold), only that Apply won't drop it. */}
      <p className="text-[var(--color-text-secondary)]">
        {applied
          ? `${gone} Apply never takes tracks out of your ${prefix} playlists.`
          : gone}
      </p>
      {examples.length > 0 && (
        <p className="text-[var(--color-text-secondary)]">
          {examples.map((title, i) => (
            <Fragment key={i}>
              {i > 0 && ", "}
              <span className="text-[var(--color-text-primary)]">{title}</span>
            </Fragment>
          ))}
          {more > 0 && ` and ${more.toLocaleString()} more`}.
        </p>
      )}
    </>
  );
}
