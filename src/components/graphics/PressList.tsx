"use client";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { EASE_OUT } from "@/src/components/design/motion";
import type { SleeveSpec } from "@/src/lib/sleeves/spec";
import { Sleeve } from "./Sleeve";

export interface PressRow {
  id: string;
  catalogueNo: number;
  name: string;
  count: number;
  spec: SleeveSpec;
  /** Where the row links. Default `/review#<id>`; null = not a link. */
  href?: string | null;
}

export interface PressListProps {
  /** In the crate's order, largest first (`orderBySize`). The list does not re-sort. */
  rows: readonly PressRow[];
  /** The bar scale's full length. Default: the largest count (1,442 on the real library). A count of 0 draws no bar. */
  max?: number;
  /** Ids already on Spotify. A row is marked only while some, not all, are (a mark must differ).
   *  A Set crosses from a server component. */
  onSpotify?: ReadonlySet<string>;
  /** Rows shown on phones (≤720px) before "Show all N". */
  phoneLimit?: number;
  /** Replaces the 36px sleeve (the apply credits print theirs in). */
  renderSleeve?: (row: PressRow, index: number) => ReactNode;
  /** A line under the row (the apply credits' per-row state). */
  renderTrailing?: (row: PressRow, index: number) => ReactNode;
  className?: string;
}

const ROW =
  "grid grid-cols-[36px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 py-2.5";

/**
 * "What Apply writes" (brief §3 Home, §4.2): the crate's legend, one row per playlist
 * with its sleeve, catalogue number, name, count and a bar growing from the left
 * (scaleX = count / max). Shared by home and apply.
 */
export function PressList({
  rows,
  max,
  onSpotify,
  phoneLimit = 12,
  renderSleeve,
  renderTrailing,
  className,
}: PressListProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const scale = max ?? Math.max(1, ...rows.map((r) => r.count));
  const onCount = onSpotify
    ? rows.filter((r) => onSpotify.has(r.id)).length
    : 0;
  const marks = onCount > 0 && onCount < rows.length;

  return (
    <div className={className}>
      <ol
        id={listId}
        className="columns-1 gap-x-12 min-[721px]:columns-2 min-[1101px]:columns-3"
      >
        {rows.map((row, k) => {
          const body = (
            <>
              {renderSleeve ? (
                renderSleeve(row, k)
              ) : (
                <Sleeve
                  spec={row.spec}
                  size={36}
                  className="row-span-2 block self-center border border-[var(--ink)]"
                />
              )}
              <span className="min-w-0 truncate font-medium group-hover:underline group-hover:decoration-[1.5px] group-hover:underline-offset-4">
                <span className="mr-2 font-[family-name:var(--font-mono)] text-[0.8rem] tracking-[0.02em] text-[var(--ink-3)]">
                  {String(row.catalogueNo).padStart(2, "0")}
                </span>
                {row.name}
              </span>
              <span className="font-semibold tabular-nums">
                {row.count.toLocaleString("en-US")}
              </span>
              {(row.count > 0 || marks) && (
                // While marks show, every row reserves the mark's slot after
                // its bar, so all bars keep the same room and scale.
                <span
                  className={clsx(
                    "col-[2/4] grid items-center gap-x-3",
                    marks && "grid-cols-[minmax(0,1fr)_10.5ch]",
                  )}
                >
                  {row.count > 0 ? (
                    <motion.span
                      data-bar
                      aria-hidden="true"
                      className="block h-1.5 origin-left bg-[var(--ink)]"
                      initial={{ scaleX: 0 }}
                      // A floor keeps the smallest real count visible; a count past `max` stops at full length.
                      animate={{
                        scaleX: Math.min(Math.max(row.count / scale, 0.006), 1),
                      }}
                      transition={{
                        duration: 0.48,
                        ease: EASE_OUT,
                        delay: Math.min(k, 14) * 0.012 + 0.12,
                      }}
                    />
                  ) : (
                    <span />
                  )}
                  {marks && (
                    // Negative margins: the mark sits on the bar's line without
                    // making a marked row taller than its neighbours.
                    <span className="mono -my-1.5 text-right leading-none whitespace-nowrap text-success">
                      {onSpotify?.has(row.id) ? "on Spotify" : null}
                    </span>
                  )}
                </span>
              )}
              {renderTrailing && (
                <span className="col-[2/4] min-w-0">
                  {renderTrailing(row, k)}
                </span>
              )}
            </>
          );
          return (
            <li
              key={row.id}
              className={clsx(
                "break-inside-avoid border-b border-[var(--rule)]",
                !open && k >= phoneLimit && "max-[720px]:hidden",
              )}
            >
              {row.href === null ? (
                <div className={ROW}>{body}</div>
              ) : (
                <Link
                  href={row.href ?? `/review#${row.id}`}
                  className={clsx(ROW, "group no-underline")}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {rows.length > phoneLimit && (
        <div className="mt-4 min-[721px]:hidden">
          <Button
            variant="quiet"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? `Show the top ${phoneLimit}` : `Show all ${rows.length}`}
          </Button>
        </div>
      )}
    </div>
  );
}
