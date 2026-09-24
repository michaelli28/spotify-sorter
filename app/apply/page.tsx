"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { ActionBar } from "@/src/components/design/ActionBar";
import {
  Button,
  ButtonLink,
  buttonClass,
} from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import {
  planApply,
  type ApplyCache,
  type ApplyPlan,
} from "@/src/components/apply/plan";
import { PrintRun } from "@/src/components/apply/PrintRun";
import { ProgressBand } from "@/src/components/design/ProgressBand";
import { CreditsFoot, CreditsHead } from "@/src/components/apply/Credits";
import { useArmed } from "@/src/components/apply/useArmed";
import { useCoverRun } from "@/src/components/apply/useCoverRun";
import { useFollowRun } from "@/src/components/apply/useFollowRun";
import { usePrintPacer } from "@/src/components/apply/usePrintPacer";
import { useRemovePlaylists } from "@/src/components/apply/useRemovePlaylists";
import { RemovePlaylistsDialog } from "@/src/components/apply/RemovePlaylistsDialog";
import {
  coverNotice,
  coverStatus,
  tallyCovers,
  type CoverNotice,
  type CoverState,
} from "@/src/components/apply/covers";
import {
  freshRows,
  printTarget,
  printedTitle,
  runStatus,
  sleeveStates,
  writtenPlaylists,
  type Progress,
  type RunView,
} from "@/src/components/apply/print-run";
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

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

function Figure({ n }: { n: number }) {
  return <span className="num text-ink">{count(n)}</span>;
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
      .
    </>
  );
}

const LEDE = "mt-4 max-w-2xl text-lead text-ink-2";

// Spec §8.1: Apply replaces what's in each playlist it already made, which
// also says nothing is added twice. The run repeats it, so the list under the
// header doesn't move when Apply is pressed.
const SYNC_LINE = (
  <p className="mt-1 max-w-2xl text-ink-2">
    Apply makes each playlist match exactly: tracks added by hand in Spotify are
    removed.
  </p>
);

// Spec §3.4: Apply also replaces each playlist's cover, so the confirmation
// names it — as an attempt: the granted scope isn't stored, and a token from
// before covers existed gets a 403.
const COVER_LINE = (
  <p className="mt-1 max-w-2xl text-ink-2">
    Each playlist&apos;s sleeve is sent as its Spotify cover. If Spotify says
    no, Reconnect Spotify and apply again.
  </p>
);

