"use client";
import { createElement, useMemo } from "react";
import { motion, type MotionProps } from "framer-motion";
import { fmt } from "@/src/lib/sleeves/format";
import { sleeveArt, type Shape } from "@/src/lib/sleeves/geometry";
import { PAPER } from "@/src/lib/sleeves/inks";
import type { SleeveSource } from "@/src/lib/sleeves/lexicon";
import { specInCatalogue, type SleeveSpec } from "@/src/lib/sleeves/spec";

/** Motion for one <g> (a drum, a crate divider), relative to where it rests. */
export type GroupMotion = Pick<
  MotionProps,
  "initial" | "animate" | "exit" | "transition" | "variants" | "custom"
>;

type Source =
  | { spec: SleeveSpec; category?: never; catalogue?: never }
  | {
      spec?: never;
      /** Printed as given, so an unsaved draft (rename, Colour override) reprints at once. */
      category: SleeveSource;
      /** Every category in catalogue order (the saved list is fine); it decides the de-duplicated motif and ink B. */
      catalogue: readonly SleeveSource[];
    };

export type SleeveProps = Source & {
  /** Rendered px. Picks the dot screen (from 80px) and the ink speckle (from 120px). */
  size: number;
  /** role="img" with this label; without it the sleeve is decorative (aria-hidden). */
  title?: string;
  className?: string;
  drumA?: GroupMotion;
  /** Set pieces animate registration with it (see registrationShift). */
  drumB?: GroupMotion;
};

/** Where drum B sits at `factor` times its misregistration (1 = at rest, 4 = the print-in start). */
export function registrationShift(
  spec: SleeveSpec,
  factor: number,
): { x: number; y: number } {
  // + 0 turns -0 (factor 1 on a negative offset) into 0.
  return { x: (factor - 1) * spec.dx + 0, y: (factor - 1) * spec.dy + 0 };
}

/** A shape's attributes as React props (stroke-width → strokeWidth). */
function reactProps(s: Shape): Record<string, string> {
  return Object.fromEntries(
    s.attrs.map(([name, value]) => [
      name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
      value,
    ]),
  );
}

function Shapes({ shapes }: { shapes: readonly Shape[] }) {
  return shapes.map((s, i) =>
    createElement(s.tag, { key: i, ...reactProps(s) }),
  );
}

/**
 * A category's two-drum risograph sleeve (brief §4.1). Needs one <SleeveDefs/> on the page.
 * Drum B is a motion.g inside its misregistration offset, so a set piece can move it out
 * of register and let it settle (`registrationShift`).
 */
export function Sleeve({
  spec,
  category,
  catalogue,
  size,
  title,
  className,
  drumA,
  drumB,
}: SleeveProps) {
  const s = useMemo(
    () => spec ?? specInCatalogue(category, catalogue),
    [spec, category, catalogue],
  );
  const { a, b, grain } = useMemo(() => sleeveArt(s, size), [s, size]);
  const mask = grain ? "url(#rs-grain)" : undefined;
  const label = title
    ? { role: "img", "aria-label": title }
    : { "aria-hidden": true };
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      {...label}
      data-temp={s.temp}
      data-motif={s.motif}
      data-inks={`${s.inkA}+${s.inkB}`}
    >
      <rect x="-10" y="-10" width="120" height="120" fill={PAPER} />
      <g transform={`rotate(${s.turn * 90} 50 50)`}>
        <motion.g {...drumA}>
          <g mask={mask}>
            <Shapes shapes={a} />
          </g>
        </motion.g>
        <g
          style={{ mixBlendMode: "multiply" }}
          transform={`translate(${fmt(s.dx)} ${fmt(s.dy)})`}
        >
          <motion.g {...drumB}>
            <g mask={mask}>
              <Shapes shapes={b} />
            </g>
          </motion.g>
        </g>
      </g>
    </svg>
  );
}
