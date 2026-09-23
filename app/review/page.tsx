"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import clsx from "clsx";
import { ActionBar } from "@/src/components/design/ActionBar";
import { Button } from "@/src/components/design/Button";
import { useNavLock } from "@/src/components/design/NavLock";
import { PageShell } from "@/src/components/design/PageShell";
import { CategoryIndex } from "@/src/components/review/CategoryIndex";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";
import { TrackSearchModal } from "@/src/components/review/TrackSearchModal";
import { useCategorySource } from "@/src/components/review/useCategorySource";
import { ThinkingIndicator } from "@/src/components/shared/ThinkingIndicator";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import {
  categoryEdits,
  describeEdits,
  duplicateNameKeys,
  nameKey,
} from "@/src/lib/categories/edits";
import type { DraftCategory } from "@/src/lib/categories/merge";
import { buildCategoriesPatch } from "@/src/lib/categories/patch-body";
import { estimateRescoreCost } from "@/src/lib/categories/rescore-cost";
import { estimateClassifyCost, estimateCostUSD } from "@/src/lib/llm/cost";

const HOME = { href: "/", label: "Home" } as const;

type Work =
  | { kind: "saving" }
  | { kind: "rescoring"; against: string }
  | { kind: "wiping" };

const tally = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function reason(err: unknown): string {
  if (err instanceof TypeError) return "The app's server didn't answer.";
  return err instanceof Error ? err.message : "Unknown error.";
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);
}

