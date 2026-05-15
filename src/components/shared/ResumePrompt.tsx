"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResumeBanner } from "./ResumeBanner";

interface Run {
  completed_at: string | null;
  tracks_classified: number;
  tracks_total: number;
  summary: string;
}

export function ResumePrompt() {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    fetch("/api/cache")
      .then((r) => r.json())
      .then((d) => {
        const runs = (d.runs as Run[] | undefined) ?? [];
        const last = runs[runs.length - 1];
        if (last && !last.completed_at) setRun(last);
      })
      .catch(() => {});
  }, []);

  if (!run) return null;
  return (
    <div className="mt-8">
      <ResumeBanner
        lastRunSummary={run.summary}
        classifiedFraction={{
          done: run.tracks_classified,
          total: run.tracks_total,
        }}
        onResume={() => router.push("/classify")}
        onStartFresh={() => router.push("/scope")}
      />
    </div>
  );
}
