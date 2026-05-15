"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { ProgressBar } from "@/src/components/scan/ProgressBar";

interface Progress {
  stage: string;
  current: number;
  total: number;
}

const STAGE_LABEL: Record<string, string> = {
  playlists: "Reading your playlists",
  liked: "Reading your Liked Songs",
  artists: "Pulling artist genres",
};

export default function ScanPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({
    stage: "playlists",
    current: 0,
    total: 1,
  });
  const [done, setDone] = useState<{
    unique_tracks: number;
    unique_artists: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/spotify/scan");
    es.addEventListener("progress", (e) =>
      setProgress(JSON.parse((e as MessageEvent).data)),
    );
    es.addEventListener("done", (e) => {
      setDone(JSON.parse((e as MessageEvent).data));
      es.close();
    });
    es.addEventListener("error", (e) => {
      const data = JSON.parse((e as MessageEvent).data ?? "{}");
      if (data.message === "EMPTY_LIBRARY") {
        setError(
          "Your scope is empty. Add some music to your library, then come back.",
        );
      } else {
        setError(data.message ?? "Stream interrupted");
      }
      es.close();
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    if (done) {
      let cancelled = false;
      (async () => {
        const cache = await fetch("/api/cache").then((r) => r.json());
        const isRerun = Array.isArray(cache.runs) && cache.runs.length > 0;
        if (cancelled) return;
        setTimeout(() => router.push(isRerun ? "/diff" : "/review"), 800);
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [done, router]);

  return (
    <PageShell
      eyebrow="Scanning"
      title={done ? "Found your library." : "Reading your library…"}
    >
      <div className="max-w-xl space-y-6">
        <ProgressBar
          value={done ? 1 : progress.current}
          total={done ? 1 : progress.total}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={error ?? (done ? "done" : progress.stage)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="text-[var(--color-text-secondary)]"
          >
            {error
              ? error
              : done
                ? `${done.unique_tracks} unique tracks across ${done.unique_artists} artists.`
                : `${STAGE_LABEL[progress.stage] ?? progress.stage}… (${progress.current}/${progress.total})`}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageShell>
  );
}