export default function ReviewPage() {
  const router = useRouter();
  const { phase, library, saved, setSaved, draft, setDraft, reload } =
    useCategorySource();
  const [asking, setAsking] = useState<"classify" | "repropose" | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragHint, setDragHint] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  // Held while Claude or a save runs. Leaving mid-propose is safe (the server
  // finishes and saves), but it shouldn't be one stray click away.
  useNavLock(phase.kind === "proposing" || work !== null);
  const { fade } = useMotionConfig();

  if (phase.kind === "loading") return <PageShell>{null}</PageShell>;
  if (phase.kind === "loadError")
    return (
      <Stalled
        title="Your categories didn't load."
        message={phase.message}
        onRetry={phase.retryable ? reload : undefined}
      />
    );
  if (phase.kind === "proposeError")
    return (
      <Stalled
        title="Claude couldn't propose categories."
        message={phase.message}
        onRetry={reload}
      />
    );
  if (phase.kind === "proposing")
    return (
      <PageShell title="Proposing categories…" back={HOME}>
        <ThinkingIndicator
          message={`Claude is reading all ${tally(library.trackCount, "track")}. Leaving this page won't stop it.`}
          estimateSeconds={Math.max(30, Math.round(library.trackCount / 30))}
          outputTokens={phase.outputTokens}
        />
      </PageShell>
    );

  const edits = categoryEdits(saved, draft);
  const placed = library.trackCount - library.unsorted;
  // Saving a new category re-scores every placed track against it
  // (/api/llm/reclassify), a paid call made before /classify opens.
  const rescoring =
    edits.added.length > 0 && saved.length > 0 && library.rescorable > 0;
  const addedNames = joinNames(edits.added.map((c) => c.name.trim()));
  const sortCost = estimateClassifyCost(library.unsorted);
  const rescoreCost = rescoring
    ? estimateRescoreCost(library.rescorable, edits.added.length)
    : { low: 0, high: 0 };
  const fullSortCost = estimateClassifyCost(library.trackCount).high;
  const proposeCost =
    estimateCostUSD({
      tracks: library.trackCount,
      categories: 0,
      phase: "propose",
    }) * 1.2;

  const dupes = duplicateNameKeys(draft);
  const clash = draft.find((c) => dupes.has(nameKey(c.name)));
  const clashCount = clash
    ? draft.filter((c) => nameKey(c.name) === nameKey(clash.name)).length
    : 0;
  const unnamed = draft.some((c) => !c.name.trim());
  const blocked = work !== null || draft.length === 0 || !!clash || unnamed;

  async function classify() {
    const snapshot = draft;
    setAsking(null);
    setProblem(null);
    setWork({ kind: "saving" });
    let newIds: string[];
    let hadCategories: boolean;
    try {
      const before = await fetch("/api/cache");
      if (!before.ok) throw new Error(`The server answered ${before.status}.`);
      const { categories } = (await before.json()) as {
        categories: Record<string, unknown>;
      };
      const previous = new Set(Object.keys(categories));
      hadCategories = previous.size > 0;
      newIds = snapshot.map((c) => c.id).filter((id) => !previous.has(id));
      await send(
        "/api/cache",
        "PATCH",
        buildCategoriesPatch(snapshot, new Date().toISOString()),
      );
    } catch (err) {
      setWork(null);
      setProblem(`Couldn't save your categories. ${reason(err)}`);
      return;
    }
    // With nothing placed the route returns before calling Claude; skip it.
    if (newIds.length > 0 && hadCategories && library.rescorable > 0) {
      const against = joinNames(
        snapshot.filter((c) => newIds.includes(c.id)).map((c) => c.name),
      );
      setWork({ kind: "rescoring", against });
      try {
        await send("/api/llm/reclassify", "POST", { newCategoryIds: newIds });
      } catch (err) {
        setSaved(snapshot);
        setWork(null);
        // "failed" leads: the bar truncates this line at phone widths.
        setProblem(
          `Re-scoring against ${against} failed; your categories are saved. ${reason(err)}`,
        );
        return;
      }
    }
    setSaved(snapshot);
    router.push("/classify");
  }

  async function wipe() {
    setAsking(null);
    setProblem(null);
    setWork({ kind: "wiping" });
    try {
      await send("/api/cache", "PATCH", {
        _clear: ["categories", "assignments"],
      });
    } catch (err) {
      setWork(null);
      setProblem(`Couldn't wipe your categories. ${reason(err)}`);
      return;
    }
    setWork(null);
    reload();
  }

  const pending = describeEdits(edits);
  const status: string | null = dragHint
    ? dragHint
    : work?.kind === "rescoring"
      ? `Claude is re-scoring your ${tally(library.rescorable, "placed track")} against ${work.against}.`
      : (problem ??
        (draft.length === 0
          ? "Add a category to classify."
          : clash
            ? `${clashCount} categories are called “${clash.name.trim()}”.`
            : unnamed
              ? "Every category needs a name."
              : pending && `Unsaved: ${pending}`));

  const adding = draft.find((c) => c.id === addingTo);

  return (
    <PageShell title={`${draft.length} categories. Edit anything.`}>
      <div
        inert={work !== null}
        className={clsx(
          "transition-opacity duration-200",
          work && "opacity-60",
        )}
      >
        <CategoryIndex
          categories={draft}
          tracks={library.tracks}
          onChange={setDraft}
          onAddTrack={setAddingTo}
          onDragHint={setDragHint}
        />
        <Button
          variant="ghost"
          size="sm"
          className="-ml-1 mt-section"
          onClick={() => setAsking("repropose")}
        >
          Re-propose
        </Button>
      </div>

      <CostPreviewModal
        open={asking === "classify"}
        estimateUsd={{
          low: sortCost.low + rescoreCost.low,
          high: sortCost.high + rescoreCost.high,
        }}
        message={classifyMessage({
          unsorted: library.unsorted,
          rescorable: rescoring ? library.rescorable : 0,
          against: addedNames,
        })}
        removing={edits.removed}
        renaming={edits.renamed}
        adding={edits.added.length}
        notes={[
          edits.removed.length > 0 && placed > 0
            ? "Tracks already placed in a deleted category don't move; any that fit nothing else end up in no playlist."
            : null,
          (edits.renamed.length > 0 || edits.redescribed.length > 0) &&
          placed > 0
            ? "Edited names and descriptions only steer tracks sorted from now on."
            : null,
        ].filter((n): n is string => n !== null)}
        breakdown={
          library.unsorted > 0 && placed > 0 && !rescoring
            ? {
                totalTracks: library.trackCount,
                alreadyDone: placed,
                fresh: library.unsorted,
                fullCostUsd: fullSortCost,
              }
            : undefined
        }
        onConfirm={classify}
        onCancel={() => setAsking(null)}
      />
      <CostPreviewModal
        open={asking === "repropose"}
        estimateUsd={{ low: proposeCost * 0.8, high: proposeCost }}
        message={reproposeMessage({
          saved: saved.length,
          placed,
          tracks: library.trackCount,
          sortAgainUsd: fullSortCost,
        })}
        notes={
          saved.length > 0
            ? [
                "The labelling page will refuse to load until definitions.md matches the new categories.",
              ]
            : []
        }
        confirmLabel="Wipe & re-propose"
        confirmVariant="danger"
        onConfirm={wipe}
        onCancel={() => setAsking(null)}
      />
      <TrackSearchModal
        open={adding !== undefined}
        categoryName={adding?.name ?? ""}
        trackLookup={library.tracks}
        alreadyInCategory={new Set(adding?.example_track_ids ?? [])}
        onClose={() => setAddingTo(null)}
        onAdd={(trackIds) =>
          setDraft(
            draft.map(
              (c): DraftCategory =>
                c.id === addingTo
                  ? {
                      ...c,
                      example_track_ids: [
                        ...c.example_track_ids,
                        ...trackIds.filter(
                          (id) => !c.example_track_ids.includes(id),
                        ),
                      ],
                    }
                  : c,
            ),
          )
        }
      />

      <ActionBar
        status={
          status && (
            // A changed line fades in, so a new count is noticed down here;
            // drag hints share one key so crossing rows doesn't flicker.
            <motion.span
              key={dragHint ? "drag" : status}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fade}
              className={clsx(
                status === problem && "text-[var(--color-danger)]",
              )}
            >
              {status}
            </motion.span>
          )
        }
        end={
          <Button
            disabled={blocked}
            onClick={() => {
              setProblem(null);
              setAsking("classify");
            }}
          >
            {work?.kind === "saving"
              ? "Saving…"
              : work?.kind === "rescoring"
                ? "Re-scoring…"
                : "Classify"}
          </Button>
        }
      />
    </PageShell>
  );
}

