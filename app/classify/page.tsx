"use client";
import { PageShell } from "@/src/components/design/PageShell";
import { ButtonLink } from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { ProgressBar } from "@/src/components/scan/ProgressBar";
import { TuneView } from "@/src/components/classify/TuneView";
import {
  useClassifyRun,
  type ClassifyState,
  type FailReason,
} from "@/src/components/classify/useClassifyRun";

// One component owns the stream for the whole visit: every state below is a
// swap inside it, never a remount, so the paid run opens once.
export default function ClassifyPage() {
  const state = useClassifyRun();
  // Leaving mid-run abandons the stream (the server keeps going unwatched).
  useNavLock(state.phase === "running");

  switch (state.phase) {
    case "loading":
      return <PageShell>{null}</PageShell>;
    case "running":
      return <Running progress={state.progress} />;
    case "empty":
      return (
        <PageShell title="No categories yet.">
          {/* Not /review: with no categories it proposes, and pays, on load. */}
          <ButtonLink href="/" variant="ghost" className="-ml-1">
            Home
          </ButtonLink>
        </PageShell>
      );
    case "failed":
      return <Failed {...state} />;
    case "ready":
      return (
        <PageShell title="Tune the fit.">
          <TuneView library={state.library} summary={state.summary} />
        </PageShell>
      );
  }
}

function Running({
  progress,
}: Pick<Extract<ClassifyState, { phase: "running" }>, "progress">) {
  return (
    <PageShell title="Listening through your library…">
      <div className="max-w-xl">
        <ProgressBar
          value={progress?.done ?? 0}
          total={progress?.total ?? 0}
          label="Sorting"
        />
        {progress && (
          <p className="mt-3 font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]">
            {progress.done.toLocaleString("en-US")} of{" "}
            {progress.total.toLocaleString("en-US")}
          </p>
        )}
      </div>
    </PageShell>
  );
}

const FAILED: Record<FailReason, { title: string; note: string | null }> = {
  unreadable: { title: "Couldn't read your library.", note: null },
  // Each batch is written to the cache as it finishes.
  stopped: {
    title: "Sorting stopped.",
    note: "Tracks sorted before it stopped are saved.",
  },
  // The server keeps a run going after the browser drops off.
  disconnected: {
    title: "Lost the connection.",
    note: "Claude may still be sorting on the server. Tracks it finishes are saved.",
  },
};

// No in-place retry: it would re-bill without the cost preview on /review.
function Failed({
  reason,
  message,
  canReview,
}: Extract<ClassifyState, { phase: "failed" }>) {
  const { title, note } = FAILED[reason];
  return (
    <PageShell title={title}>
      {(message || note) && (
        <div className="max-w-xl space-y-2">
          {message && (
            <p className="text-[var(--color-text-secondary)]">{message}</p>
          )}
          {note && (
            <p className="text-sm text-[var(--color-text-tertiary)]">{note}</p>
          )}
        </div>
      )}
      <div className="-ml-1 mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        {canReview && (
          <ButtonLink href="/review">Back to categories</ButtonLink>
        )}
        <ButtonLink href="/" variant={canReview ? "ghost" : "primary"}>
          Home
        </ButtonLink>
      </div>
    </PageShell>
  );
}
