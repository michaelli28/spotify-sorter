"use client";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { tabTint } from "@/src/lib/sleeves/inks";
import type { Temperature } from "@/src/lib/sleeves/temperature";
import { CRATE, recordHairlines, type DividerLayout } from "./crate-geometry";
import type { GroupMotion } from "./Sleeve";

// Primitives for the crate, composed by home (pulled sleeve, sticker, flipping) and
// classify (per-tab counts, bumps). Layers, back to front: <CrateLayer> (crate and
// dividers, SVG) < <CrateTab>s < a page's pulled sleeve (CRATE_Z.sleeve) < <CrateSlats>.

/** A length in bin units, for inline styles inside <CrateFigure>. */
export function u(n: number): string {
  return `calc(${n} * var(--u))`;
}

export const CRATE_Z = { tabs: 10, sleeve: 60, slats: 70 } as const;

/** The crate's box: 440u wide at whatever width it is given, 578u tall. Props go to the inner box. */
export function CrateFigure({
  children,
  className,
  style,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={clsx("@container isolate w-full", className)}>
      <div
        {...rest}
        className="relative"
        style={
          {
            "--u": `calc(100cqw / ${CRATE.WIDTH})`,
            height: u(CRATE.HEIGHT),
            ...style,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

/** An SVG drawn in bin units over the whole figure. Put <CrateBack> and <CrateDivider>s in it. */
export function CrateLayer({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${CRATE.WIDTH} ${CRATE.HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {children}
    </svg>
  );
}

const SIDES = `M0 ${CRATE.SLAT_1} L${CRATE.BACK_X} ${CRATE.BACK_Y} H${CRATE.WIDTH - CRATE.BACK_X} L${CRATE.WIDTH} ${CRATE.SLAT_1}`;

/** The back rail and sides in perspective: kraft behind the dividers, one ink keyline. */
export function CrateBack() {
  return (
    <g>
      <path className="crate-wood" d={`${SIDES} Z`} fill="var(--kraft)" />
      <path
        className="crate-edge"
        d={SIDES}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

export type CrateDividerProps = GroupMotion & {
  divider: DividerLayout<unknown>;
  /** Tints the record stack. null = untinted. */
  temperature: Temperature | null;
  /** The pulled divider: its stack is outlined in ink, with darker hairlines. */
  current?: boolean;
};

/**
 * One divider card and the records standing behind it (a stack whose depth is its
 * track count, one hairline per record top). Render dividers back to front
 * (`[...layout].reverse()`), so a front stack paints over the card behind it.
 */
export function CrateDivider({
  divider: d,
  temperature,
  current = false,
  ...motionProps
}: CrateDividerProps) {
  const { x, y, width, height } = d.stack;
  const edge = current ? "var(--ink)" : "var(--rec-edge)";
  const hairlines = recordHairlines(height)
    .map((t) => `M${x} ${y + t + CRATE.HAIRLINE / 2}h${width}`)
    .join("");
  return (
    <motion.g {...motionProps}>
      {height > 0 && (
        <>
          <rect
            className="crate-stack"
            x={x}
            y={y}
            width={width}
            height={height}
            style={{
              fill: temperature ? tabTint(temperature) : "var(--paper-deep)",
            }}
          />
          <path
            className="crate-hairlines"
            d={hairlines}
            fill="none"
            stroke={current ? "var(--ink-2)" : "var(--rec-edge)"}
            strokeWidth={CRATE.HAIRLINE}
          />
          <path
            className="crate-stack-edge"
            d={`M${x} ${y + height}V${y}H${x + width}V${y + height}`}
            fill="none"
            stroke={edge}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      <rect
        className="crate-card"
        x={d.x}
        y={d.top}
        width={d.width}
        height={CRATE.HEIGHT - 2 - d.top}
        rx={2}
        fill="var(--paper-deep)"
        stroke="var(--rule-strong)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </motion.g>
  );
}

/**
 * The slot above a divider where its tab stands, in the HTML layer so it can hold a
 * button (home's roving tabs) or a Tab plus a count (classify).
 */
export function CrateTab({
  divider,
  children,
  className,
  style,
  ...rest
}: { divider: DividerLayout<unknown> } & ComponentPropsWithoutRef<"div">) {
  const { left, top, width } = divider.tab;
  return (
    <div
      {...rest}
      className={clsx("absolute", className)}
      style={{
        left: u(left),
        top: u(top),
        width: u(width),
        zIndex: CRATE_Z.tabs,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const slat =
  "absolute inset-x-0 rounded-[2px] border-[1.5px] border-[var(--ink)] bg-[var(--kraft)]";

/** The two front slats, over everything (a pulled sleeve rises from behind them). Children print on the lower slat. */
export function CrateSlats({ children }: { children?: ReactNode }) {
  const second = CRATE.SLAT_1 + CRATE.SLAT_H + CRATE.SLAT_GAP;
  return (
    <>
      <div
        data-slat="1"
        className={clsx(slat, "pointer-events-none")}
        style={{
          top: u(CRATE.SLAT_1),
          height: u(CRATE.SLAT_H),
          zIndex: CRATE_Z.slats,
        }}
      >
        {/* The hand-hold. */}
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--hollow)]"
          style={{ top: u(10), width: u(88), height: u(14) }}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-px bg-[var(--hollow)]"
        style={{
          top: u(CRATE.SLAT_1 + CRATE.SLAT_H),
          height: u(CRATE.SLAT_GAP),
          zIndex: CRATE_Z.slats - 1,
        }}
      />
      <div
        data-slat="2"
        className={clsx(
          slat,
          "grid place-items-center text-[var(--ink)] [&_i]:border-[var(--ink)]",
        )}
        style={{
          top: u(second),
          height: u(CRATE.SLAT_H),
          zIndex: CRATE_Z.slats,
        }}
      >
        {children}
      </div>
    </>
  );
}
