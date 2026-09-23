"use client";
import { useState, type ReactNode } from "react";
import { motion, type Transition } from "framer-motion";
import clsx from "clsx";
import { DURATION, EASE_IN, EASE_OUT } from "@/src/components/design/motion";
import { PlainSleeve } from "@/src/components/graphics/PlainSleeve";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

export interface SourceRowProps {
  name: string;
  checked: boolean;
  onToggle: () => void;
  onPreview: () => void;
  /** The playlist's own image; without it (or if it fails) a plain sleeve. */
  cover?: string | null;
  /** Printed on the sleeve instead of any cover (Liked Songs' heart). */
  glyph?: ReactNode;
  /** "12 tracks". Without it the preview button just says Preview. */
  count?: string;
  /** Seconds before the row fades in on first paint. */
  enterDelay: number;
  /** Seconds before a checked-state change shows: the bulk top-down sweep. */
  changeDelay: number;
  /** Holds the box still (a save is in flight); the row keeps its look. */
  disabled?: boolean;
}

interface Timing {
  duration: number;
  ease: typeof EASE_OUT | typeof EASE_IN;
  delay: number;
}

/**
 * One timing for the stamp, the cover and the name, so a row changes as one:
 * a stamp lands (expo out) and lifts (quicker, ease in), after the bulk
 * sweep's delay. Reduced motion: a short fade, no sweep.
 */
function stampTiming(checked: boolean, delay: number, reduced: boolean): Timing {
  if (reduced) return { duration: DURATION.reduced, ease: EASE_OUT, delay: 0 };
  return checked
    ? { duration: DURATION.hover, ease: EASE_OUT, delay }
    : { duration: DURATION.reduced, ease: EASE_IN, delay };
}

/** One source as a ruled line: stamped box, cover, name, track count. */
export function SourceRow({
  name,
  checked,
  onToggle,
  onPreview,
  cover,
  glyph,
  count,
  enterDelay,
  changeDelay,
  disabled = false,
}: SourceRowProps) {
  const { item, spring, reduced } = useMotionConfig();
  const timing = stampTiming(checked, changeDelay, reduced);
  return (
    <motion.li
      variants={item}
      initial="hidden"
      animate="visible"
      transition={{ ...spring, delay: enterDelay }}
      className="flex items-center gap-3 border-b border-rule tab:gap-4"
    >
      {/* The label is what toggles; the count beside it opens the preview. */}
      <label
        className={clsx(
          "group flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 tab:gap-4",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="peer sr-only"
        />
        <StampBox checked={checked} timing={timing} reduced={reduced} />
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: checked ? 1 : 0.4 }}
          transition={timing}
          className="shrink-0"
        >
          <Cover cover={cover} glyph={glyph} />
        </motion.span>
        <span
          className={clsx(
            "truncate text-body font-semibold decoration-[1.5px] underline-offset-4 transition-[color] tab:text-lead",
            checked ? "text-ink" : "text-ink-3",
            !disabled && "group-hover:underline",
          )}
          // Inks with its stamp, on the stamp's curve, not ahead of it.
          style={{
            transitionDuration: `${timing.duration}s`,
            transitionTimingFunction: `cubic-bezier(${timing.ease.join(", ")})`,
            transitionDelay: `${timing.delay}s`,
          }}
          title={name}
        >
          {name}
        </span>
      </label>
      {/* A plain count, not 41 identical underlines: it underlines on its own
          hover and focus. */}
      <button
        type="button"
        onClick={onPreview}
        // Contains the visible text, so voice control can still "click 12 tracks".
        aria-label={count ? `Preview ${name}, ${count}` : `Preview ${name}`}
        className="num inline-flex min-h-11 shrink-0 cursor-pointer items-center text-sm font-medium whitespace-nowrap text-ink-2 underline decoration-transparent decoration-[1.5px] underline-offset-4 transition-[color,text-decoration-color] duration-180 ease-out hover:text-ink hover:decoration-ink focus-visible:text-ink focus-visible:decoration-ink"
      >
        {count ?? "Preview"}
      </button>
    </motion.li>
  );
}

/**
 * The Include / Leave out mark: a printed box, and an ink stamp that lands in
 * it 2px out of register (the primary button's keyline, in miniature).
 */
function StampBox({
  checked,
  timing,
  reduced,
}: {
  checked: boolean;
  timing: Timing;
  reduced: boolean;
}) {
  // Pressed down: lands from a little above the paper. Lifted: fades in place,
  // then resets its scale out of sight for the next press.
  const lift: Transition = {
    opacity: timing,
    scale: { duration: 0, delay: timing.delay + timing.duration },
  };
  return (
    <span
      aria-hidden
      data-stamp={checked ? "in" : "out"}
      className="relative size-[22px] shrink-0 rounded-[2px] border-[1.5px] border-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink peer-focus-visible:outline-solid"
    >
      <motion.svg
        viewBox="0 0 22 22"
        className="absolute -inset-[1.5px] size-[22px] translate-[2px]"
        initial={false}
        animate={
          checked
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: reduced ? 1 : 1.3 }
        }
        transition={checked ? timing : lift}
      >
        <rect width="22" height="22" rx="2" fill="var(--ink)" />
        <path
          d="M5.5 11.5 9.25 15.25 16.5 7.25"
          fill="none"
          stroke="var(--paper)"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </span>
  );
}

/** 40px (36 on a phone), 1px ink keyline. A cover that fails to load prints
 *  the plain sleeve. */
function Cover({ cover, glyph }: Pick<SourceRowProps, "cover" | "glyph">) {
  const [failed, setFailed] = useState<string | null>(null);
  if (glyph) {
    return (
      <span className="grid size-9 place-items-center border border-ink bg-paper-deep text-ink-2 tab:size-10">
        {glyph}
      </span>
    );
  }
  if (!cover || failed === cover)
    return <PlainSleeve size={40} className="size-9 tab:size-10" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Spotify CDN art, any host
    <img
      src={cover}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(cover)}
      className="block size-9 border border-ink bg-paper-deep object-cover tab:size-10"
    />
  );
}
