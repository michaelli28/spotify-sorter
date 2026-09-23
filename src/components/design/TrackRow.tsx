import type { ReactNode } from "react";
import clsx from "clsx";

export interface TrackRowProps {
  /** 1-based position. Omit it for every row in a list, or for none. */
  index?: number;
  title: string;
  artist: string;
  /** Makes the title a link (e.g. a spotify: URI). */
  href?: string;
  /** A control at the row's end. Keep it one width across a list. */
  trailing?: ReactNode;
  className?: string;
}

// Written out whole so Tailwind can see each class.
const COLUMNS: Record<`${boolean}-${boolean}`, string> = {
  "true-true": "grid-cols-[2rem_minmax(0,3fr)_minmax(0,2fr)_auto]",
  "true-false": "grid-cols-[2rem_minmax(0,3fr)_minmax(0,2fr)]",
  "false-true": "grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]",
  "false-false": "grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
};

/**
 * One track as a liner-notes line: a fixed index column, the title in cream,
 * the artist in secondary. Fractional columns rather than content widths, so
 * every row in a list lines up. Render inside an <ol> or <ul>.
 */
export function TrackRow({
  index,
  title,
  artist,
  href,
  trailing,
  className,
}: TrackRowProps) {
  const numbered = index !== undefined;
  return (
    <li
      className={clsx(
        "grid items-baseline gap-x-4 py-1.5 text-sm",
        COLUMNS[`${numbered}-${trailing !== undefined}`],
        className,
      )}
    >
      {numbered && (
        <span className="text-right font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]">
          {String(index).padStart(2, "0")}
        </span>
      )}
      {href ? (
        <a
          href={href}
          className="truncate text-[var(--color-text-primary)] hover:underline"
        >
          {title}
        </a>
      ) : (
        <span className="truncate text-[var(--color-text-primary)]">
          {title}
        </span>
      )}
      <span className="truncate text-[var(--color-text-secondary)]">
        {artist}
      </span>
      {trailing}
    </li>
  );
}
