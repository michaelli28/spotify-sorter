"use client";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { EASE_OUT_EXPO, useMotionConfig } from "@/src/hooks/useMotionConfig";

export interface SourceRowProps {
  name: string;
  checked: boolean;
  onToggle: () => void;
  onPreview: () => void;
  /** Cover art; without it the sleeve shows `glyph` or the name's initial. */
  cover?: string | null;
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

/** One source as a printed line: box, sleeve, name, track count. */
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
  const { item, spring, fade, reduced } = useMotionConfig();
  return (
    <motion.li
      variants={item}
      initial="hidden"
      animate="visible"
      transition={{ ...spring, delay: enterDelay }}
      className="flex items-center gap-2"
    >
      {/* The hover tint covers only what toggles; the count opens the preview. */}
      <label
        className={clsx(
          "relative flex min-h-14 min-w-0 flex-1 items-center gap-4 px-3 py-2 transition-colors duration-200",
          disabled
            ? "cursor-default"
            : "cursor-pointer hover:bg-[var(--color-bg-surface)]",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          // scroll-mb: Tab scrolls the row clear of the fixed ActionBar.
          className="peer sr-only scroll-mb-28"
        />
        <span
          aria-hidden
          className="grid size-4 shrink-0 place-items-center border border-[var(--color-border-strong)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--color-accent)]"
        >
          <svg viewBox="0 0 16 16" className="size-3.5">
            {/* Drawn on check, gone at once on uncheck; not drawn on load. */}
            <motion.path
              d="M3 8.5 6.5 12 13 4.5"
              fill="none"
              stroke="var(--color-text-secondary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{
                pathLength: checked ? 1 : 0,
                opacity: checked ? 1 : 0,
              }}
              transition={
                checked && !reduced
                  ? { duration: 0.18, ease: EASE_OUT_EXPO, delay: changeDelay }
                  : { duration: 0 }
              }
            />
          </svg>
        </span>
        <motion.span
          initial={false}
          animate={{ opacity: checked ? 1 : 0.4 }}
          transition={{ ...fade, delay: reduced ? 0 : changeDelay }}
          className="flex min-w-0 items-center gap-4"
        >
          <Sleeve name={name} cover={cover} glyph={glyph} />
          <span
            className="truncate text-[var(--color-text-primary)]"
            title={name}
          >
            {name}
          </span>
        </motion.span>
      </label>
      <Button
        variant="ghost"
        size="sm"
        onClick={onPreview}
        // Contains the visible text, so voice control can still "click 12 tracks".
        aria-label={count ? `Preview ${name}, ${count}` : `Preview ${name}`}
        className="mr-3 shrink-0 cursor-pointer scroll-mb-28 tabular-nums max-lg:py-3"
      >
        {count ?? "Preview"}
      </Button>
    </motion.li>
  );
}

function Sleeve({
  name,
  cover,
  glyph,
}: Pick<SourceRowProps, "name" | "cover" | "glyph">) {
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element -- Spotify CDN art, any host
    return <img src={cover} alt="" className="size-10 shrink-0 object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center bg-[var(--color-bg-elevated)] font-[family-name:var(--font-display)] text-lg text-[var(--color-text-tertiary)]"
    >
      {glyph ?? Array.from(name.trim())[0]}
    </span>
  );
}
