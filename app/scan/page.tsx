"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, type Transition } from "framer-motion";
import clsx from "clsx";
import { PageShell } from "@/src/components/design/PageShell";
import { ActionBar } from "@/src/components/design/ActionBar";
import {
  Button,
  ButtonLink,
  buttonClass,
} from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { PlaylistsRead } from "@/src/components/scan/PlaylistsRead";
import { ScanCrate } from "@/src/components/scan/ScanCrate";
import { READING, ScanStages } from "@/src/components/scan/ScanStages";
import {
  EMPTY_CRATE,
  crateAfter,
  crateFull,
  type CrateFill,
} from "@/src/components/scan/crate-fill";
import {
  STAGES,
  stageRows,
  type StageEvent,
  type StageId,
} from "@/src/components/scan/stages";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { ScanResult } from "@/src/lib/pipeline/scan";
import { scanErrorKind, type ScanErrorKind } from "@/src/lib/scan/error-kind";

// Reading time for the result before the page moves on. Not an animation, so
// reduced motion keeps it.
const RESULT_MS = 900;

interface Library {
  playlists: number;
  liked: boolean;
  rerun: boolean;
}

interface Failure {
  kind: ScanErrorKind;
  message: string | null;
}

const FAILURE: Record<ScanErrorKind, { title: string; body?: string }> = {
  rate_limited: {
    title: "Spotify asked us to slow down.",
    body: "Give it a minute.",
  },
  signed_out: { title: "Spotify signed you out." },
  empty: {
    title: "Nothing to read.",
    body: "The sources you picked hold no tracks.",
  },
  other: { title: "The scan stopped." },
};

function toLibrary(body: unknown): Library | null {
  const cache = body as {
    scope?: { included_playlist_ids?: unknown; include_liked_songs?: unknown };
    runs?: unknown;
  } | null;
  const ids = cache?.scope?.included_playlist_ids;
  if (!Array.isArray(ids) || !Array.isArray(cache?.runs)) return null;
  return {
    playlists: ids.length,
    liked: cache.scope?.include_liked_songs === true,
    rerun: cache.runs.length > 0,
  };
}

function eventData(e: Event): unknown {
  if (!(e instanceof MessageEvent) || typeof e.data !== "string") return null;
  try {
    return JSON.parse(e.data);
  } catch {
    return null;
  }
}

function toStageEvent(data: unknown): StageEvent | null {
  const event = data as Partial<StageEvent> | null;
  return event &&
    STAGES.includes(event.stage as StageId) &&
    typeof event.current === "number" &&
    typeof event.total === "number"
    ? (event as StageEvent)
    : null;
}

const count = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function summarize(data: unknown): string {
  const done = data as Partial<ScanResult> | null;
  return typeof done?.unique_tracks === "number" &&
    typeof done.unique_artists === "number"
    ? `${count(done.unique_tracks, "track")} from ${count(done.unique_artists, "artist")}.`
    : "Your library is read.";
}

