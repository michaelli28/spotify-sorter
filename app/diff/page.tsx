"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button, ButtonLink } from "@/src/components/design/Button";
import { ClassifyGate } from "@/src/components/shared/ClassifyGate";
import { RemovedNote } from "@/src/components/diff/RemovedNote";
import { WaitingTracks } from "@/src/components/diff/WaitingTracks";
import {
  summariseLibrary,
  type LibraryCache,
  type LibrarySummary,
} from "@/src/components/diff/summary";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

const WAITING = "Waiting to be sorted.";

type Load =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "mismatch" }
  | { state: "ready"; library: LibrarySummary };

// The re-run checkpoint /scan lands on. Everything here is decided by the
// cache alone; Spotify's answer arrives later as a footnote.
export default function DiffPage() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/cache", { signal: ctrl.signal })
      .then(async (r): Promise<Load> => {
        // Written by another version: no retry will read it.
        if (r.status === 409) return { state: "mismatch" };
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const library = summariseLibrary((await r.json()) as LibraryCache);
        return { state: "ready", library };
      })
      .then((next) => {
        if (!ctrl.signal.aborted) setLoad(next);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoad({ state: "failed" });
      });
    return () => ctrl.abort();
  }, [attempt]);

  // No categories yet: /review proposes them.
  const uncategorised = load.state === "ready" && load.library.categories === 0;
  useEffect(() => {
    if (uncategorised) router.replace("/review");
  }, [uncategorised, router]);

  if (uncategorised) return null;

  if (load.state === "loading") {
    return (
      <PageShell>
        <Reading />
      </PageShell>
    );
  }

  if (load.state === "failed") {
    return (
      <PageShell title="Couldn't read your library.">
        <Button
          className="-ml-1"
          onClick={() => {
            setLoad({ state: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </PageShell>
    );
  }

  if (load.state === "mismatch") {
    // The nav locks every step on a mismatch, so name the way out.
    return (
      <PageShell title="Couldn't read your library.">
        <p className="max-w-xl text-[var(--color-danger)]">
          Your library file is from another version of SpotifySorter.
        </p>
        <ButtonLink href="/" className="-ml-1 mt-8">
          Home
        </ButtonLink>
      </PageShell>
    );
  }

  return <Checkpoint library={load.library} />;
}

function Checkpoint({ library }: { library: LibrarySummary }) {
  const { item, spring, itemDelay } = useMotionConfig();
  const waiting = library.unsorted > 0;
  return (
    <PageShell title={waiting ? WAITING : "Nothing new to sort."}>
      <div className="max-w-xl">
        {waiting && (
          <motion.div
            variants={item}
            initial="hidden"
            animate="visible"
            transition={{ ...spring, delay: itemDelay(0) }}
            className="mb-10"
          >
            <WaitingTracks
              label={WAITING}
              tracks={library.newest}
              total={library.unsorted}
            />
          </motion.div>
        )}
        {/* Outside the list's transform, which would pin ClassifyGate's fixed
            dialog to this box. -ml-1 cancels the buttons' px-1, so each
            row's first label sits on the title's left edge. */}
        <div className="-ml-1 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div className="basis-full sm:basis-auto">
            {/* /classify spends on load unless every track has a category. */}
            {waiting ? (
              <ClassifyGate unsorted={library.unsorted} />
            ) : (
              <ButtonLink href="/classify">Tune the fit</ButtonLink>
            )}
          </div>
          <ButtonLink href="/review" variant="ghost">
            Edit categories
          </ButtonLink>
          <ButtonLink href="/scope" variant="ghost" size="sm">
            Change sources
          </ButtonLink>
        </div>
        <div className="mt-section">
          <RemovedNote prefix={library.prefix} applied={library.applied} />
        </div>
      </div>
    </PageShell>
  );
}

// A cache read takes ~50ms; the line only appears if this one is slow (a
// cold dev compile), so a fast read doesn't flash it.
function Reading() {
  const { fade } = useMotionConfig();
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...fade, delay: 0.4 }}
      className="text-[var(--color-text-secondary)]"
    >
      Reading your library…
    </motion.p>
  );
}
