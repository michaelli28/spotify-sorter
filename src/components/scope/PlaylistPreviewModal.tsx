"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface PreviewTrack {
  id: string;
  title: string;
  artist_name: string;
}

export function PlaylistPreviewModal({
  open,
  playlistId,
  liked,
  title,
  onClose,
}: {
  open: boolean;
  playlistId?: string | null;
  liked?: boolean;
  title: string;
  onClose: () => void;
}) {
  const [tracks, setTracks] = useState<PreviewTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTracks(null);
    setError(null);
    let cancelled = false;
    const url = liked
      ? "/api/spotify/playlist-tracks?liked=true"
      : `/api/spotify/playlist-tracks?id=${encodeURIComponent(playlistId ?? "")}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ tracks: PreviewTrack[] }>;
      })
      .then((d) => {
        if (cancelled) return;
        setTracks(d.tracks);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [open, playlistId, liked]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-[var(--color-bg-base)]/80 backdrop-blur-sm z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="max-w-xl w-full max-h-[80vh] bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] flex flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-1">
                  Preview
                </div>
                <div className="text-xl text-[var(--color-text-primary)]">
                  {title}
                </div>
                {tracks && (
                  <div className="text-sm text-[var(--color-text-tertiary)] mt-1">
                    {tracks.length} tracks
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {tracks === null && !error && (
                <p className="text-[var(--color-text-tertiary)]">Loading…</p>
              )}
              {error && (
                <p className="text-[var(--color-text-secondary)]">
                  Couldn't load tracks: {error}
                </p>
              )}
              {tracks && tracks.length === 0 && (
                <p className="text-[var(--color-text-tertiary)]">
                  This playlist is empty.
                </p>
              )}
              {tracks && tracks.length > 0 && (
                <ul className="space-y-2">
                  {tracks.map((t, i) => (
                    <li
                      key={`${t.id}-${i}`}
                      className="flex items-baseline gap-3 text-sm"
                    >
                      <span className="text-[var(--color-text-tertiary)] tabular-nums w-8 text-right">
                        {i + 1}
                      </span>
                      <span className="text-[var(--color-text-primary)] flex-1 truncate">
                        {t.title}
                      </span>
                      <span className="text-[var(--color-text-tertiary)] truncate max-w-[40%]">
                        {t.artist_name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