export default function ScanPage() {
  const router = useRouter();
  const { reduced, fade } = useMotionConfig();
  // null while loading; "unknown" when /api/cache couldn't be read.
  const [library, setLibrary] = useState<Library | "unknown" | null>(null);
  // Bumped by "Scan again": the stream effect closes the old stream first.
  const [attempt, setAttempt] = useState(0);
  const [last, setLast] = useState<StageEvent | null>(null);
  const [crate, setCrate] = useState<CrateFill>(EMPTY_CRATE);
  const [summary, setSummary] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reading = !summary && !failure;
  useNavLock(reading);

  useEffect(() => {
    let live = true;
    fetch("/api/cache")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (live) setLibrary(toLibrary(body) ?? "unknown");
      })
      .catch(() => {
        if (live) setLibrary("unknown");
      });
    return () => {
      live = false;
    };
  }, []);

  // One stream per attempt. The cleanup closes it, so leaving the page (or
  // StrictMode's rerun) never leaves a second library read open.
  useEffect(() => {
    const es = new EventSource("/api/spotify/scan");
    es.addEventListener("progress", (e) => {
      const event = toStageEvent(eventData(e));
      if (!event) return;
      setLast(event);
      setCrate((c) => crateAfter(c, event));
    });
    es.addEventListener("done", (e) => {
      es.close();
      setCrate(crateFull);
      setSummary(summarize(eventData(e)));
    });
    es.addEventListener("error", (e) => {
      // Close first: EventSource reconnects by itself, and a reconnect is a
      // second full library read.
      es.close();
      const message = (eventData(e) as { message?: unknown } | null)?.message;
      const text = typeof message === "string" ? message : null;
      setFailure({ kind: scanErrorKind(text), message: text });
    });
    return () => es.close();
  }, [attempt]);

  useEffect(() => {
    if (!summary || library === null) return;
    // /diff sends first runs and category-less libraries on to /review itself.
    const next = library !== "unknown" && !library.rerun ? "/review" : "/diff";
    // replace: Back from the next page must not land here and scan again.
    const timer = setTimeout(() => router.replace(next), RESULT_MS);
    return () => clearTimeout(timer);
  }, [summary, library, router]);

  function scanAgain() {
    // The button leaves with the failure: keep focus on the page, not <body>.
    heading.current?.focus();
    setLast(null);
    setCrate(EMPTY_CRATE);
    setSummary(null);
    setFailure(null);
    setAttempt((n) => n + 1);
  }

  const counting = !failure && crate.done > 0;
  const phase = failure
    ? "failed"
    : summary
      ? "done"
      : counting
        ? "counting"
        : "reading";
  const titleKey = phase === "done" ? phase : `${phase}-${attempt}`;
  const title = failure ? (
    FAILURE[failure.kind].title
  ) : summary ? (
    summary
  ) : counting ? (
    <PlaylistsRead done={crate.done} total={crate.total} />
  ) : (
    "Reading your library…"
  );
  const enter: Transition = reduced
    ? { duration: DURATION.reduced }
    : { duration: DURATION.sceneMin, ease: EASE_OUT };

  const visible =
    library === null
      ? null
      : library === "unknown"
        ? (["playlists", "artists"] as const)
        : STAGES.filter(
            (id) =>
              (id !== "playlists" || library.playlists > 0) &&
              (id !== "liked" || library.liked),
          );
  const rows = visible
    ? stageRows({ visible, last, finished: summary !== null })
    : null;
  const active = reading ? rows?.find((row) => row.state === "active") : null;

  // The strip's primary is the way on from a failure, as on every page that
  // fails; while it reads there is nothing to press (spec §7.8).
  const end = !failure ? null : failure.kind === "signed_out" ? (
    // A full navigation: the OAuth start is a route handler.
    <a href="/api/auth/login" data-variant="primary" className={buttonClass()}>
      Reconnect Spotify
    </a>
  ) : failure.kind === "empty" ? (
    <ButtonLink href="/scope">Change sources</ButtonLink>
  ) : (
    <Button onClick={scanAgain}>Scan again</Button>
  );
  const offersRescan =
    failure?.kind === "rate_limited" || failure?.kind === "other";

  return (
    <PageShell>
      {/* The title carries the playlists count; the strip names the stage. */}
      <ActionBar
        status={active ? READING[active.id] : ""}
        end={
          end && (
            <motion.span
              key={`${failure?.kind}-${attempt}`}
              className="block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fade}
            >
              {end}
            </motion.span>
          )
        }
      />
      {/* Clips the record sliding in from the right at the page edge. */}
      <div className="-mx-gutter overflow-x-clip px-gutter">
        {/* Desktop: the title, then the steps or the failure, beside the
            crate. Phones: the crate between the title and the steps. */}
        <div className="grid gap-y-8 desk:grid-cols-[minmax(0,1fr)_minmax(0,27.5rem)] desk:grid-rows-[auto_1fr] desk:gap-x-16 desk:gap-y-12">
          {/* Two lines held while reading, so nothing jumps when the count
              starts. tabIndex -1: focus lands here after Scan again. */}
          <h1
            ref={heading}
            tabIndex={-1}
            className={clsx(
              "font-display text-display-2 text-balance text-ink outline-none desk:col-start-1 desk:row-start-1",
              reading && "min-h-[2lh]",
            )}
          >
            <motion.span
              key={titleKey}
              className="block"
              // The first title arrives with the page's own fade.
              initial={
                titleKey === "reading-0"
                  ? false
                  : reduced
                    ? { opacity: 0 }
                    : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={enter}
            >
              {title}
            </motion.span>
          </h1>

          {failure ? (
            <motion.div
              role="alert"
              className="max-w-md desk:col-start-1 desk:row-start-2"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enter, delay: reduced ? 0 : 0.08 }}
            >
              {/* The alert is what gets announced: it names the reason too. */}
              <p className="sr-only">{FAILURE[failure.kind].title}</p>
              {FAILURE[failure.kind].body && (
                <p className="mb-6 text-lead text-ink-2">
                  {FAILURE[failure.kind].body}
                </p>
              )}
              {/* Scanning again is the strip's; the quiet way elsewhere stays. */}
              {offersRescan && (
                <ButtonLink href="/scope" variant="ghost">
                  Change sources
                </ButtonLink>
              )}
              {failure.kind === "other" && failure.message && (
                <details className="mt-6">
                  <summary className="w-fit cursor-pointer py-2.5 text-ink-3 transition-colors duration-180 ease-out hover:text-ink-2">
                    Details
                  </summary>
                  <pre className="mono mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-ink-3">
                    {failure.message}
                  </pre>
                </details>
              )}
            </motion.div>
          ) : (
            <>
              {rows && (
                <div className="max-w-md max-desk:order-1 desk:col-start-1 desk:row-start-2">
                  <ScanStages rows={rows} />
                </div>
              )}
              {/* Nothing is saved until a scan finishes, and an emptied crate
                  would read as an empty library: a failure shows none. */}
              <ScanCrate
                key={attempt}
                fill={crate}
                counting={counting}
                className="mx-auto max-w-72 tab:mx-0 tab:max-w-80 desk:col-start-2 desk:row-span-2 desk:row-start-1 desk:max-w-[27.5rem]"
              />
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
