"use client";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";
import { TrackChip } from "./TrackChip";

export interface PreviewCardData {
  id: string;
  name: string;
  tracks: Array<{
    id: string;
    title: string;
    artist_name: string;
    reasoning?: string;
  }>;
}

interface Props {
  card: PreviewCardData;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function PlaylistPreviewCard({ card, expanded, onToggleExpand }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `card:${card.id}`,
    data: { toCategoryId: card.id },
  });
  const visible = expanded ? card.tracks : card.tracks.slice(0, 8);

  return (
    <motion.div
      ref={setNodeRef}
      layout
      className={clsx(
        "bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-8 transition-colors",
        isOver && "border-[var(--color-accent)]",
      )}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)]">
          {card.name}
        </h3>
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-tertiary)]">
          {card.tracks.length}
        </span>
      </div>
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-4">
        {card.tracks.length === 1 ? "track" : "tracks"}
      </div>
      <ol className="space-y-0.5">
        {visible.map((t) => (
          <TrackChip
            key={t.id}
            trackId={t.id}
            title={t.title}
            artist_name={t.artist_name}
            reasoning={t.reasoning}
            categoryId={card.id}
          />
        ))}
      </ol>
      {card.tracks.length > 8 && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-4 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          {expanded ? "Collapse" : `Show all ${card.tracks.length}`}
        </button>
      )}
    </motion.div>
  );
}
