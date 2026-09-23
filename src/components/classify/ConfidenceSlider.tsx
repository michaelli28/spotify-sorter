"use client";
import { useId } from "react";
import clsx from "clsx";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

// A native range input: arrow keys, Page Up/Down, Home/End and touch come from
// the browser. The 1px line and its fill are drawn behind it, inset by half
// the 12px thumb so the fill always ends under the thumb's centre.
const THUMB = [
  "[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:mt-4 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-text-primary)]",
  "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out-expo motion-reduce:[&::-webkit-slider-thumb]:transition-none",
  "active:[&::-webkit-slider-thumb]:scale-125",
  "focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--color-bg-base),0_0_0_3px_var(--color-accent)]",
  "[&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--color-text-primary)]",
  "active:[&::-moz-range-thumb]:scale-125",
  "focus-visible:[&::-moz-range-thumb]:shadow-[0_0_0_2px_var(--color-bg-base),0_0_0_3px_var(--color-accent)]",
];

export function ConfidenceSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  className,
}: Props) {
  const id = useId();
  const fraction = (value - min) / (max - min);
  return (
    // One 44px row at every width: label, line, value.
    <div
      className={clsx(
        "grid grid-cols-[auto_minmax(0,1fr)_1.5rem] items-center gap-x-2 md:gap-x-3",
        className,
      )}
    >
      <label
        htmlFor={id}
        className="text-xs leading-4 text-[var(--color-text-tertiary)]"
      >
        Confidence
      </label>
      <div className="relative h-11">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 top-1/2 h-px bg-[var(--color-border-default)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 top-1/2 h-px origin-left bg-[var(--color-text-tertiary)]"
          style={{ transform: `scaleX(${fraction})` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={clsx(
            "absolute inset-0 h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none",
            THUMB,
          )}
        />
      </div>
      {/* The input announces its own value. */}
      <span
        aria-hidden
        className="text-right font-[family-name:var(--font-mono)] text-sm tabular-nums text-[var(--color-text-primary)]"
      >
        {value}
      </span>
    </div>
  );
}
