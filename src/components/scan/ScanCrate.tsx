"use client";
import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type Transition,
} from "framer-motion";
import clsx from "clsx";
import {
  CRATE_Z,
  CrateBack,
  CrateFigure,
  CrateLayer,
  CrateSlats,
  u,
} from "@/src/components/graphics/Crate";
import { CRATE } from "@/src/components/graphics/crate-geometry";
import {
  DURATION,
  EASE_IN,
  EASE_OUT,
  SPRING_SETTLE,
} from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { sourcesRead, type CrateFill } from "./crate-fill";
import { usePacedRecords } from "./usePacedRecords";

// Set piece A (brief §4.4 A): one empty crate. Each source read slides a plain
// record in along the front slat and drops it in behind; the record tops fill
// the crate from the slat back toward the rail.

// The floor the record tops fill: from the front slat back to the back rail.
const FLOOR_TOP = CRATE.BACK_TOP;
const FLOOR_H = CRATE.SLAT_1 - CRATE.BACK_TOP;

/** A record top's x span at depth y, narrowing toward the back like the dividers. */
function span(y: number): [number, number] {
  const inset = (CRATE.FRONT_TOP - y) * CRATE.PERSPECTIVE + CRATE.STACK_INSET;
  return [CRATE.CARD_X + inset, CRATE.CARD_X + CRATE.CARD_W - inset];
}

// Pre-rendered once: a full crate of record tops, revealed from the front.
const [FRONT_L, FRONT_R] = span(CRATE.SLAT_1);
const [BACK_L, BACK_R] = span(FLOOR_TOP);
const FRONT_W = FRONT_R - FRONT_L;
// Also the empty crate's well: one perspective from the slat to the rail, so its
// sides run with the crate's.
const FLOOR = `M${FRONT_L} ${CRATE.SLAT_1}H${FRONT_R}L${BACK_R} ${FLOOR_TOP}H${BACK_L}Z`;
const SIDES = `M${FRONT_L} ${CRATE.SLAT_1}L${BACK_L} ${FLOOR_TOP}M${FRONT_R} ${CRATE.SLAT_1}L${BACK_R} ${FLOOR_TOP}`;
const TOPS = (() => {
  let d = "";
  for (
    let y = CRATE.SLAT_1 - CRATE.HAIRLINE_AT;
    y > FLOOR_TOP;
    y -= CRATE.HAIRLINE_PITCH
  ) {
    const [l, r] = span(y);
    d += `M${l.toFixed(2)} ${y.toFixed(2)}H${r.toFixed(2)}`;
  }
  return d;
})();

/** The top record's edge at fill level v: as wide as the stack is that deep. */
const edgeScale = (v: number) =>
  1 - (2 * v * FLOOR_H * CRATE.PERSPECTIVE) / FRONT_W;

// A filed record is an LP as wide as the stack. It slides in standing DROP_U
// proud of the front slat, then drops behind it and is gone: the fill it joins
// is the record that stays.
const DROP_U = 40;
const HELD_TOP = CRATE.SLAT_1 - DROP_U;
const [HELD_L, HELD_R] = span(HELD_TOP);
const RECORD_W = HELD_R - HELD_L;
/** The drop, as a share of the record's own height (framer can't tween u). */
const DROP = `${(DROP_U / RECORD_W) * 100}%`;
/** The slide in has mostly settled (SPRING_SETTLE is ~92% there) when it drops. */
const DROP_AT = 0.3;
/** Reduced: the record fades in where it is held (120ms), then out again. */
const REDUCED_SHOW: Transition = {
  duration: 0.6,
  times: [0, 0.2, 0.8, 1],
  ease: "linear",
};

/** The title's counter and the fill move together (brief: 800ms EASE_OUT). */
const TICK: Transition = { duration: 0.8, ease: EASE_OUT };

export interface ScanCrateProps {
  fill: CrateFill;
  /** Playlists are being counted: the crate reports them as a progress bar. */
  counting: boolean;
  className?: string;
}

export function ScanCrate({ fill, counting, className }: ScanCrateProps) {
  const { reduced } = useMotionConfig();
  const records = usePacedRecords(sourcesRead(fill));

  // Mask by translate: the window's top edge is the fill line; the tops inside
  // are counter-shifted so they stay put while it rises.
  const level = useMotionValue(fill.level);
  const windowY = useTransform(level, (v) => `${(1 - v) * 100}%`);
  const topsY = useTransform(level, (v) => `${(v - 1) * 100}%`);
  const edgeX = useTransform(level, edgeScale);
  useEffect(() => {
    if (reduced) {
      level.jump(fill.level);
      return;
    }
    const controls = animate(level, fill.level, TICK);
    return () => controls.stop();
  }, [fill.level, level, reduced]);

  const progress = counting
    ? {
        role: "progressbar",
        "aria-label": "Playlists",
        "aria-valuemin": 0,
        "aria-valuemax": fill.total,
        "aria-valuenow": fill.done,
      }
    : { "aria-hidden": true };

  return (
    <div className={clsx("w-full", className)}>
      <CrateFigure {...progress}>
        <CrateLayer>
          <CrateBack />
          <path
            d={FLOOR}
            fill="color-mix(in oklab, var(--kraft) 72%, var(--hollow))"
          />
        </CrateLayer>

        <div
          className="absolute inset-x-0 overflow-hidden"
          style={{ top: u(FLOOR_TOP), height: u(FLOOR_H) }}
        >
          <motion.div
            data-crate-fill
            className="absolute inset-0 overflow-hidden"
            style={{ y: windowY }}
          >
            <motion.svg
              viewBox={`0 ${FLOOR_TOP} ${CRATE.WIDTH} ${FLOOR_H}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              style={{ y: topsY }}
            >
              <path d={FLOOR} fill="var(--rec-face)" />
              <path
                d={TOPS}
                fill="none"
                stroke="var(--rec-edge)"
                strokeWidth={CRATE.HAIRLINE}
              />
              <path
                d={SIDES}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </motion.svg>
            {/* The back record's top: the fill line, as wide as the stack there. */}
            <motion.span
              className="absolute top-0 h-px bg-ink-2"
              style={{ left: u(FRONT_L), width: u(FRONT_W), scaleX: edgeX }}
            />
          </motion.div>
        </div>

        {/* Cut at the front slat's top, so a record slides in along the slat
            (even past the crate's side) and drops in behind it. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 overflow-y-clip"
          style={{ height: u(CRATE.SLAT_1), zIndex: CRATE_Z.sleeve }}
        >
          {records.map((id) => (
            <motion.div
              key={id}
              data-record
              className="absolute border border-ink bg-rec-face"
              style={{
                left: u(HELD_L),
                top: u(HELD_TOP),
                width: u(RECORD_W),
                height: u(RECORD_W),
              }}
              initial={
                reduced
                  ? { opacity: 0 }
                  : { opacity: 0, x: 120, rotate: 6, y: "0%" }
              }
              animate={
                reduced
                  ? { opacity: [0, 1, 1, 0] }
                  : { opacity: 1, x: 0, rotate: 0, y: DROP }
              }
              transition={
                reduced
                  ? REDUCED_SHOW
                  : {
                      opacity: { duration: DURATION.reduced },
                      x: SPRING_SETTLE,
                      rotate: SPRING_SETTLE,
                      y: {
                        delay: DROP_AT,
                        duration: DURATION.state,
                        ease: EASE_IN,
                      },
                    }
              }
            />
          ))}
        </div>

        <CrateSlats />
      </CrateFigure>
    </div>
  );
}
