"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { TrackRow } from "@/src/components/design/TrackRow";
import { DURATION, EASE_IN, EASE_OUT } from "@/src/components/design/motion";
import { AlbumArt } from "@/src/components/graphics/AlbumArt";
import {
  CRATE_Z,
  CrateBack,
  CrateDivider,
  CrateFigure,
  CrateLayer,
  CrateSlats,
  CrateTab,
  u,
} from "@/src/components/graphics/Crate";
import { CRATE, crateLayout } from "@/src/components/graphics/crate-geometry";
import { Sleeve } from "@/src/components/graphics/Sleeve";
import { Tab, TemperatureKey } from "@/src/components/graphics/Tab";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import {
  crateKeyTarget,
  entranceSeen,
  markEntranceSeen,
  swipeStep,
} from "./flip";
import type { ShelfEntry } from "./shelf";
import { useMediaQuery } from "@/src/hooks/useMediaQuery";

const num = (n: number) => n.toLocaleString("en-US");
const catNo = (n: number) => String(n).padStart(2, "0");

// Travel in u, as a share of the 220u sleeve (framer can't tween calc()).
const PULL_FROM = `${(90 / CRATE.SLEEVE) * 100}%`;
const DROP_TO = `${(70 / CRATE.SLEEVE) * 100}%`;
const SLEEVE_LEFT = (CRATE.WIDTH - CRATE.SLEEVE) / 2;
// The pull starts once most dividers have settled (brief §4.4).
const PULL_DELAY = 0.3;
const STAMP_AFTER = 0.16;
// At the front or back, ‹ or › is dimmed but keeps focus (disabled would drop
// it to <body> mid-flip); pull() ignores a step past either end.
const END =
  "aria-disabled:cursor-default aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent";
// Two lines held for every name (a longer one ends in an ellipsis), so flips don't reflow.
const NAME =
  "line-clamp-2 min-h-[2lh] font-display text-title text-balance max-tab:text-lead";

export interface HomeCrateProps {
  /** Front (largest) to back, from buildShelf. Counts of 0 = just proposed: no stacks, no sticker. */
  entries: readonly ShelfEntry[];
}

/**
 * The home hero (brief §3 Home): the categories as dividers in one crate, the
 * pulled divider's sleeve with its price sticker, and under it the name and
 * the first three records. Flip with the tabs, ‹ ›, the arrow keys (one Tab
 * stop), or a sideways drag on the sleeve at phone width.
 */
