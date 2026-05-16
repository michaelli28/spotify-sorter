"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { MergeableGrid } from "@/src/components/review/MergeableGrid";
import { AddCategoryForm } from "@/src/components/review/AddCategoryForm";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";
import { ThinkingIndicator } from "@/src/components/shared/ThinkingIndicator";
import { estimateCostUSD } from "@/src/lib/llm/cost";
import type { DraftCategory } from "@/src/lib/categories/merge";
import type { TrackLookupEntry } from "@/src/components/review/CategoryCard";

export default function ReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftCategory[] | null>(null);
  const [tracks, setTracks] = useState<Record<string, TrackLookupEntry>>({});
  const [trackCount, setTrackCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
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

      const existingCategories = Object.entries(
        cache.categories as Record<
          string,
          { name: string; description: string }
        >,
      );
      if (existingCategories.length > 0) {
        setDraft(
          existingCategories.map(([id, c]) => ({
            id,
            name: c.name,
            description: c.description,
            example_track_ids: [],
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
      body: JSON.stringify({
        categories: Object.fromEntries(
          draft!.map((c) => [
            c.id,
            {
              name: c.name,
              description: c.description,
              spotify_playlist_id: null,
              created_at: new Date().toISOString(),
            },
          ]),
        ),
      }),
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

  const lowEst = estimateCostUSD({
    tracks: trackCount,
    categories: draft.length,
    phase: "classify",
  });
  const highEst = lowEst * 2;
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
      <div className="pt-16 flex items-center gap-8">
        <Button
          onClick={() => setConfirming(true)}
          disabled={running || draft.length === 0}
        >
          {running ? "Classifying…" : "Classify"}
        </Button>
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {draft.length} categories · {trackCount} tracks
        </span>
      </div>
      <CostPreviewModal
        open={confirming}
        estimateUsd={{ low: lowEst, high: highEst }}
        message={`About to classify ${trackCount} tracks across ${draft.length} categories using Claude Haiku.`}
        onConfirm={() => {
          setConfirming(false);
          classify();
        }}
        onCancel={() => setConfirming(false)}
      />
    </PageShell>
  );
}
