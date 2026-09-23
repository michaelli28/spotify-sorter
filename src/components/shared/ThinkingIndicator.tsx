"use client";
import { useEffect, useState } from "react";

interface ThinkingIndicatorProps {
  message: string;
  estimateSeconds?: number;
  outputTokens?: number;
}

export function ThinkingIndicator({
  message,
  estimateSeconds,
  outputTokens,
}: ThinkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const overtime = estimateSeconds ? elapsed > estimateSeconds * 1.5 : false;
  const hasTokens = typeof outputTokens === "number" && outputTokens > 0;

  // No sweep or pulse: nothing here measures progress, so the live counters
  // are the only sign of work (the brief bans endless loaders).
  return (
    <div className="max-w-xl space-y-2">
      <p className="text-[var(--color-text-secondary)]">{message}</p>
      <p className="text-xs font-[family-name:var(--font-mono)] tabular-nums text-[var(--color-text-tertiary)]">
        {formatElapsed(elapsed)} elapsed
        {hasTokens && ` · ${outputTokens!.toLocaleString()} tokens generated`}
        {estimateSeconds && !overtime && ` · ~${estimateSeconds}s expected`}
        {overtime && ` · still working — larger libraries take longer`}
      </p>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}
