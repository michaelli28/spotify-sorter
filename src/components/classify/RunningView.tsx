"use client";
import { useState, type CSSProperties } from "react";
import { orderBySize } from "@/src/components/graphics/crate-geometry";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";
import { effectiveTemperature } from "@/src/lib/sleeves/lexicon";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import { PageShell } from "@/src/components/design/PageShell";
import { FilingCrate, FILING_HEIGHT, type FilingEntry } from "./FilingCrate";
import { filingScale, placedCounts, projectedScale } from "./filing";
import { useFiling } from "./useFiling";
import type { Library } from "./useClassifyRun";

interface Setup {
  /** Front to back, largest first when the run began. */
  order: FilingEntry[];
  counts: Record<string, number>;
  perU: number;
  unsorted: number;
}

function setUp(library: Library): Setup {
  const { confidence_threshold } = library.config;
  const counts = placedCounts(library, confidence_threshold);
  const order = orderBySize(
    Object.entries(library.categories).map(([id, c], i) => ({
      id,
      catalogueNo: i + 1,
      name: c.name,
      temperature: effectiveTemperature({ id, ...c }),
      count: counts[id] ?? 0,
    })),
  );
  const unsorted = unsortedTrackIds(library).length;
  const sorted = Object.keys(library.tracks).length - unsorted;
  return {
    order,
    counts,
    perU: projectedScale(
      order.map((e) => e.count),
      { sorted, unsorted },
    ),
    unsorted,
  };
}

// The crate is 440 × FILING_HEIGHT u, sized to the height the viewport leaves
// under the nav and strip (~15rem beside the title, ~22rem under it), so the
// whole crate is on screen while its counts tick. Full width at 1200px would
// be ~1,150px tall.
const CRATE_ASPECT = 440 / FILING_HEIGHT;

/**
 * Set piece B while the paid run streams: the title, and the crate filing the
 * library into its 41 dividers. The progress itself sits in the top strip.
 */
export function RunningView({
  library,
  batchesDone,
}: {
  library: Library;
  batchesDone: number;
}) {
  const { reduced } = useMotionConfig();
  const [setup] = useState(() => setUp(library));
  const filing = useFiling({
    initial: setup.counts,
    batchesDone,
    reduced,
  });
  // The order holds for the run, so only counts and stacks move while tabs
  // tick. A first run starts with every count at 0, in catalogue order, so
  // the first report files it largest first, once.
  const [order, setOrder] = useState(setup.order);
  const [filed, setFiled] = useState(() => order.some((e) => e.count > 0));
  if (!filed && Object.values(filing.target).some((n) => n > 0)) {
    setFiled(true);
    setOrder(
      orderBySize(
        order.map((e) => ({ ...e, count: filing.target[e.id] ?? 0 })),
      ),
    );
  }
  const entries = order.map((e) => ({
    ...e,
    count: filing.shown[e.id] ?? 0,
  }));
  const perU = filingScale(
    entries.map((e) => e.count),
    setup.perU,
  );

  return (
    <PageShell>
      <div
        className="grid items-start gap-y-8 desk:grid-cols-[minmax(16rem,1fr)_minmax(27.5rem,var(--crate-w))] desk:gap-x-16"
        style={
          {
            "--crate-w": `calc((100dvh - 15rem) * ${CRATE_ASPECT})`,
            // Stacked under the title, it also leaves the title's room.
            "--crate-w-stacked": `max(20rem, calc((100dvh - 22rem) * ${CRATE_ASPECT}))`,
          } as CSSProperties
        }
      >
        <header>
          <h1 className="font-display text-display-2 text-ink">
            Listening through your library…
          </h1>
          <p className="mt-4 text-lead text-ink-2">
            <span className="num">
              {setup.unsorted.toLocaleString("en-US")}
            </span>{" "}
            {setup.unsorted === 1 ? "track" : "tracks"} to sort.
          </p>
        </header>
        <div className="w-full max-desk:max-w-[var(--crate-w-stacked)]">
          {/* Re-filed once: the dividers settle again in their new order. */}
          <FilingCrate
            key={filed ? "filed" : "catalogue"}
            entries={entries}
            bumps={filing.bumps}
            perU={perU}
            reduced={reduced}
          />
        </div>
      </div>
    </PageShell>
  );
}