function classifyMessage({
  unsorted,
  rescorable,
  against,
}: {
  unsorted: number;
  rescorable: number;
  against: string;
}): string {
  const sort =
    unsorted > 0
      ? `sorts the ${tally(unsorted, "track")} without a category`
      : null;
  const rescore =
    rescorable > 0
      ? `re-scores your ${tally(rescorable, "placed track")} against ${against}`
      : null;
  if (sort && rescore) return `Claude ${sort}, and ${rescore}.`;
  if (sort || rescore) return `Claude ${sort ?? rescore}.`;
  return "Every track already has a category, so Claude isn't called.";
}

// The wipe clears what is saved, so that's what it counts, not the draft.
function reproposeMessage({
  saved,
  placed,
  tracks,
  sortAgainUsd,
}: {
  saved: number;
  placed: number;
  tracks: number;
  sortAgainUsd: number;
}): string {
  if (saved === 0)
    return `Claude proposes new categories from all ${tally(tracks, "track")}.`;
  const all = `Deletes all ${tally(saved, "category", "categories")}`;
  return placed > 0
    ? `${all} and every track's place in them, then Claude proposes new ones. Sorting all ${tally(tracks, "track")} again afterwards costs about $${sortAgainUsd.toFixed(2)}.`
    : `${all}, then Claude proposes new ones.`;
}

/** A load or propose that failed: say why, and offer the ways on. */
function Stalled({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <PageShell title={title} back={HOME}>
      <div className="max-w-xl space-y-6">
        <p className="text-[var(--color-text-secondary)]">{message}</p>
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
      </div>
    </PageShell>
  );
}
