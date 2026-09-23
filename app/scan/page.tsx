"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import {
  Button,
  ButtonLink,
  buttonClass,
} from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { ScanStages } from "@/src/components/scan/ScanStages";
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
  const { item, itemDelay, spring, pageEase } = useMotionConfig();
  // null while loading; "unknown" when /api/cache couldn't be read.
  const [library, setLibrary] = useState<Library | "unknown" | null>(null);
  // Bumped by "Scan again": the stream effect closes the old stream first.
  const [attempt, setAttempt] = useState(0);
  const [last, setLast] = useState<StageEvent | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
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

  useEffect(() => {
    const es = new EventSource("/api/spotify/scan");
    es.addEventListener("progress", (e) => {
      const event = toStageEvent(eventData(e));
      if (event) setLast(event);
    });
    es.addEventListener("done", (e) => {
      es.close();
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
    setLast(null);
    setSummary(null);
    setFailure(null);
    setAttempt((n) => n + 1);
  }

  const title = failure
    ? FAILURE[failure.kind].title
    : (summary ?? "Reading your library…");
  const titleKey = failure
    ? `failed-${attempt}`
    : summary
      ? "done"
      : `reading-${attempt}`;

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

  return (
    <PageShell
      title={
        <motion.span
          key={titleKey}
          className="block"
          // The first title arrives with the page's own fade.
          initial={titleKey === "reading-0" ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={pageEase}
        >
          {title}
        </motion.span>
      }
    >
      {failure ? (
        <motion.div
          role="alert"
          className="max-w-md space-y-8"
          variants={item}
          initial="hidden"
          animate="visible"
          transition={{ ...spring, delay: itemDelay(1) }}
        >
          {FAILURE[failure.kind].body && (
            <p className="text-lg text-[var(--color-text-secondary)]">
              {FAILURE[failure.kind].body}
            </p>
          )}
          <div className="-ml-1 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {failure.kind === "signed_out" ? (
              // A full navigation: the OAuth start is a route handler.
              <a href="/api/auth/login" className={buttonClass()}>
                Reconnect Spotify
              </a>
            ) : failure.kind === "empty" ? (
              <ButtonLink href="/scope">Change sources</ButtonLink>
            ) : (
              <>
                <Button onClick={scanAgain}>Scan again</Button>
                <ButtonLink href="/scope" variant="ghost">
                  Change sources
                </ButtonLink>
              </>
            )}
          </div>
          {failure.kind === "other" && failure.message && (
            <details className="text-sm">
              <summary className="w-fit cursor-pointer text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]">
                Details
              </summary>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--color-text-tertiary)]">
                {failure.message}
              </pre>
            </details>
          )}
        </motion.div>
      ) : (
        visible && (
          <ScanStages
            rows={stageRows({ visible, last, finished: summary !== null })}
          />
        )
      )}
    </PageShell>
  );
}
