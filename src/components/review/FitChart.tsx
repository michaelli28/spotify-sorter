import clsx from "clsx";
import type { FitCount } from "./stats";

// viewBox units; the sheet draws it about 1:1 at desktop.
const W = 392;
const BASE = 88;
const TALL = 64;
const BAR = 20;

export interface FitChartProps {
  byFit: readonly FitCount[];
  /** The saved fit: its column is printed in ink and labelled "yours". */
  fit: number;
  /** A merge target before Classify: the numbers print in ink-3, as its count does. */
  stale?: boolean;
}

/**
 * Tracks at each fit (brief §4.2): one column per ruler step on a linear scale
 * from zero. Values sit on the marks at the first, yours and the last; the
 * accessible name lists every one.
 */
export function FitChart({ byFit, fit, stale = false }: FitChartProps) {
  const top = Math.max(1, ...byFit.map((b) => b.count));
  const slot = W / byFit.length;
  const label = `Tracks at each fit${stale ? ", before the merge" : ""}: ${byFit
    .map((b) => `${b.count.toLocaleString()} at ${b.fit}`)
    .join(", ")}. Yours is ${fit}.`;
  const ink = stale ? "fill-ink-3" : "fill-ink";
  const labelled = (i: number) =>
    i === 0 || i === byFit.length - 1 || byFit[i]!.fit === fit;

  return (
    <div className="mt-8">
      <h2 className="mb-3 font-semibold">Tracks at each fit</h2>
      <svg
        viewBox={`0 0 ${W} 126`}
        role="img"
        aria-label={label}
        className="block h-auto w-full overflow-visible"
      >
        <line
          x1="0"
          x2={W}
          y1={BASE + 0.5}
          y2={BASE + 0.5}
          className="stroke-rule-strong"
        />
        {byFit.map((b, i) => {
          const cx = slot * i + slot / 2;
          const yours = b.fit === fit;
          // A count above zero never vanishes; zero draws nothing at all.
          const h = b.count > 0 ? Math.max(1.5, (b.count / top) * TALL) : 0;
          return (
            <g key={b.fit}>
              {h > 0 && (
                <rect
                  x={cx - BAR / 2}
                  y={BASE - h}
                  width={BAR}
                  height={h}
                  className={yours ? ink : "fill-rule-strong"}
                />
              )}
              {labelled(i) && (
                <text
                  x={cx}
                  y={BASE - h - 7}
                  textAnchor="middle"
                  className={clsx(ink, "text-[14px] font-semibold")}
                >
                  {b.count.toLocaleString()}
                </text>
              )}
              <text
                x={cx}
                y={105}
                textAnchor="middle"
                className={
                  yours
                    ? "fill-ink font-mono text-[12.8px] font-medium"
                    : "fill-ink-3 font-mono text-[12.8px]"
                }
              >
                {b.fit}
              </text>
              {yours && (
                <text
                  x={cx}
                  y={121}
                  textAnchor="middle"
                  className="fill-ink font-mono text-[12.8px] font-medium"
                >
                  yours
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