export default function ApplyPage() {
  const [library, setLibrary] = useState<Library>({ kind: "loading" });
  const [reads, setReads] = useState(0);
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [progress, setProgress] = useState<Progress | null>(null);
  // Retry covers was pressed: its notice stays up while the retry works.
  const [retrying, setRetrying] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { reduced } = useMotionConfig();
  const covers = useCoverRun();

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
  const rows = useMemo(() => plan?.rows ?? [], [plan]);
  const view: View =
    run.kind !== "idle"
      ? run.kind
      : library.kind === "failed"
        ? "cacheError"
        : plan?.rows.length === 0
          ? "empty"
          : "ready";
  const result = run.kind === "done" ? run.result : null;

  const written = useMemo(
    () => (plan && result ? writtenPlaylists(rows, result) : null),
    [plan, rows, result],
  );
  const fresh = useMemo(
    () => (plan && result ? freshRows(rows, result) : undefined),
    [plan, rows, result],
  );
  const tally = tallyCovers(
    rows.flatMap((r): CoverState[] => {
      const s = covers.states.get(r.id);
      return s ? [s] : [];
    }),
  );

  const notice = view === "done" ? coverNotice(tally, { retrying }) : null;
  const noticeKind = notice?.kind ?? null;
  // Once the covers are settled and some went on, the ones that didn't differ.
  const coversDiffer =
    view === "done" && !tally.running && tally.ok > 0 && tally.ok < tally.total;
  const armed = useArmed(view === "ready" && plan !== null);
  const follow = useFollowRun(view === "running");

  const runView: RunView =
    view === "running" || view === "error" || view === "lost" || view === "done"
      ? view
      : "ready";
  const printed = usePrintPacer(
    printTarget({ view: runView, rows: rows.length, progress }),
    reduced,
  );
  const states = sleeveStates({
    view: runView,
    rows: rows.length,
    progress,
    printed,
    written: rows.map((r) => written?.has(r.id) ?? false),
    registered: rows.map((r) => covers.states.get(r.id) === "ok"),
  });

  // Covers upload after the write, one at a time: still work, still locked.
  useNavLock(view === "running" || tally.running);

  // Spec §8.2: after a removal the page reads the library again and shows
  // what's left to write, so any credits give way to the manifest.
  const resetCovers = covers.reset;
  const afterRemoval = useCallback(() => {
    setRun({ kind: "idle" });
    setProgress(null);
    setRetrying(false);
    resetCovers();
    setReads((n) => n + 1);
  }, [resetCovers]);
  const removal = useRemovePlaylists(afterRemoval);
  // Removing writes the cache: never beside Apply's writes or a cover upload.
  const canRemove =
    plan !== null &&
    (view === "ready" ||
      view === "empty" ||
      (view === "done" && !tally.running));

  // The control that was pressed is gone after each of these swaps; the new
  // title is where a keyboard or screen-reader user picks up.
  useEffect(() => {
    if (view !== "ready" && view !== "empty" && view !== "cacheError") {
      heading.current?.focus();
    }
  }, [view]);

  // A retry that clears every failure takes Retry covers away with it: don't
  // leave keyboard focus on <body>.
  const lastNotice = useRef<CoverNotice["kind"] | null>(null);
  useEffect(() => {
    const was = lastNotice.current;
    lastNotice.current = noticeKind;
    const dropped =
      !document.activeElement || document.activeElement === document.body;
    if (was === "retrying" && noticeKind === null && dropped) {
      heading.current?.focus();
    }
  }, [noticeKind]);

  // Only ever from a click: nothing on this page writes on load. `fresh` is a
  // new run from the first playlist; Rejoin joins the one already going.
  async function start(fresh: boolean) {
    if (!plan) return;
    const current = plan;
    setRun({ kind: "running" });
    if (fresh) {
      setProgress(null);
      covers.reset();
      setRetrying(false);
    }
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
          const result = data as ApplyResult;
          setRun({ kind: "done", result });
          setRetrying(false);
          // Spec §7.1: covers only after `done`, so no upload's token refresh
          // can race Apply's cache writes. A cover failure never fails Apply.
          const ids = writtenPlaylists(current.rows, result);
          void covers.run(
            current.rows
              .filter((r) => ids.has(r.id))
              .map(({ id, spec }) => ({ id, spec })),
          );
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

  function retryCovers() {
    setRetrying(true);
    void covers.run(
      rows
        .filter((r) => covers.states.get(r.id) === "failed")
        .map(({ id, spec }) => ({ id, spec })),
    );
  }

  const home = (
    <ButtonLink href="/" variant="ghost">
      Home
    </ButtonLink>
  );
  const done = progress?.done ?? 0;
  const total = progress?.total ?? rows.length;

  let status: ReactNode = "";
  let end: ReactNode;
  let title = "";
  let body: ReactNode = null;
  let actions: ReactNode = null;
  switch (view) {
    case "ready":
      end = (
        <Button
          disabled={!plan}
          aria-disabled={(plan && !armed) || undefined}
          onClick={(e) => {
            // detail 2+: the rest of a double click. Keyboard presses are 0.
            if (!armed || e.detail > 1) return;
            void start(true);
          }}
        >
          Apply
        </Button>
      );
      title = "What Apply writes";
      body = (
        <motion.div
          initial={false}
          animate={{ opacity: plan ? 1 : 0 }}
          transition={{ duration: reduced ? 0 : DURATION.state }}
        >
          <p className={`${LEDE} min-h-[1lh]`}>
            {plan && <Facts plan={plan} />}
          </p>
          {SYNC_LINE}
          {COVER_LINE}
        </motion.div>
      );
      // /classify starts a paid run on load while tracks are unsorted.
      actions =
        plan &&
        (plan.unsorted === 0 ? (
          <ButtonLink href="/classify" variant="ghost">
            Tune the fit
          </ButtonLink>
        ) : (
          home
        ));
      break;
    case "empty":
      // No next step this page can offer: Home is a way out, not the action.
      end = null;
      title = "Nothing to apply yet.";
      actions = home;
      break;
    case "cacheError":
      end = (
        <Button
          onClick={() => {
            setLibrary({ kind: "loading" });
            setReads((n) => n + 1);
          }}
        >
          Try again
        </Button>
      );
      title = "Couldn't read your library.";
      actions = home;
      break;
    case "running":
      status = runStatus(progress, rows);
      end = (
        <ProgressBand
          value={done}
          total={total}
          label="Playlists written"
          className="w-28 tab:w-56"
        />
      );
      title = "Placing tracks…";
      body = plan && (
        <>
          <p className={LEDE}>
            <Facts plan={plan} />
          </p>
          {SYNC_LINE}
          {/* In the cover line's place: the browser uploads the covers
              after `done`, so a closed tab gets none. */}
          <p className="mt-1 max-w-2xl text-ink-2">
            Keep this page open: covers are sent after the last playlist.
          </p>
        </>
      );
      break;
    case "error":
      end = <Button onClick={() => start(true)}>Try again</Button>;
      // Once the stream said where it was, the stopped row shows it: "0 of 41".
      title = progress ? printedTitle(done, total) : "Couldn't start.";
      body = (
        <>
          <p className={LEDE}>{run.kind === "error" && run.message}</p>
          {done > 0 && (
            <p className="mt-1 max-w-2xl text-ink-2">
              What&apos;s written stays. Trying again picks up from there.
            </p>
          )}
        </>
      );
      actions = home;
      break;
    case "lost":
      // Not "Reconnect": on this page that's the Spotify sign-in, for covers.
      end = <Button onClick={() => start(false)}>Rejoin the write</Button>;
      title = "Lost the connection.";
      // Two lines, like the run's, so the list doesn't jump when it drops.
      body = (
        <>
          <p className={LEDE}>
            {done > 0 && <span>{printedTitle(done, total)} </span>}
            <span>The write may still be running.</span>
          </p>
          <p className="mt-1 max-w-2xl text-ink-2">Nothing is added twice.</p>
        </>
      );
      actions = home;
      break;
    case "done":
      status = coverStatus(tally);
      end = (
        <a href="spotify:" data-variant="primary" className={buttonClass()}>
          Open Spotify
        </a>
      );
      break;
  }

  const enter = reduced
    ? { duration: DURATION.reduced }
    : { duration: DURATION.state, ease: EASE_OUT };

  return (
    <PageShell>
      <ActionBar status={status} end={end} />

      {view === "done" && result ? (
        <CreditsHead
          result={result}
          tracks={plan?.tracks ?? result.tracks_added}
          notice={notice}
          onRetryCovers={retryCovers}
          headingRef={heading}
          busy={tally.running}
        />
      ) : (
        <motion.header
          key={view}
          initial={
            view === "ready" ? false : { opacity: 0, y: reduced ? 0 : 8 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={enter}
        >
          <h1
            ref={heading}
            tabIndex={-1}
            className="font-display text-display-2 text-ink outline-none"
          >
            {title}
          </h1>
          {body}
          {/* Holds its row while empty, so the list doesn't move on Apply.
              Not on phones: the titles wrap differently there anyway. */}
          <div className="mt-4 flex min-h-11 flex-wrap items-center gap-x-8 max-tab:empty:hidden">
            {actions}
          </div>
        </motion.header>
      )}

      {rows.length > 0 && (
        <PrintRun
          rows={rows}
          states={states}
          playlists={written ?? undefined}
          fresh={fresh}
          speak={
            view === "running" || view === "error" || view === "lost"
              ? "run"
              : coversDiffer
                ? "covers"
                : undefined
          }
          follow={follow}
          className="mt-12"
        />
      )}

      {/* One foot for every view, so the button keeps its place (and focus
          comes back to it) when a removal turns the credits into the manifest. */}
      {((view === "done" && plan) || canRemove) && (
        <footer className="mt-section border-t border-rule pt-6">
          {view === "done" && plan && <CreditsFoot prefix={plan.prefix} />}
          {canRemove && (
            <Button variant="danger" onClick={removal.open}>
              Remove SpotifySorter playlists…
            </Button>
          )}
        </footer>
      )}
      <RemovePlaylistsDialog removal={removal} prefix={plan?.prefix ?? ""} />
    </PageShell>
  );
}
