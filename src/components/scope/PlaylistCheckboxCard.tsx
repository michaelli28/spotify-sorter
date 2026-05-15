"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

export function PlaylistCheckboxCard({
  playlist,
  selected,
  onToggle,
}: {
  playlist: OwnedPlaylist;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      className={clsx(
        "flex items-center gap-4 text-left p-4 w-full",
        "bg-[var(--color-bg-surface)] border border-[var(--color-border-default)]",
        "transition-colors duration-300",
        "hover:border-[var(--color-border-strong)]",
      )}
      whileTap={{ scale: 0.99 }}
    >
      {playlist.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={playlist.cover_url}
          alt=""
          className="w-14 h-14 object-cover"
        />
      ) : (
        <div className="w-14 h-14 bg-[var(--color-bg-elevated)]" aria-hidden />
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
          {playlist.track_count}{" "}
          {playlist.track_count === 1 ? "track" : "tracks"}
        </div>
      </div>
    </motion.button>
  );
}
