"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { ConfidenceSlider } from "@/src/components/classify/ConfidenceSlider";
import {
  PlaylistPreviewCard,
  type PreviewCardData,
} from "@/src/components/classify/PlaylistPreviewCard";
import { categoryMembers } from "@/src/lib/classification/threshold";
import type { Assignment } from "@/src/lib/cache";

interface ClientCache {
  config: { confidence_threshold: number };
  categories: Record<string, { name: string }>;
  tracks: Record<string, { artist_id: string; title: string }>;
  artists: Record<string, { name: string }>;
  assignments: Record<string, Assignment>;
}

export default function ClassifyPage() {
  const router = useRouter();
  const [cache, setCache] = useState<ClientCache | null>(null);
  const [threshold, setThreshold] = useState<number>(65);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 1 });

  useEffect(() => {
    const es = new EventSource("/api/llm/classify");
    es.addEventListener("progress", (e) =>
      setProgress(JSON.parse((e as MessageEvent).data)),
    );
    es.addEventListener("done", () => {
      fetch("/api/cache")
        .then((r) => r.json())
        .then((d: ClientCache) => {
          setCache(d);
          setThreshold(d.config.confidence_threshold);
          setRunning(false);
        });
      es.close();
    });
    es.addEventListener("error", () => es.close());
    return () => es.close();
  }, []);

  const cards: PreviewCardData[] = useMemo(() => {
    if (!cache) return [];
    const members = categoryMembers(cache.assignments, threshold);
    return Object.entries(cache.categories).map(([id, cat]) => {
      const trackIds = Array.from(members.get(id) ?? []);
      return {
        id,
        name: cat.name,
        tracks: trackIds.map((tid) => {
          const t = cache.tracks[tid]!;
          return {
            id: tid,
            title: t.title,
            artist_name: cache.artists[t.artist_id]?.name ?? "",
            reasoning: cache.assignments[tid]?.reasoning,
          };
        }),
      };
    });
  }, [cache, threshold]);

  function onDragEnd(e: DragEndEvent) {
    if (!cache || !e.over) return;
    const data = e.active.data.current as { trackId: string };
    const over = e.over.data.current as { toCategoryId: string };
    if (!data?.trackId || !over?.toCategoryId) return;
    setCache((prev) => {
      if (!prev) return prev;
      const next = { ...prev.assignments };
      const a = next[data.trackId];
      if (!a) return prev;
      next[data.trackId] = {
        ...a,
        override: {
          category_id: over.toCategoryId,
          set_at: new Date().toISOString(),
        },
      };
      return { ...prev, assignments: next };
    });
    fetch("/api/cache", {
      method: "PATCH",
      body: JSON.stringify({
        assignments: {
          [data.trackId]: {
            ...cache.assignments[data.trackId],
            override: {
              category_id: over.toCategoryId,
              set_at: new Date().toISOString(),
            },
          },
        },
      }),
      headers: { "content-type": "application/json" },
    });
  }

  if (running) {
    return (
      <PageShell eyebrow="Classifying" title="Listening through your library…">
        <p className="text-[var(--color-text-secondary)]">
          {progress.done} of {progress.total} batches.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Step three" title="Tune the fit.">
      <div className="sticky top-0 z-10 bg-[var(--color-bg-base)] pt-4 pb-8 -mx-12 px-12 backdrop-blur-md">
        <div className="max-w-md">
          <ConfidenceSlider value={threshold} onChange={setThreshold} />
        </div>
      </div>
      <DndContext onDragEnd={onDragEnd}>
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: { staggerChildren: 0.04, delayChildren: 0.1 },
            },
          }}
        >
          {cards.map((card) => (
            <motion.div
              key={card.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <PlaylistPreviewCard
                card={card}
                expanded={expanded.has(card.id)}
                onToggleExpand={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(card.id)) next.delete(card.id);
                    else next.add(card.id);
                    return next;
                  })
                }
              />
            </motion.div>
          ))}
        </motion.div>
      </DndContext>
      <div className="pt-12">
        <Button
          onClick={async () => {
            await fetch("/api/cache", {
              method: "PATCH",
              body: JSON.stringify({
                config: {
                  confidence_threshold: threshold,
                  prefix: "✨",
                  anthropic_model: "claude-haiku-4-5-20251001",
                },
              }),
              headers: { "content-type": "application/json" },
            });
            router.push("/apply");
          }}
        >
          Apply to Spotify
        </Button>
      </div>
    </PageShell>
  );
}
