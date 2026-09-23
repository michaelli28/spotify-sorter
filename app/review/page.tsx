"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { MergeableGrid } from "@/src/components/review/MergeableGrid";
import { AddCategoryForm } from "@/src/components/review/AddCategoryForm";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";
import { buildCategoriesPatch } from "@/src/lib/categories/patch-body";
import { categoryDelta } from "@/src/lib/categories/delta";
import { TrackSearchModal } from "@/src/components/review/TrackSearchModal";
import { ThinkingIndicator } from "@/src/components/shared/ThinkingIndicator";
import { estimateCostUSD, estimateClassifyCost } from "@/src/lib/llm/cost";
import type { DraftCategory } from "@/src/lib/categories/merge";
import type { TrackLookupEntry } from "@/src/components/review/CategoryCard";

interface CacheRun {
  run_id: string;
  type?: "propose" | "classify";
  started_at: string;
  completed_at: string | null;
  tracks_total: number;
  tracks_classified: number;
  cost_usd: number;
  summary: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftCategory[] | null>(null);
  // What the cache held when the page loaded, so the confirm can name the
  // categories a save would delete.
  const [saved, setSaved] = useState<{ id: string; name: string }[]>([]);
  const [tracks, setTracks] = useState<Record<string, TrackLookupEntry>>({});
  const [trackCount, setTrackCount] = useState(0);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [runs, setRuns] = useState<CacheRun[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [reproposing, setReproposing] = useState(false);
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [proposeProgress, setProposeProgress] = useState<{
    output_tokens: number;
  } | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposeAttempt, setProposeAttempt] = useState(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    (async () => {
      const cache = await fetch("/api/cache").then((r) => r.json());
      if (cancelled) return;
      const lookup: Record<string, TrackLookupEntry> = {};
      for (const [id, t] of Object.entries(
        cache.tracks as Record<string, { title: string; artist_id: string }>,
      )) {
        const artist = (cache.artists as Record<string, { name: string }>)[
          t.artist_id
        ];
        lookup[id] = { id, title: t.title, artist_name: artist?.name ?? "" };
      }
      setTracks(lookup);
      setTrackCount(Object.keys(lookup).length);
      setAssignmentCount(
        Object.keys((cache.assignments as Record<string, unknown>) ?? {})
          .length,
      );
      setRuns(((cache.runs as CacheRun[] | undefined) ?? []).slice(-10));

      const existingCategories = Object.entries(
        cache.categories as Record<
          string,
          {
            name: string;
            description: string;
            example_track_ids?: string[];
          }
        >,
      );
      if (existingCategories.length > 0) {
        setSaved(existingCategories.map(([id, c]) => ({ id, name: c.name })));
        setDraft(
          existingCategories.map(([id, c]) => ({
            id,
            name: c.name,
            description: c.description,
            example_track_ids: c.example_track_ids ?? [],
          })),
        );
        return;
      }
      setProposeError(null);
      setProposeProgress(null);
      es = new EventSource("/api/llm/propose");
      es.addEventListener("progress", (e) =>
        setProposeProgress(JSON.parse((e as MessageEvent).data)),
      );
      es.addEventListener("done", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setDraft(data.categories);
        es?.close();
      });
      es.addEventListener("error", (e) => {
        const raw = (e as MessageEvent).data;
        const message = raw
          ? (JSON.parse(raw).message ?? "Unknown error")
          : "Connection lost";
        setProposeError(message);
        es?.close();
      });
    })();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [proposeAttempt]);

  async function classify() {
    setRunning(true);
    const cacheBefore = await fetch("/api/cache").then((r) => r.json());
    const previousCategoryIds = new Set(
      Object.keys((cacheBefore.categories as Record<string, unknown>) ?? {}),
    );
    await fetch("/api/cache", {
      method: "PATCH",
      body: JSON.stringify(
        buildCategoriesPatch(draft!, new Date().toISOString()),
      ),
      headers: { "content-type": "application/json" },
    });
    const draftCategoryIds = new Set(draft!.map((c) => c.id));
    const newCategoryIds = Array.from(draftCategoryIds).filter(
      (id) => !previousCategoryIds.has(id),
    );
    if (newCategoryIds.length > 0 && previousCategoryIds.size > 0) {
      await fetch("/api/llm/reclassify", {
        method: "POST",
        body: JSON.stringify({ newCategoryIds }),
        headers: { "content-type": "application/json" },
      });
    }
    router.push("/classify");
  }

  async function startRepropose() {
    await fetch("/api/cache", {
      method: "PATCH",
      body: JSON.stringify({ _clear: ["categories", "assignments"] }),
      headers: { "content-type": "application/json" },
    });
    setDraft(null);
    setProposeError(null);
    setProposeProgress(null);
    setProposeAttempt((n) => n + 1);
  }

  if (!draft) {
    if (proposeError) {
      return (
        <PageShell eyebrow="Couldn't propose" title="That call failed.">
          <div className="max-w-xl space-y-6">
            <p className="text-[var(--color-text-secondary)]">{proposeError}</p>
            <Button
              onClick={() => {
                setProposeError(null);
                setProposeProgress(null);
                setProposeAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        </PageShell>
      );
    }
    return (
      <PageShell eyebrow="Thinking" title="Proposing categories…">
        <ThinkingIndicator
          message="Claude Haiku is listening through your library."
          estimateSeconds={Math.max(30, Math.round(trackCount / 30))}
          outputTokens={proposeProgress?.output_tokens}
        />
      </PageShell>
    );
  }

  const tracksLeftToClassify = Math.max(0, trackCount - assignmentCount);
  const classifyEst = estimateClassifyCost(tracksLeftToClassify);
  const fullCostEst = estimateClassifyCost(trackCount).high;
  const lastPropose = [...runs]
    .reverse()
    .find((r) => r.type === "propose" || (!r.type && r.cost_usd > 0));
  const reproposeEst =
    estimateCostUSD({
      tracks: trackCount,
      categories: 0,
      phase: "propose",
    }) * 1.2;
  const estimates: Record<string, number> = Object.fromEntries(
    draft.map((c) => [c.id, c.example_track_ids.length]),
  );

  return (
    <PageShell
      eyebrow="Step two"
      title={`${draft.length} categories. Edit anything.`}
    >
      <MergeableGrid
        categories={draft}
        trackLookup={tracks}
        estimates={estimates}
        onChange={setDraft}
        onAddTrack={(catId) => setAddingToCategory(catId)}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8"
      >
        <AddCategoryForm
          onAdd={(name, description) =>
            setDraft([
              ...draft,
              {
                id: crypto.randomUUID(),
                name,
                description,
                example_track_ids: [],
              },
            ])
          }
        />
      </motion.div>
      <div className="pt-16 flex items-center gap-8 flex-wrap">
        <Button
          onClick={() => setConfirming(true)}
          disabled={running || draft.length === 0}
        >
          {running ? "Classifying…" : "Classify"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setReproposing(true)}
          disabled={running}
        >
          Re-propose
        </Button>
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {draft.length} categories · {trackCount} tracks
          {assignmentCount > 0 && ` · ${assignmentCount} already classified`}
        </span>
      </div>
      {lastPropose && (
        <div className="pt-3 text-xs text-[var(--color-text-tertiary)]">
          Last propose{" "}
          {timeAgo(lastPropose.completed_at ?? lastPropose.started_at)}
          {" · "}${lastPropose.cost_usd.toFixed(2)}
        </div>
      )}
      <CostPreviewModal
        open={confirming}
        removing={categoryDelta(saved, draft).removed}
        estimateUsd={classifyEst}
        message={
          tracksLeftToClassify === 0
            ? `All ${trackCount} tracks are already classified — Claude won't be called.`
            : `About to classify ${tracksLeftToClassify} new tracks across ${draft.length} categories using Claude Haiku.`
        }
        breakdown={{
          totalTracks: trackCount,
          alreadyDone: assignmentCount,
          fresh: tracksLeftToClassify,
          fullCostUsd: fullCostEst,
        }}
        onConfirm={() => {
          setConfirming(false);
          classify();
        }}
        onCancel={() => setConfirming(false)}
      />
      <TrackSearchModal
        open={addingToCategory !== null}
        categoryName={draft.find((c) => c.id === addingToCategory)?.name ?? ""}
        trackLookup={tracks}
        alreadyInCategory={
          new Set(
            draft.find((c) => c.id === addingToCategory)?.example_track_ids ??
              [],
          )
        }
        onClose={() => setAddingToCategory(null)}
        onAdd={(trackIds) => {
          if (!addingToCategory) return;
          setDraft(
            draft.map((c) =>
              c.id === addingToCategory
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
          );
        }}
      />
      <CostPreviewModal
        open={reproposing}
        estimateUsd={{ low: reproposeEst * 0.8, high: reproposeEst }}
        message={`This wipes the current ${draft.length} categories and any track assignments, then asks Claude to invent new ones from your full library (${trackCount} tracks).`}
        confirmLabel="Wipe & re-propose"
        onConfirm={async () => {
          setReproposing(false);
          await startRepropose();
        }}
        onCancel={() => setReproposing(false)}
      />
    </PageShell>
  );
}
