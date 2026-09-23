import { TrackRow } from "@/src/components/design/TrackRow";
import type { WaitingTrack } from "@/src/components/diff/summary";

export interface WaitingTracksProps {
  /** Names the list for assistive tech; the page heading says it visibly. */
  label: string;
  tracks: WaitingTrack[];
  /** Every unsorted track, including the ones not listed. */
  total: number;
}

// No index column: these are a sample of the unsorted tracks, not a running
// order, so a number would claim a position they don't have.
export function WaitingTracks({ label, tracks, total }: WaitingTracksProps) {
  const more = total - tracks.length;
  return (
    <div>
      <ol aria-label={label}>
        {tracks.map((t) => (
          <TrackRow key={t.id} title={t.title} artist={t.artist} />
        ))}
      </ol>
      {more > 0 && (
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          and {more.toLocaleString()} more
        </p>
      )}
    </div>
  );
}
