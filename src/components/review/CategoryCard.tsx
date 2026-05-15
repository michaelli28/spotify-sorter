"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import clsx from "clsx";

export interface CategoryCardData {
  id: string;
  name: string;
  description: string;
  example_track_ids: string[];
}

export interface TrackLookupEntry {
  id: string;
  title: string;
  artist_name: string;
}

interface Props {
  category: CategoryCardData;
  tracks: TrackLookupEntry[];
  onRename: (name: string) => void;
  onDelete: () => void;
  totalCount: number;
}

export function CategoryCard({
  category,
  tracks,
  onRename,
  onDelete,
  totalCount,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tracks : tracks.slice(0, 5);

  return (
    <motion.div
      layout
      className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-8 hover:border-[var(--color-border-strong)] transition-colors"
      transition={{ type: "spring", stiffness: 200, damping: 30 }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <input
          value={category.name}
          onChange={(e) => onRename(e.target.value)}
          className={clsx(
            "flex-1 bg-transparent px-0 py-1 font-[family-name:var(--font-display)] text-3xl",
            "text-[var(--color-text-primary)] focus:outline-none",
            "border-b border-transparent focus:border-[var(--color-accent)]",
            "transition-colors",
          )}
        />
        <button
          type="button"
          onClick={onDelete}
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors p-2"
          aria-label="Delete category"
        >
          <Trash2 size={16} strokeWidth={1.25} />
        </button>
      </div>
      <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
        {category.description}
      </p>
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
        Samples · estimated {totalCount}
      </div>
      <ol className="space-y-2">
        {visible.map((t, i) => (
          <li key={t.id} className="flex gap-4 items-baseline">
            <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-tertiary)] w-8">
              {String(i + 1).padStart(2, "0")}.
            </span>
            <a
              href={`spotify:track:${t.id}`}
              className="text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
            >
              {t.title}
              <span className="text-[var(--color-text-secondary)]">
                {" "}
                · {t.artist_name}
              </span>
            </a>
          </li>
        ))}
      </ol>
      {tracks.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-6 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          {expanded ? "Show fewer" : `Show all ${tracks.length} sample tracks`}
        </button>
      )}
    </motion.div>
  );
}
