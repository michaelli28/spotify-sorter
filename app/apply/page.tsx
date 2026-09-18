"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { ProgressBar } from "@/src/components/scan/ProgressBar";
import { ApplyConfirmationModal } from "@/src/components/apply/ApplyConfirmationModal";
import { SuccessCredits } from "@/src/components/apply/SuccessCredits";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { readEventStream } from "@/src/lib/client/read-event-stream";

interface DoneResult {
  created: number;
  updated: number;
  tracks_added: number;
  playlists: Array<{
    id: string;
    name: string;
    track_count: number;
    created: boolean;
  }>;
}

export default function ApplyPage() {
  const [confirmOpen, setConfirmOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 1, name: "" });
  const [done, setDone] = useState<DoneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState({
    toCreate: 0,
    toUpdate: 0,
    totalTracks: 0,
  });

  useEffect(() => {
    (async () => {
      const cache = await fetch("/api/cache").then((r) => r.json());
      const members = categoryMembers(
        cache.assignments,
        cache.config.confidence_threshold,
      );
      let toCreate = 0,
        toUpdate = 0;
      for (const cat of Object.values(cache.categories) as Array<{
        spotify_playlist_id: string | null;
      }>) {
        if (cat.spotify_playlist_id) toUpdate++;
        else toCreate++;
      }
      let totalTracks = 0;
      for (const set of members.values()) totalTracks += set.size;
      setPreview({ toCreate, toUpdate, totalTracks });
    })();
  }, []);

  // The apply route is POST-only (it writes to Spotify), so this can't use
  // EventSource, which always sends GET and got a 405.
  async function start() {
    setConfirmOpen(false);
    setRunning(true);
    setError(null);
    try {
      let finished = false;
      const res = await fetch("/api/spotify/apply", { method: "POST" });
      await readEventStream(res, (event, data) => {
        if (event === "progress") {
          setProgress(data as typeof progress);
        } else if (event === "done") {
          finished = true;
          setDone(data as DoneResult);
        } else if (event === "error") {
          finished = true;
          setError((data as { message?: string }).message ?? "Unknown error");
          setRunning(false);
        }
      });
      if (!finished) {
        throw new Error(
          "Connection lost — Spotify may have rate-limited the app.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setRunning(false);
    }
  }

  if (done) {
    return (
      <PageShell>
        <SuccessCredits
          playlists={done.playlists}
          summary={{
            created: done.created,
            updated: done.updated,
            tracks_added: done.tracks_added,
          }}
        />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell eyebrow="Something broke" title="Apply failed.">
        <div className="max-w-xl space-y-6">
          <p className="text-[var(--color-text-secondary)]">{error}</p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Any tracks already added to playlists are saved. Re-running picks up
            where it left off.
          </p>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => {
                setError(null);
                start();
              }}
            >
              Try again
            </Button>
            <a
              href="/"
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Back to start
            </a>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={running ? "Writing to Spotify" : "Ready"}
      title={running ? "Adding tracks…" : "About to apply."}
    >
      <AnimatePresence mode="wait">
        {running && (
          <motion.div
            key="run"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-xl space-y-6"
          >
            <ProgressBar value={progress.done} total={progress.total} />
            <p className="text-[var(--color-text-secondary)]">
              {progress.name ? `Adding to "${progress.name}"…` : "Starting…"} (
              {progress.done}/{progress.total})
            </p>
          </motion.div>
        )}
        {!running && !done && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <p className="text-[var(--color-text-secondary)] max-w-xl">
              When you&apos;re ready, we&apos;ll create your new playlists.
            </p>
            <Button onClick={() => setConfirmOpen(true)}>
              Review and apply
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <ApplyConfirmationModal
        open={confirmOpen}
        toCreate={preview.toCreate}
        toUpdate={preview.toUpdate}
        totalTracks={preview.totalTracks}
        onConfirm={start}
        onCancel={() => setConfirmOpen(false)}
      />
    </PageShell>
  );
}