export function HomeCrate({ entries }: HomeCrateProps) {
  const { reduced, settle } = useMotionConfig();
  const touch = useMediaQuery("(max-width: 720px)");
  const layout = useMemo(() => crateLayout(entries), [entries]);
  // By id, so fresh server data can't turn the pulled divider into another.
  const [pulledId, setPulledId] = useState<string | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  // Only flips that leave focus elsewhere (‹ ›, a swipe) need saying: a tab
  // that takes focus already speaks its own label.
  const [said, setSaid] = useState("");
  // Read once, on the client; the server's markup is the same either way
  // (every `initial` below is fixed), so only the timing differs.
  const [play] = useState(
    () => typeof window === "undefined" || !entranceSeen(),
  );
  useEffect(() => markEntranceSeen(), []);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragged = useRef(false);

  const cur = Math.max(
    0,
    entries.findIndex((e) => e.id === pulledId),
  );
  const current = entries[cur]!;
  const peeking = peek !== null && peek !== cur ? entries[peek] : undefined;
  const placed = entries.some((e) => e.count > 0);
  // Room for three records (a TrackRow is 52px: 44px art + py-1) under every
  // divider, so a flip never moves the page.
  const anyRecords = entries.some((e) => e.records.length > 0);
  const atFront = cur === 0;
  const atBack = cur === entries.length - 1;

  function pull(i: number, say = false) {
    if (i === cur || i < 0 || i >= entries.length) return;
    const e = entries[i]!;
    setPulledId(e.id);
    setFlipped(true);
    setSaid(say ? `${catNo(e.catalogueNo)} ${e.name}` : "");
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!(e.target instanceof HTMLElement) || !e.target.dataset.crateTab)
      return;
    const to = crateKeyTarget(e.key, cur, entries.length);
    if (to === null) return;
    e.preventDefault();
    pull(to);
    tabRefs.current[to]?.focus();
  }

  // Entrance: dividers settle back first, then the sleeve rises from behind
  // the slats. Seen already this session: everything is simply there.
  const settleIn = (settleIndex: number): Transition =>
    !play
      ? { duration: 0 }
      : reduced
        ? { duration: DURATION.reduced }
        : { duration: 0.36, ease: EASE_OUT, delay: settleIndex * 0.009 };
  const sleeveIn: Transition = reduced
    ? { duration: flipped || play ? DURATION.reduced : 0 }
    : flipped
      ? { ...settle, opacity: { duration: DURATION.hover, ease: EASE_OUT } }
      : play
        ? { duration: DURATION.scene, ease: EASE_OUT, delay: PULL_DELAY }
        : { duration: 0 };
  const stampDelay = flipped
    ? STAMP_AFTER
    : play
      ? PULL_DELAY + STAMP_AFTER
      : 0;

  return (
    <figure
      aria-label={`Your ${entries.length} ${entries.length === 1 ? "category" : "categories"} as dividers in a record crate${placed ? ", largest at the front" : ""}`}
      className="w-full max-w-[440px] justify-self-center desk:justify-self-end"
    >
      <CrateFigure
        role="group"
        aria-label="Flip through categories"
        onKeyDown={onKeyDown}
        onPointerLeave={() => setPeek(null)}
      >
        <CrateLayer>
          <CrateBack />
          {[...layout].reverse().map((d) => (
            <CrateDivider
              key={d.entry.id}
              divider={d}
              temperature={d.entry.temperature}
              current={d.entry.id === current.id}
              initial={{ opacity: 0, y: -18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={settleIn(d.settle)}
            />
          ))}
        </CrateLayer>
        {layout.map((d, i) => {
          const e = d.entry;
          const on = e.id === current.id;
          return (
            <CrateTab key={e.id} divider={d}>
              <motion.div
                initial={{ opacity: 0, y: "-100%" }}
                animate={{ opacity: 1, y: 0 }}
                transition={settleIn(d.settle)}
              >
                <button
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  data-crate-tab="true"
                  tabIndex={!touch && on ? 0 : -1}
                  aria-pressed={on}
                  aria-label={`${catNo(e.catalogueNo)} ${e.name}${e.count > 0 ? `, ${num(e.count)} ${e.count === 1 ? "track" : "tracks"}` : ""}`}
                  onClick={() => pull(i)}
                  onPointerEnter={(ev) => {
                    if (ev.pointerType === "mouse") setPeek(i);
                  }}
                  // Off the tab (onto the sleeve, say), the preview would misname what's under the pointer.
                  onPointerLeave={() => setPeek((p) => (p === i ? null : p))}
                  // A slightly taller target than the 18u tab; phones use ‹ › and the sleeve.
                  className="group relative block w-full after:absolute after:inset-x-[-2px] after:-top-1 after:bottom-0 after:content-[''] max-tab:pointer-events-none"
                >
                  <Tab
                    catalogueNo={e.catalogueNo}
                    temperature={e.temperature}
                    size="crate"
                    reversed={on}
                    className={
                      on
                        ? undefined
                        : "group-hover:[transform:translateY(calc(-3*var(--u)))]"
                    }
                  />
                </button>
              </motion.div>
            </CrateTab>
          );
        })}
        <div
          className="absolute"
          style={{
            left: u(SLEEVE_LEFT),
            top: u(CRATE.SLEEVE_TOP),
            width: u(CRATE.SLEEVE),
            height: u(CRATE.SLEEVE),
            zIndex: CRATE_Z.sleeve,
          }}
        >
          <AnimatePresence mode={reduced ? "sync" : "wait"}>
            <motion.div
              key={current.id}
              className="absolute inset-0"
              initial={{ opacity: 0, y: PULL_FROM }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduced
                  ? { opacity: 0, transition: { duration: DURATION.reduced } }
                  : {
                      opacity: 0,
                      y: DROP_TO,
                      transition: { duration: 0.2, ease: EASE_IN },
                    }
              }
              transition={sleeveIn}
              drag={touch ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onPointerDown={() => {
                dragged.current = false;
              }}
              onDragStart={() => {
                dragged.current = true;
              }}
              onDragEnd={(_, info) =>
                pull(cur + swipeStep(info.offset.x, info.velocity.x), true)
              }
            >
              <Link
                href={`/review#${current.id}`}
                aria-label={`Open ${current.name} in Categories`}
                draggable={false}
                onClick={(ev: MouseEvent) => {
                  if (dragged.current) ev.preventDefault();
                  dragged.current = false;
                }}
                className="block h-full w-full -rotate-[1.2deg] border-[1.5px] border-ink bg-card"
              >
                <Sleeve
                  spec={current.spec}
                  size={CRATE.SLEEVE}
                  className="block h-full w-full"
                />
                {current.count > 0 && (
                  <motion.span
                    aria-hidden="true"
                    className="num absolute rounded-[3px] border border-ink bg-card text-right font-mono leading-[1.15] text-ink"
                    style={{
                      right: u(10),
                      top: u(12),
                      padding: `${u(5)} ${u(9)} ${u(4)}`,
                      fontSize: `max(11px, ${u(13)})`,
                    }}
                    initial={{ opacity: 0, rotate: 12, scale: 0.92 }}
                    animate={{ opacity: 1, rotate: 4, scale: 1 }}
                    // Gone before the caption names the next divider: a count never sits by the wrong name.
                    exit={{ opacity: 0, transition: { duration: 0 } }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            duration: DURATION.state,
                            ease: EASE_OUT,
                            delay: stampDelay,
                          }
                    }
                  >
                    <b
                      className="block font-medium tracking-[-0.01em]"
                      style={{ fontSize: `max(15px, ${u(19)})` }}
                    >
                      {num(current.count)}
                    </b>
                    {current.count === 1 ? "track" : "tracks"}
                  </motion.span>
                )}
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
        <CrateSlats>
          <TemperatureKey />
        </CrateSlats>
      </CrateFigure>

      <figcaption className="mt-4 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-x-2">
        <Button
          variant="icon"
          aria-label="Previous category (larger)"
          aria-disabled={atFront}
          className={END}
          onClick={() => pull(cur - 1, true)}
        >
          <ChevronLeft strokeWidth={1.75} />
        </Button>
        {/* Number over name at every width, and two lines kept for the name,
            so ‹ › and the records below hold still through a flip. */}
        <div className="grid min-w-0 text-center">
          <p
            className={clsx(
              "[grid-area:1/1]",
              peeking && "pointer-events-none opacity-0",
            )}
          >
            <Link
              href={`/review#${current.id}`}
              className="group inline-flex flex-col items-center no-underline"
            >
              <span className="mono text-ink-3">
                {catNo(current.catalogueNo)}
              </span>{" "}
              <span
                className={clsx(
                  NAME,
                  "group-hover:underline group-hover:decoration-2 group-hover:underline-offset-[5px]",
                )}
              >
                {current.name}
              </span>
            </Link>
          </p>
          {peeking && (
            <p
              data-testid="crate-peek"
              aria-hidden="true"
              className="flex flex-col items-center text-ink-2 [grid-area:1/1]"
            >
              <span className="mono text-ink-3">
                {catNo(peeking.catalogueNo)}
              </span>{" "}
              <span className={NAME}>{peeking.name}</span>
            </p>
          )}
        </div>
        <Button
          variant="icon"
          aria-label="Next category (smaller)"
          aria-disabled={atBack}
          className={END}
          onClick={() => pull(cur + 1, true)}
        >
          <ChevronRight strokeWidth={1.75} />
        </Button>
        <p role="status" className="sr-only">
          {said}
        </p>
        {anyRecords && (
          // Dimmed while another tab is previewed, so the records never read as its own.
          <div
            data-dimmed={peeking ? "true" : undefined}
            className="col-span-3 mt-2 min-h-[156px] px-3 transition-opacity duration-180 ease-out data-dimmed:opacity-30"
          >
            {current.records.length > 0 && (
              <motion.ul
                key={current.id}
                aria-label={`Tracks in ${current.name}`}
                initial={flipped ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? DURATION.reduced : 0.16 }}
              >
                {current.records.map((r) => (
                  <TrackRow
                    key={r.id}
                    title={r.title}
                    artist={r.artist}
                    href={`spotify:track:${r.id}`}
                    media={<AlbumArt trackId={r.id} size={44} link={false} />}
                  />
                ))}
              </motion.ul>
            )}
          </div>
        )}
      </figcaption>
    </figure>
  );
}
