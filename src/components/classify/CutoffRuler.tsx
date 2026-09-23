"use client";
import { useId } from "react";
import clsx from "clsx";

/** The printed scale (brief §3 Classify): scores below 40 or above 95 are rare. */
export const RULER_MIN = 40;
export const RULER_MAX = 95;

interface Props {
  value: number;
  onChange: (v: number) => void;
  /** Stretches past 40–95 only to show a saved cutoff outside it. */
  saved: number;
  className?: string;
}

export interface RulerLabel {
  value: number;
  /** false: printed only when the ruler is long enough to keep it apart. */
  always: boolean;
}

/**
 * Both ends and every ten between them. A ten under five steps from an end
 * would print on top of it; one under eight steps shows on a long ruler only.
 */
export function rulerLabels(min: number, max: number): RulerLabel[] {
  const tens: RulerLabel[] = [];
  for (let v = Math.ceil((min + 1) / 10) * 10; v < max; v += 10) {
    const gap = Math.min(v - min, max - v);
    if (gap >= 5) tens.push({ value: v, always: gap >= 8 });
  }
  return [{ value: min, always: true }, ...tens, { value: max, always: true }];
}

// The native range input does the work: keys, touch, the accessible value.
// Its thumb is an invisible 44px target (iOS drags only from the thumb), so
// the printed scale is inset by half of it and the tag sits under its centre.
const INPUT = [
  "absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent",
  "[&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:h-12 [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent",
  "[&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:h-12 [&::-moz-range-thumb]:w-11 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent",
];

/** The Fit cutoff as a printed ruler with an orange tag riding on it. */
export function CutoffRuler({ value, onChange, saved, className }: Props) {
  const id = useId();
  const min = Math.min(RULER_MIN, saved);
  const max = Math.max(RULER_MAX, saved);
  const span = max - min;
  const at = (v: number) => `${((v - min) / span) * 100}%`;
  const steps = Array.from({ length: span + 1 }, (_, i) => min + i);
  const labels = rulerLabels(min, max);

  return (
    <div
      className={clsx(
        "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3",
        className,
      )}
    >
      <label htmlFor={id} className="text-ink-2">
        Fit
      </label>
      <div className="relative h-12">
        {/* A container: a short ruler (the tablet strip) drops the unit
            ticks and the labels that would touch. */}
        <div
          aria-hidden
          className="@container pointer-events-none absolute inset-x-[22px] inset-y-0"
        >
          <svg
            viewBox={`0 0 ${span} 10`}
            preserveAspectRatio="none"
            className="absolute inset-x-0 top-[21px] h-2.5 w-full overflow-visible"
          >
            <line
              x1={0}
              x2={span}
              y1={0}
              y2={0}
              stroke="var(--ink)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {steps.map((v) => {
              const tenth = v % 10 === 0;
              const fifth = v % 5 === 0;
              const unit = !fifth && v !== min && v !== max;
              return (
                <line
                  key={v}
                  className={unit ? "@max-[12rem]:hidden" : undefined}
                  x1={v - min}
                  x2={v - min}
                  y1={0}
                  y2={tenth ? 9 : fifth ? 6 : 3}
                  stroke={
                    tenth
                      ? "var(--ink-2)"
                      : fifth
                        ? "var(--ink-3)"
                        : "var(--rule-strong)"
                  }
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          {labels.map(({ value: v, always }) => (
            <span
              key={v}
              className={clsx(
                "mono num absolute top-[31px] -translate-x-1/2 leading-none text-ink-3",
                !always && "hidden @min-[15.5rem]:block",
              )}
              style={{ left: at(v) }}
            >
              {v}
            </span>
          ))}
          {/* The tag follows the thumb 1:1: a dragged thing is never eased. */}
          <span
            className="mono num absolute top-0 grid h-[21px] min-w-8 -translate-x-1/2 place-items-center rounded-t-[3px] border-[1.5px] border-b-0 border-ink bg-accent px-1.5 text-on-accent"
            style={{ left: at(value) }}
          >
            {value}
          </span>
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={clsx(INPUT)}
        />
      </div>
    </div>
  );
}
