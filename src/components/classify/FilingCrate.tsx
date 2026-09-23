"use client";
import { useEffect, type CSSProperties } from "react";
import { motion, useAnimate } from "framer-motion";
import {
  CrateBack,
  CrateDivider,
  CrateFigure,
  CrateSlats,
  CrateTab,
  u,
} from "@/src/components/graphics/Crate";
import {
  CRATE,
  crateLayout,
  type DividerLayout,
} from "@/src/components/graphics/crate-geometry";
import { Tab, TemperatureKey } from "@/src/components/graphics/Tab";
import {
  DURATION,
  EASE_OUT,
  SPRING_SNAP,
} from "@/src/components/design/motion";
import type { Temperature } from "@/src/lib/sleeves/temperature";
import { Count } from "./Count";
import { tabCount } from "./filing";

export interface FilingEntry {
  id: string;
  catalogueNo: number;
  name: string;
  temperature: Temperature;
  count: number;
}

// Home pulls a sleeve up in front of the front divider; nothing is pulled
// here, so the crate stops a short card-face below it and the slats follow.
const FACE = 20;
const SLAT_TOP = CRATE.FRONT_TOP + FACE;
const SLATS = 2 * CRATE.SLAT_H + CRATE.SLAT_GAP;
/** The cropped crate's height in u. */
export const FILING_HEIGHT = SLAT_TOP + SLATS;
// The sides meet the slats at SLAT_TOP instead of SLAT_1: squash the back's
// drawing toward its rail, which stays where it is.
const SIDES = (SLAT_TOP - CRATE.BACK_Y) / (CRATE.SLAT_1 - CRATE.BACK_Y);

// A tab holds its catalogue number and its count in one row with a gap, so
// the two can't touch. The number is the tab's identity, printed a shade
// lighter than the count (the thing that moves); 78% keeps it over 4.5:1 on
// the dusk tint. Tab draws the card and prints the row in place of its number.
const ROW: CSSProperties = { paddingInline: u(4), columnGap: u(4) };
const NUMBER: CSSProperties = {
  fontSize: "max(11px, calc(11 * var(--u)))",
  color: "color-mix(in oklab, var(--tab-ink) 78%, transparent)",
};
const COUNT: CSSProperties = { fontSize: "max(11px, calc(10.5 * var(--u)))" };
// Under 30rem of crate (--u < 1.1, a phone) the fonts sit at their 11px floor
// and a number plus "1,442" is wider than the back tab: the count prints
// alone and the number stays in the tab's title. Keyed to the crate's own
// width, not the viewport's: a short tablet window draws a phone-sized crate.
const NARROW_HIDDEN = "@max-[30rem]:hidden";

/**
 * Set piece B (brief §4.4): the crate the run files into. Dividers stand in a
 * fixed order for the whole run, so only counts and stack depths move; a
 * divider's tab bumps each time its count prints. No song is ever named.
 */
export function FilingCrate({
  entries,
  bumps,
  perU,
  reduced,
}: {
  /** Front to back, fixed for the run. */
  entries: readonly FilingEntry[];
  bumps: Readonly<Record<string, number>>;
  /** Tracks per u, held for the run so stacks grow into the crate. */
  perU: number;
  reduced: boolean;
}) {
  const layout = crateLayout(entries, { perU });
  const settle = (d: DividerLayout<FilingEntry>) =>
    reduced
      ? { duration: DURATION.reduced }
      : { duration: 0.36, ease: EASE_OUT, delay: d.settle * 0.009 };

  return (
    <CrateFigure
      role="img"
      // The strip carries the progress; the tab counts are playlist adds, not
      // tracks, so the label doesn't sum them.
      aria-label={`${entries.length} categories, filling as tracks are sorted`}
      style={{ height: u(FILING_HEIGHT) }}
    >
      <svg
        viewBox={`0 0 ${CRATE.WIDTH} ${FILING_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <g
          transform={`translate(0 ${CRATE.BACK_Y}) scale(1 ${SIDES}) translate(0 ${-CRATE.BACK_Y})`}
        >
          <CrateBack />
        </g>
        {[...layout].reverse().map((d) => (
          <CrateDivider
            key={d.entry.id}
            divider={d}
            temperature={d.entry.temperature}
            initial={{ opacity: 0, y: reduced ? 0 : -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={settle(d)}
          />
        ))}
      </svg>
      {layout.map((d) => (
        <CrateTab
          key={d.entry.id}
          divider={d}
          title={`${String(d.entry.catalogueNo).padStart(2, "0")} ${d.entry.name}`}
        >
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            transition={settle(d)}
          >
            <FilingTab
              entry={d.entry}
              bumps={bumps[d.entry.id] ?? 0}
              reduced={reduced}
            />
          </motion.div>
        </CrateTab>
      ))}
      {/* CrateSlats sit at SLAT_1; lift them to where this crate ends. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ transform: `translateY(${u(SLAT_TOP - CRATE.SLAT_1)})` }}
      >
        <CrateSlats>
          <div className="flex items-center gap-x-5 max-tab:gap-x-3">
            <TabLegend />
            <TemperatureKey className="max-tab:text-[11px]" />
          </div>
        </CrateSlats>
      </div>
    </CrateFigure>
  );
}

/** What a tab's two numbers are: the key's neighbour on the slat. */
function TabLegend() {
  return (
    <i
      aria-hidden
      className="inline-flex h-[1.4em] items-center gap-[0.6em] rounded-t-[2px] border border-b-0 bg-tab-stock px-[0.5em] font-mono text-[0.8rem] leading-none not-italic max-tab:text-[11px]"
    >
      <span className={NARROW_HIDDEN} style={{ color: NUMBER.color }}>
        no.
      </span>
      <span className="font-semibold text-tab-ink">tracks</span>
    </i>
  );
}

function FilingTab({
  entry,
  bumps,
  reduced,
}: {
  entry: FilingEntry;
  bumps: number;
  reduced: boolean;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  // Each print lifts the tab 4u (its height is 18u) and snaps it back.
  useEffect(() => {
    if (bumps === 0 || reduced || !scope.current) return;
    void animate(scope.current, { y: ["-22%", "0%"] }, SPRING_SNAP);
  }, [bumps, reduced, animate, scope]);

  return (
    <div ref={scope}>
      <Tab
        catalogueNo={entry.catalogueNo}
        temperature={entry.temperature}
        size="crate"
      >
        <span
          className="flex h-full w-full items-center justify-between @max-[30rem]:justify-center"
          style={ROW}
        >
          <span className={NARROW_HIDDEN} style={NUMBER}>
            {String(entry.catalogueNo).padStart(2, "0")}
          </span>
          {/* A category nothing has landed in yet prints no count: 41 zeros
              would be 41 identical marks. */}
          {entry.count > 0 && (
            <span className="num font-semibold text-tab-ink" style={COUNT}>
              <Count value={entry.count} format={tabCount} />
            </span>
          )}
        </span>
      </Tab>
    </div>
  );
}
