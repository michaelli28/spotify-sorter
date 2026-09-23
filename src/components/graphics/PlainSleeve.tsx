import clsx from "clsx";

export interface PlainSleeveProps {
  size: number;
  className?: string;
}

/**
 * A track with no cover art: a flat paper-deep square with a 1px ink keyline. No rings,
 * no ink, so it never reads as a groove sleeve or the brand mark (brief §4.3).
 */
export function PlainSleeve({ size, className }: PlainSleeveProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="No cover art"
      className={clsx("block shrink-0 border border-[var(--ink)]", className)}
    >
      <rect width="48" height="48" fill="var(--paper-deep)" />
    </svg>
  );
}
