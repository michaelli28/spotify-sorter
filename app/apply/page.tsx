"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button, ButtonLink } from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { ProgressBar } from "@/src/components/scan/ProgressBar";
import {
  ApplyManifest,
  type RowState,
} from "@/src/components/apply/ApplyManifest";
import { SuccessCredits } from "@/src/components/apply/SuccessCredits";
import {
  planApply,
  type ApplyCache,
  type ApplyPlan,
} from "@/src/components/apply/plan";
import { readEventStream } from "@/src/lib/client/read-event-stream";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { ApplyResult } from "@/src/lib/pipeline/apply";

type Library =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; plan: ApplyPlan };

type Run =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string }
  | { kind: "lost" }
  | { kind: "done"; result: ApplyResult };

// "ready" also covers loading: same header, Apply disabled until the plan lands.
type View = "ready" | "empty" | "cacheError" | Exclude<Run["kind"], "idle">;

/** `done` playlists are written; the server is on index `done` next. */
interface Progress {
  done: number;
  total: number;
}

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

function rowStates(
  view: View,
  rows: number,
  progress: Progress | null,
): RowState[] {
  return Array.from({ length: rows }, (_, i) => {
    if (view === "ready") return "idle";
    const done = progress?.done ?? 0;
    if (i < done) return "written";
    if (progress && i === done) {
      if (view === "running") return "current";
      if (view === "error") return "failed";
    }
    return "pending";
  });
}

function Figure({ n }: { n: number }) {
  return (
    <span className="tabular-nums text-[var(--color-text-primary)]">
      {count(n)}
    </span>
  );
}

function Facts({ plan: { tracks, toCreate, toUpdate } }: { plan: ApplyPlan }) {
  return (
    <>
      <Figure n={tracks} /> {plural(tracks, "track")} into{" "}
      {toCreate > 0 && (
        <>
          <Figure n={toCreate} /> new private {plural(toCreate, "playlist")}
        </>
      )}
      {toCreate > 0 && toUpdate > 0 && " and "}
      {toUpdate > 0 && (
        <>
          <Figure n={toUpdate} />{" "}
          {toCreate === 0 && `${plural(toUpdate, "playlist")} `}you already have
        </>
      )}
      .{toUpdate > 0 && " Nothing is added twice."}
    </>
  );
}

