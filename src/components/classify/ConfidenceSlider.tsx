"use client";
import { useRef, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

export function ConfidenceSlider({
  value,
  onChange,
  min = 0,
  max = 100,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function pctFromClient(clientX: number) {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(min + pct * (max - min));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
          Confidence
        </div>
        <div className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)]">
          {value}
        </div>
      </div>
      <div
        ref={trackRef}
        className="relative h-px bg-[var(--color-border-default)] cursor-pointer"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          setDragging(true);
          onChange(pctFromClient(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging) onChange(pctFromClient(e.clientX));
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <div
          className="absolute inset-y-0 left-0 bg-[var(--color-accent)]"
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
        <motion.div
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--color-accent-strong)] shadow-[0_0_0_4px_var(--color-bg-base)]"
          animate={{ left: `${((value - min) / (max - min)) * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
        <span>permissive</span>
        <span>strict</span>
      </div>
    </div>
  );
}
