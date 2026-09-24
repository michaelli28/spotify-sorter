"use client";
import type { Ref } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  Button,
  ButtonLink,
  buttonClass,
} from "@/src/components/design/Button";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { ApplyResult } from "@/src/lib/pipeline/apply";
import type { CoverNotice } from "./covers";
import { creditsTitle, onSpotifyTitle } from "./print-run";

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

export interface CreditsHeadProps {
  result: ApplyResult;
  /** Distinct tracks the playlists hold (ApplyPlan.tracks). */
  tracks: number;
  /** What the covers need from the owner, if anything. */
  notice: CoverNotice | null;
  onRetryCovers: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
  /** Covers still uploading: Home is held, like the nav. */
  busy?: boolean;
}

/** The close: how many playlists are on Spotify, and what the run changed. */
export function CreditsHead({
  result,
  tracks,
  notice,
  onRetryCovers,
  headingRef,
  busy = false,
}: CreditsHeadProps) {
  const { reduced } = useMotionConfig();
  // tracks_added counts placements, so a song in four playlists adds four;
  // no run places more distinct songs than the playlists hold.
  const placed = Math.min(result.tracks_added, tracks);
  // Spec §8.1: songs the sync took out of existing playlists. A server from
  // before the sync sends none.
  const removed = result.tracks_removed ?? 0;
  const rise = reduced ? false : { opacity: 0, y: 14 };
  const scene = { duration: DURATION.scene, ease: EASE_OUT };

  return (
    <header>
      <motion.h1
        ref={headingRef}
        tabIndex={-1}
        initial={rise}
        animate={{ opacity: 1, y: 0 }}
        transition={scene}
        className="font-display text-display-1 text-balance text-ink outline-none"
      >
        {onSpotifyTitle(result.playlists.length)}
      </motion.h1>
      <motion.p
        initial={rise}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...scene, delay: 0.08 }}
        className="mt-6 text-lead text-ink-2"
      >
        <span>{creditsTitle(result)}</span>
        {placed > 0 && (
          <>
            <span aria-hidden> · </span>
            {/* One text node: tests/e2e/happy-path.spec.ts finds it by text. */}
            <span>{`${count(placed)} ${plural(placed, "track")} placed${removed > 0 ? "" : "."}`}</span>
          </>
        )}
        {removed > 0 && (
          <>
            <span aria-hidden> · </span>
            {/* "placed · 12 removed." shares the noun; alone it needs one.
                Never "12" at a line end with "removed." under it. */}
            <span className="whitespace-nowrap">{`${count(removed)} ${placed > 0 ? "" : `${plural(removed, "track")} `}removed.`}</span>
          </>
        )}
      </motion.p>
      <div
        className={clsx(
          "flex flex-wrap items-baseline gap-x-4 text-ink-2",
          notice && "mt-4",
        )}
      >
        {/* Always mounted: a live region only announces what changes in it. */}
        <p role="status">{notice?.text}</p>
        {notice?.kind === "reconnect" && (
          // A route handler: it needs a full navigation, not next/link.
          <a
            href="/api/auth/login"
            data-variant="quiet"
            className={buttonClass({ variant: "quiet" })}
          >
            Reconnect
          </a>
        )}
        {/* The same button while it retries, so keyboard focus stays on it. */}
        {(notice?.kind === "retry" || notice?.kind === "retrying") && (
          <Button
            variant="quiet"
            aria-disabled={notice.kind === "retrying" || undefined}
            onClick={notice.kind === "retry" ? onRetryCovers : undefined}
            className="aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 aria-disabled:decoration-rule"
          >
            Retry covers
          </Button>
        )}
      </div>
      <div className="mt-4 flex min-h-11 items-center">
        {/* Held like the nav while covers upload: leaving drops the rest. */}
        <span inert={busy}>
          <ButtonLink
            href="/"
            variant="ghost"
            className={busy ? "text-ink-3 decoration-rule" : undefined}
          >
            Home
          </ButtonLink>
        </span>
      </div>
    </header>
  );
}

export interface CreditsFootProps {
  prefix: string;
}

/** Where the credits end: the folder step. The page's foot holds it. */
export function CreditsFoot({ prefix }: CreditsFootProps) {
  return (
    <p className="max-w-xl text-ink-2">
      In Spotify desktop, select the {prefix} playlists → right-click → Add to
      Folder.
    </p>
  );
}
