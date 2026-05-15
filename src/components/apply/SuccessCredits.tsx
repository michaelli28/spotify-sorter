"use client";
import { Fragment } from "react";
import { motion } from "framer-motion";

interface Props {
  playlists: Array<{
    id: string;
    name: string;
    track_count: number;
    created: boolean;
  }>;
  summary: { created: number; updated: number; tracks_added: number };
}

export function SuccessCredits({ playlists, summary }: Props) {
  const ordered = [...playlists].sort((a, b) => b.track_count - a.track_count);
  return (
    <div className="space-y-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-tertiary)] mb-6">
          Side A
        </div>
        <motion.h1
          className="font-[family-name:var(--font-display)] italic text-7xl leading-[0.95] tracking-tight text-[var(--color-text-primary)] max-w-3xl"
          initial={{ letterSpacing: "0" }}
          animate={{ letterSpacing: "-0.01em" }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {summary.created > 0
            ? `${summary.created} new playlists`
            : "Updated."}
          <br />
          <span className="not-italic text-[var(--color-text-secondary)] text-5xl">
            {summary.tracks_added} tracks placed.
          </span>
        </motion.h1>
      </motion.div>

      <motion.ol
        className="space-y-1"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: 0.04, delayChildren: 0.6 },
          },
        }}
      >
        {ordered.map((p, i) => (
          <Fragment key={p.id}>
            {i === 12 && ordered.length > 12 && (
              <motion.li
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1 },
                }}
                className="py-4 border-b border-[var(--color-border-default)]"
              >
                <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">
                  Side B.
                </span>
              </motion.li>
            )}
            <motion.li
              variants={{
                hidden: { opacity: 0, y: 6 },
                visible: { opacity: 1, y: 0 },
              }}
              className="flex items-baseline gap-6 py-3 border-b border-[var(--color-border-default)]"
            >
              <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-tertiary)] w-10">
                {String(i + 1).padStart(2, "0")}
              </span>
              <a
                href={`spotify:playlist:${p.id}`}
                className="flex-1 font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
              >
                {p.name}
              </a>
              <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-text-tertiary)]">
                {p.track_count}
              </span>
            </motion.li>
          </Fragment>
        ))}
      </motion.ol>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
        className="border-t border-[var(--color-border-default)] pt-12 max-w-2xl"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-tertiary)] mb-3">
          One last thing
        </div>
        <p className="text-[var(--color-text-secondary)] leading-relaxed">
          Open Spotify desktop, multi-select the{" "}
          {summary.created > 0 ? "new" : ""} prefix-marked playlists,
          right-click → <em>Add to Folder</em> → name it "Organized." Thirty
          seconds, never again.
        </p>
      </motion.div>
    </div>
  );
}
