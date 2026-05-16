"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

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

  return (
    <div className="max-w-xl space-y-4">
      <div className="h-px bg-[var(--color-border-default)] w-full relative overflow-hidden">
        <motion.div
          className="absolute inset-y-0 bg-[var(--color-accent)]"
          style={{ width: "30%" }}
          initial={{ left: "-30%" }}
          animate={{ left: "100%" }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
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
