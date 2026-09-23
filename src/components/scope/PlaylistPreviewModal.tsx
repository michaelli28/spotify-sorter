"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { Dialog } from "@/src/components/design/Dialog";
import { TrackRow } from "@/src/components/design/TrackRow";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

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
  selected,
  onToggle,
  toggleDisabled,
  onClose,
}: {
  open: boolean;
  playlistId?: string | null;
  liked?: boolean;
  title: string;
  /** Whether Scan will read this source; labels the toggle. */
  selected?: boolean;
  /** Include / leave out without closing. No toggle without it. */
  onToggle?: () => void;
  /** The choice is being saved and can't change. */
  toggleDisabled?: boolean;
  onClose: () => void;
}) {
  const { fade } = useMotionConfig();
  const [tracks, setTracks] = useState<PreviewTrack[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Clear during render, not in the effect: an effect reset paints one frame of
  // the previous playlist's tracks under the new title before it runs. This is
  // React's documented "adjusting state when a prop changes".
  const request = !open ? "closed" : liked ? "liked" : (playlistId ?? "");
  const [loadedFor, setLoadedFor] = useState(request);
  if (loadedFor !== request) {
    setLoadedFor(request);
    setTracks(null);
    setFailed(false);
  }

  useEffect(() => {
    if (!open) return;
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
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, playlistId, liked, attempt]);

  function retry() {
    setFailed(false);
    setAttempt((a) => a + 1);
  }

  const toggleLabel = selected ? "Leave out" : "Include";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title={title}
      description={
        tracks
          ? `${tracks.length.toLocaleString()} ${tracks.length === 1 ? "track" : "tracks"}`
          : undefined
      }
      actions={
        <>
          {onToggle && (
            <Button size="sm" onClick={onToggle} disabled={toggleDisabled}>
              <motion.span
                key={toggleLabel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={fade}
              >
                {toggleLabel}
              </motion.span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {/* One reserved height for loading, error and short lists, so the panel
          doesn't leap between them; only a long list grows, to the panel's cap. */}
      <div className="min-h-[min(55dvh,32rem)]">
        {tracks === null && !failed && (
          <p className="text-[var(--color-text-tertiary)]">Loading…</p>
        )}
        {failed && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <p className="text-[var(--color-text-secondary)]">
              Spotify didn&apos;t send this playlist.
            </p>
            <Button variant="ghost" size="sm" onClick={retry} className="-ml-1">
              Try again
            </Button>
          </div>
        )}
        {tracks && tracks.length === 0 && (
          <p className="text-[var(--color-text-tertiary)]">
            This playlist is empty.
          </p>
        )}
        {tracks && tracks.length > 0 && (
          <motion.ol
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fade}
          >
            {tracks.map((t, i) => (
              <TrackRow
                key={`${t.id}-${i}`}
                index={i + 1}
                title={t.title}
                artist={t.artist_name}
              />
            ))}
          </motion.ol>
        )}
      </div>
    </Dialog>
  );
}
