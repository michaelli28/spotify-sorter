"use client";
import { PressList, type PressRow } from "@/src/components/graphics/PressList";
import type { ManifestRow } from "./plan";
import type { SleeveState } from "./print-run";
import { CreditSleeve } from "./CreditSleeve";

type Voice = Partial<Record<SleeveState, string>>;

// Spoken only while the rows differ; the strip's status names the current one.
const VOICES: Record<"run" | "covers", Voice> = {
  run: {
    pending: "Not written yet",
    current: "Writing now",
    failed: "Stopped here",
    printed: "Written",
  },
  // After the write, only a cover that didn't go on differs from its neighbours.
  covers: { printed: "No cover", pending: "Not written" },
};

export interface PrintRunProps {
  /** In the order the write walks them: the credits print top to bottom. */
  rows: readonly ManifestRow[];
  /** One per row. */
  states: readonly SleeveState[];
  /** Row id → its playlist on Spotify, once written. Rows without one aren't links. */
  playlists?: ReadonlyMap<string, string>;
  /** Rows marked "new": pass only when the run mixed new and existing playlists. */
  fresh?: ReadonlySet<string>;
  /** Give each slot a spoken state: while the write runs, or naming covers
   *  that didn't go on once some did. */
  speak?: "run" | "covers";
  /** Keep the slot on the press in view. */
  follow?: boolean;
  className?: string;
}

/**
 * The manifest before Apply and the credits after it: home's press list, with
 * each sleeve printing in as Spotify confirms its playlist.
 */
export function PrintRun({
  rows,
  states,
  playlists,
  fresh,
  speak,
  follow = false,
  className,
}: PrintRunProps) {
  const press: PressRow[] = rows.map((row) => {
    const id = playlists?.get(row.id);
    return { ...row, href: id ? `spotify:playlist:${id}` : null };
  });
  return (
    <section aria-label="Playlists" className={className}>
      {/* No renderTrailing: a taller row makes the list's columns spill into
          a fourth. Every mark lives in the sleeve slot instead. */}
      <PressList
        rows={press}
        // The whole run on phones too: a hidden row would print unseen.
        phoneLimit={rows.length}
        renderSleeve={(row, i) => {
          const state = states[i] ?? "proof";
          return (
            <CreditSleeve
              spec={row.spec}
              state={state}
              label={speak && VOICES[speak][state]}
              fresh={fresh?.has(row.id)}
              follow={follow}
            />
          );
        }}
      />
    </section>
  );
}
