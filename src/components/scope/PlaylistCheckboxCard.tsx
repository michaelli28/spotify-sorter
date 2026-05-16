"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Check, Eye } from "lucide-react";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

export function PlaylistCheckboxCard({
  playlist,
  selected,
  onToggle,
  onPreview,
  subtitle,
  iconFallback,
}: {
  playlist: Pick<OwnedPlaylist, "id" | "name" | "track_count" | "cover_url">;
  selected: boolean;
  onToggle: () => void;
  onPreview?: () => void;
  subtitle?: string;
  iconFallback?: React.ReactNode;
}) {
  return (
    <motion.div
      className={clsx(
        "relative flex items-stretch text-left w-full",
        "bg-[var(--color-bg-surface)] border transition-colors duration-200",
        selected
          ? "border-[var(--color-accent)]"
          : "border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]",
      )}
      whileTap={{ scale: 0.99 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-4 p-4 min-w-0 text-left"
        aria-pressed={selected}
      >
        {playlist.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playlist.cover_url}
            alt=""
            className="w-14 h-14 object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-14 h-14 bg-[var(--color-bg-elevated)] flex items-center justify-center flex-shrink-0"
            aria-hidden
          >
            {iconFallback}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div
            className={clsx(
              "text-[var(--color-text-primary)] truncate relative inline-block",
              selected &&
                "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-[var(--color-accent)]",
            )}
          >
            {playlist.name}
          </div>
          <div className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {subtitle ??
              `${playlist.track_count} ${playlist.track_count === 1 ? "track" : "tracks"}`}
          </div>
        </div>
        <div
          className={clsx(
            "w-6 h-6 flex items-center justify-center border transition-all flex-shrink-0",
            selected
              ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
              : "border-[var(--color-border-strong)]",
          )}
          aria-hidden
        >
          {selected && (
            <Check className="w-4 h-4 text-[var(--color-bg-base)]" />
          )}
        </div>
      </button>
      {onPreview && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className="px-3 border-l border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
          aria-label={`Preview ${playlist.name}`}
        >
          <Eye className="w-4 h-4" />
        </button>
      )}
    </motion.div>
  );
}
