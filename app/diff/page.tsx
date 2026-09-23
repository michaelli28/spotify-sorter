"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { motion } from "framer-motion";
import { ActionBar } from "@/src/components/design/ActionBar";
import { Button, ButtonLink } from "@/src/components/design/Button";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { ClassifyGate } from "@/src/components/shared/ClassifyGate";
import { RemovedNote } from "@/src/components/diff/RemovedNote";
import { WaitingTracks } from "@/src/components/diff/WaitingTracks";
import {
  readLibrary,
  type Library,
  type LibraryCache,
} from "@/src/components/diff/summary";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

type Load =
  | { state: "loading"; retrying?: true }
  | { state: "failed" }
  | { state: "mismatch" }
  | { state: "ready"; library: Library };

/** A cache written by another version: no retry will read it. */
class Mismatch extends Error {}

async function readCache(signal: AbortSignal): Promise<LibraryCache> {
  const r = await fetch("/api/cache", { signal });
  if (r.status === 409) throw new Mismatch();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as LibraryCache;
}

// The re-run checkpoint /scan lands on. The sentence and every way on come
// from the local library alone; the list of arrivals and Spotify's answer
// each arrive on their own.
export default function DiffPage() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const heading = useRef<HTMLHeadingElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    readCache(ctrl.signal)
      .then(
        (cache): Load => ({ state: "ready", library: readLibrary(cache) }),
      )
      .catch(
        (err: unknown): Load =>
          err instanceof Mismatch ? { state: "mismatch" } : { state: "failed" },
      )
      .then((next) => {
        if (!ctrl.signal.aborted) setLoad(next);
      });
    return () => ctrl.abort();
  }, [attempt]);

  // Try again goes away with the failure: focus lands on the new sentence
  // instead of dropping to <body>.
  useEffect(() => {
    if (load.state === "loading" || !refocus.current) return;
    refocus.current = false;
    heading.current?.focus();
  }, [load]);

  // No categories yet: /review proposes them.
  const uncategorised = load.state === "ready" && load.library.categories === 0;
  useEffect(() => {
    if (uncategorised) router.replace("/review");
  }, [uncategorised, router]);

  if (uncategorised) return null;

  // One strip for every state, at one place in the tree: it keeps its room
  // and never replays its entrance when the library lands.
  return (
    <main className="page-frame pt-8 pb-section">
      <ActionBar
        status={load.state === "loading" ? <Reading /> : undefined}
        end={
          <Primary
            load={load}
            onRetry={() => {
              refocus.current = true;
              setLoad({ state: "loading", retrying: true });
              setAttempt((n) => n + 1);
            }}
          />
        }
      />
      {load.state === "failed" && (
        <Title ref={heading}>Couldn’t read your library.</Title>
      )}
      {load.state === "mismatch" && (
        // The nav locks every step on a mismatch, so name the way out.
        <>
          <Title ref={heading}>Couldn’t read your library.</Title>
          <p className="mt-4 max-w-xl text-danger">
            Your library file is from another version of SpotifySorter.
          </p>
        </>
      )}
      {load.state === "ready" && (
        <Checkpoint library={load.library} headingRef={heading} />
      )}
    </main>
  );
}

/**
 * The page's one primary, in the strip. Nothing on the first read: a disabled
 * placeholder would have to guess its label. A retry keeps Try again,
 * disabled, so the strip doesn't blink.
 */
function Primary({ load, onRetry }: { load: Load; onRetry: () => void }) {
  if (load.state === "loading" && !load.retrying) return null;
  const waiting = load.state === "ready" && load.library.unsorted > 0;
  const retry = load.state === "failed" || load.state === "loading";
  return (
    // Keyed by what it does, so a new primary fades in, opacity only: a
    // transform here would trap ClassifyGate's fixed price tag.
    <FadeIn key={waiting ? "sort" : retry ? "retry" : load.state} delay={0}>
      {retry ? (
        <Button onClick={onRetry} disabled={load.state === "loading"}>
          Try again
        </Button>
      ) : load.state === "mismatch" ? (
        <ButtonLink href="/">Home</ButtonLink>
      ) : waiting ? (
        // /classify spends on load unless every track has a category.
        <ClassifyGate unsorted={load.library.unsorted} />
      ) : (
        <ButtonLink href="/classify">Tune the fit</ButtonLink>
      )}
    </FadeIn>
  );
}

function Checkpoint({
  library,
  headingRef,
}: {
  library: Library;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const headingId = useId();
  const waiting = library.unsorted > 0;
  const count = library.unsorted.toLocaleString("en-US");
  return (
    // Desktop with tracks waiting: the sentence, the ways on and the footnote
    // at the left, the slip beside them, like home's headline beside its
    // crate. The slip's column is held from the start, so its arrival moves
    // nothing at the left.
    <div
      className={clsx(
        "grid gap-y-8",
        waiting &&
          "desk:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] desk:grid-rows-[auto_auto_1fr] desk:gap-x-16",
      )}
    >
      <Title ref={headingRef} id={headingId} className="desk:row-start-1">
        {waiting
          ? `${count} new ${library.unsorted === 1 ? "track" : "tracks"} to sort.`
          : "Nothing new to sort."}
      </Title>
      <FadeIn
        delay={0.08}
        className="flex flex-wrap content-start gap-x-8 desk:col-start-1 desk:row-start-2"
      >
        <ButtonLink href="/review" variant="ghost">
          Edit categories
        </ButtonLink>
        <ButtonLink href="/scope" variant="ghost">
          Change sources
        </ButtonLink>
      </FadeIn>
      {waiting && (
        <WaitingTracks
          labelledBy={headingId}
          total={library.unsorted}
          className="tab:max-w-[32rem] desk:col-start-2 desk:row-span-3 desk:row-start-1 desk:self-start"
        />
      )}
      {/* Last in the page, below every control: Spotify answers in ~40s and
          the note grows or empties then, so nothing may sit under it. */}
      <FadeIn delay={0.16} className="desk:col-start-1 desk:row-start-3">
        <RemovedNote
          prefix={library.prefix}
          applied={library.applied}
          className="max-w-[60ch]"
        />
      </FadeIn>
    </div>
  );
}

// The page's entrance (brief §4.4): the sentence rises into place once the
// library is read. PageTransition's fade has already run by then.
// tabIndex -1: focus lands here after Try again. Not a control, so no ring.
function Title({
  ref,
  id,
  className,
  children,
}: {
  ref?: Ref<HTMLHeadingElement>;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const { reduced } = useMotionConfig();
  return (
    <motion.h1
      ref={ref}
      id={id}
      tabIndex={-1}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: DURATION.reduced }
          : { duration: DURATION.scene, ease: EASE_OUT }
      }
      className={clsx(
        "font-display text-display-2 text-balance text-ink outline-none",
        className,
      )}
    >
      {children}
    </motion.h1>
  );
}

// Opacity only: what follows the sentence, and the strip's primary.
function FadeIn({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: ReactNode;
}) {
  const { reduced } = useMotionConfig();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduced
          ? { duration: DURATION.reduced }
          : { duration: DURATION.sceneMin, delay }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

// A cache read takes ~50ms; the line only appears if this one is slow (a
// cold dev compile), so a fast read doesn't flash it.
function Reading() {
  const { fade } = useMotionConfig();
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...fade, delay: 0.4 }}
    >
      Reading your library…
    </motion.span>
  );
}