export default function ApplyPage() {
  const [library, setLibrary] = useState<Library>({ kind: "loading" });
  const [reads, setReads] = useState(0);
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [progress, setProgress] = useState<Progress | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { pageEase, fade } = useMotionConfig();

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/cache");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const plan = planApply((await res.json()) as ApplyCache);
        if (live) setLibrary({ kind: "ready", plan });
      } catch {
        if (live) setLibrary({ kind: "failed" });
      }
    })();
    return () => {
      live = false;
    };
  }, [reads]);

  const plan = library.kind === "ready" ? library.plan : null;
  const view: View =
    run.kind !== "idle"
      ? run.kind
      : library.kind === "failed"
        ? "cacheError"
        : plan?.rows.length === 0
          ? "empty"
          : "ready";

  useNavLock(view === "running");

  // The control that was pressed is gone after each of these swaps; the new
  // title is where a keyboard or screen-reader user picks up.
  useEffect(() => {
    if (view !== "ready" && view !== "empty" && view !== "cacheError") {
      heading.current?.focus();
    }
  }, [view]);

  // Only ever from a click: nothing on this page writes on load.
  async function start() {
    setRun({ kind: "running" });
    setProgress(null);
    let res: Response;
    try {
      res = await fetch("/api/spotify/apply", { method: "POST" });
    } catch (err) {
      setRun({ kind: "error", message: messageOf(err) });
      return;
    }
    let settled = false;
    try {
      await readEventStream(res, (event, data) => {
        if (event === "progress") {
          const { done, total } = data as Progress;
          setProgress({ done, total });
        } else if (event === "done") {
          settled = true;
          setRun({ kind: "done", result: data as ApplyResult });
        } else if (event === "error") {
          settled = true;
          const { message } = data as { message?: string };
          setRun({ kind: "error", message: message ?? "Unknown error" });
        }
      });
    } catch (err) {
      // A refused request never started. A stream that broke mid-way is a
      // lost connection: the server job keeps writing without us.
      if (!res.ok) {
        setRun({ kind: "error", message: messageOf(err) });
        return;
      }
    }
    if (!settled) setRun({ kind: "lost" });
  }

  if (view === "done") {
    return (
      <PageShell>
        {run.kind === "done" && (
          <SuccessCredits
            result={run.result}
            prefix={plan?.prefix ?? ""}
            tracks={plan?.tracks ?? run.result.tracks_added}
            headingRef={heading}
          />
        )}
      </PageShell>
    );
  }

  const home = (
    <ButtonLink href="/" variant="ghost">
      Home
    </ButtonLink>
  );
  const retry = (label: string) => <Button onClick={start}>{label}</Button>;
  const written = progress?.done ?? 0;

  let title: string;
  let body: ReactNode = null;
  let actions: ReactNode = null;
  switch (view) {
    case "ready":
      title = "About to apply.";
      body = (
        <p className="mt-6 min-h-[1lh] max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
          {plan && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fade}
            >
              <Facts plan={plan} />
            </motion.span>
          )}
        </p>
      );
      actions = (
        <>
          <Button onClick={start} disabled={!plan}>
            Apply
          </Button>
          {/* /classify starts a paid run on load while tracks are unsorted. */}
          {plan &&
            (plan.unsorted === 0 ? (
              <ButtonLink href="/classify" variant="ghost">
                Tune the fit
              </ButtonLink>
            ) : (
              home
            ))}
        </>
      );
      break;
    case "empty":
      title = "Nothing to apply yet.";
      actions = home;
      break;
    case "cacheError":
      title = "Couldn't read your library.";
      actions = (
        <>
          <Button
            onClick={() => {
              setLibrary({ kind: "loading" });
              setReads((n) => n + 1);
            }}
          >
            Try again
          </Button>
          {home}
        </>
      );
      break;
    case "running":
      title = "Placing tracks…";
      break;
    case "error":
      title =
        written > 0 && progress
          ? `Stopped at ${count(written)} of ${count(progress.total)}.`
          : "Couldn't start.";
      body = (
        <>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {run.kind === "error" && run.message}
          </p>
          {written > 0 && (
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-tertiary)]">
              What&apos;s written stays. Trying again picks up from there.
            </p>
          )}
        </>
      );
      actions = (
        <>
          {retry("Try again")}
          {home}
        </>
      );
      break;
    case "lost":
      title = "Lost the connection.";
      body = (
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
          The write may still be running.
        </p>
      );
      actions = (
        <>
          {retry("Reconnect")}
          {home}
        </>
      );
      break;
  }

  const current =
    progress && progress.done < progress.total
      ? plan?.rows[progress.done]
      : undefined;

  return (
    <PageShell>
      <motion.header
        key={view}
        initial={view === "ready" ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={pageEase}
      >
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-[family-name:var(--font-display)] text-display-2 tracking-tight text-[var(--color-text-primary)] outline-none"
        >
          {title}
        </h1>
        {body}
        {actions && (
          <div className="-ml-1 mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            {actions}
          </div>
        )}
      </motion.header>

      {/* Sits where the facts and actions were, so the list below doesn't
          move when Apply is pressed; the bottom margin stays out of the
          stuck band. */}
      {view === "running" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fade}
          className="sticky top-0 z-10 -mx-gutter mb-[calc(3rem_+_var(--spacing-section))] mt-3 bg-[var(--color-bg-base)] px-gutter pb-4 pt-3"
        >
          <p
            role="status"
            className="min-h-[1lh] text-lg leading-relaxed text-[var(--color-text-secondary)]"
          >
            {progress ? (
              <>
                <Figure n={Math.min(progress.done + 1, progress.total)} /> of{" "}
                <Figure n={progress.total} />
                {current && ` · ${current.name}`}
              </>
            ) : (
              "Starting…"
            )}
          </p>
          <div className="mt-4">
            <ProgressBar
              value={written}
              total={progress?.total ?? 0}
              label="Playlists written"
            />
          </div>
        </motion.div>
      )}

      {plan && plan.rows.length > 0 && (
        <ApplyManifest
          rows={plan.rows}
          states={rowStates(view, plan.rows.length, progress)}
          className="mt-section"
        />
      )}
    </PageShell>
  );
}
