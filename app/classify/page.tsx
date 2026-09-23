"use client";
import { PageShell } from "@/src/components/design/PageShell";
import { ActionBar } from "@/src/components/design/ActionBar";
import { ButtonLink } from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { ProgressBand } from "@/src/components/design/ProgressBand";
import { RunLine } from "@/src/components/classify/RunLine";
import { RunningView } from "@/src/components/classify/RunningView";
import { TuneView } from "@/src/components/classify/TuneView";
import {
  useClassifyRun,
  type ClassifyState,
  type FailReason,
} from "@/src/components/classify/useClassifyRun";

// One component owns the stream for the whole visit: every state below is a
// swap inside it, never a remount, so the paid run opens once. Each state
// prints the top strip, so it holds its room from the first render.
export default function ClassifyPage() {
  const state = useClassifyRun();
  // Leaving mid-run abandons the stream (the server keeps going unwatched).
  useNavLock(state.phase === "running");

  switch (state.phase) {
    case "loading":
      return (
        <>
          <ActionBar end={null} />
          <PageShell>{null}</PageShell>
        </>
      );
    case "running":
      return (
        <>
          {/* Nothing to press while it runs. As on /apply, the band sits
              where Apply to Spotify lands when the run ends. */}
          <ActionBar
            status={<RunLine progress={state.progress} />}
            end={
              <ProgressBand
                value={state.progress?.done ?? 0}
                total={state.progress?.total ?? 0}
                label="Sorting"
                className="w-28 tab:w-56"
              />
            }
          />
          <RunningView
            library={state.library}
            batchesDone={state.progress?.done ?? 0}
          />
        </>
      );
    case "empty":
      return (
        <>
          {/* Not /review: with no categories it proposes, and pays, on load. */}
          <ActionBar end={<ButtonLink href="/">Home</ButtonLink>} />
          <PageShell title="No categories yet.">{null}</PageShell>
        </>
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
    <>
      <ActionBar
        end={
          canReview ? (
            <ButtonLink href="/review">Back to categories</ButtonLink>
          ) : (
            <ButtonLink href="/">Home</ButtonLink>
          )
        }
      />
      <PageShell title={title}>
        {(message || note) && (
          <div className="max-w-[65ch] space-y-2">
            {message && <p className="text-lead text-ink-2">{message}</p>}
            {note && <p className="text-ink-2">{note}</p>}
          </div>
        )}
        {canReview && (
          <ButtonLink href="/" variant="ghost" className="mt-8">
            Home
          </ButtonLink>
        )}
      </PageShell>
    </>
  );
}
