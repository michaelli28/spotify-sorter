"use client";
import type { Ref } from "react";
import { motion } from "framer-motion";
import { ButtonLink, buttonClass } from "@/src/components/design/Button";
import { parsePlaylistName } from "@/src/lib/categories/prefix";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { ApplyResult } from "@/src/lib/pipeline/apply";

export interface SuccessCreditsProps {
  result: ApplyResult;
  /** Stripped from every name; named once in the folder step. */
  prefix: string;
  /** Distinct tracks the playlists hold (ApplyPlan.tracks). */
  tracks: number;
  headingRef?: Ref<HTMLHeadingElement>;
}

// Rows roll in after the title, one column then the next, like end credits.
// The whole roll stays near ROLL seconds however many playlists there are.
const ROWS_START = 0.35;
const ROLL = 1.2;

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

function creditsTitle({ created, updated }: ApplyResult): string {
  if (created > 0 && updated > 0) {
    return `${count(created)} new, ${count(updated)} updated`;
  }
  if (created > 0)
    return `${count(created)} new ${plural(created, "playlist")}`;
  if (updated > 0) {
    return `${count(updated)} ${plural(updated, "playlist")} updated`;
  }
  return "Already up to date.";
}

export function SuccessCredits({
  result,
  prefix,
  tracks,
  headingRef,
}: SuccessCreditsProps) {
  const { reduced, spring, pageEase, item } = useMotionConfig();
  const ordered = [...result.playlists].sort(
    (a, b) => b.track_count - a.track_count,
  );
  // "new" only means something when some rows aren't.
  const mixed =
    ordered.some((p) => p.created) && ordered.some((p) => !p.created);
  const step = reduced ? 0 : Math.min(0.04, ROLL / Math.max(ordered.length, 1));
  const rowsAt = reduced ? 0 : ROWS_START;
  const rise = reduced ? false : { opacity: 0, y: 12 };
  // tracks_added counts placements, so a song in four playlists adds four;
  // no run places more distinct songs than the playlists hold.
  const placed = Math.min(result.tracks_added, tracks);

  return (
    <>
      <header className="mb-section">
        <motion.h1
          ref={headingRef}
          tabIndex={-1}
          initial={rise}
          animate={{ opacity: 1, y: 0 }}
          transition={pageEase}
          className="font-[family-name:var(--font-display)] text-display-1 italic tracking-tight text-[var(--color-text-primary)] outline-none"
        >
          {creditsTitle(result)}
        </motion.h1>
        {placed > 0 && (
          <motion.p
            initial={rise}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...pageEase, delay: reduced ? 0 : 0.12 }}
            className="mt-4 font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--color-text-secondary)] sm:text-4xl"
          >
            {`${count(placed)} ${plural(placed, "track")} placed.`}
          </motion.p>
        )}
      </header>

      <ol className="gap-x-16 lg:columns-2">
        {ordered.map((p, i) => (
          <motion.li
            key={p.id}
            variants={item}
            initial="hidden"
            animate="visible"
            transition={{ ...spring, delay: rowsAt + i * step }}
            className="grid break-inside-avoid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:gap-x-4"
          >
            <span className="font-[family-name:var(--font-mono)] text-xs tabular-nums text-[var(--color-text-tertiary)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <a
              href={`spotify:playlist:${p.id}`}
              className="justify-self-start font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--color-text-primary)] transition-colors duration-200 hover:text-[var(--color-accent)] sm:text-2xl"
            >
              {parsePlaylistName(prefix, p.name).name}
            </a>
            <span className="text-right font-[family-name:var(--font-mono)] text-sm tabular-nums text-[var(--color-text-tertiary)]">
              {mixed && p.created && (
                <span className="mr-3 font-[family-name:var(--font-body)] text-xs text-[var(--color-text-secondary)]">
                  new
                </span>
              )}
              {count(p.track_count)}
            </span>
          </motion.li>
        ))}
      </ol>

      <motion.footer
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          ...pageEase,
          delay: reduced ? 0 : rowsAt + ordered.length * step + 0.4,
        }}
        className="mt-section border-t border-[var(--color-border-default)] pt-10"
      >
        <p className="max-w-xl leading-relaxed text-[var(--color-text-secondary)]">
          In Spotify desktop, select the {prefix} playlists → right-click → Add
          to Folder.
        </p>
        <div className="-ml-1 mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <a href="spotify:" className={buttonClass()}>
            Open Spotify
          </a>
          <ButtonLink href="/" variant="ghost">
            Home
          </ButtonLink>
        </div>
      </motion.footer>
    </>
  );
}
