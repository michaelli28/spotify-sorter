"use client";
import { useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { PlainSleeve } from "./PlainSleeve";

/** What /api/art/[trackId] accepts; anything else would only earn a 400. */
const TRACK_ID = /^[A-Za-z0-9]{22}$/;

type LinkProps =
  | {
      link?: true;
      /** The link's accessible name, e.g. "drive by Current Blue". The art itself is decorative. */
      label: string;
    }
  | {
      /** false inside a row that is already a spotify: link (no nested links). */
      link: false;
      label?: never;
    };

export type AlbumArtProps = LinkProps & {
  trackId: string;
  /** px, square. 44 on home, the review sheet and song lists; 40 in some lists. */
  size?: number;
  className?: string;
};

/**
 * A track's real album art (brief §4.3): square, 1px ink keyline, lazy, from the app's
 * own art route. No art, a failed load or a bad id prints the plain sleeve instead.
 */
export function AlbumArt({
  trackId,
  size = 44,
  link = true,
  label,
  className,
}: AlbumArtProps) {
  // Keyed by id, so a new track (flipping the crate) gets a fresh try.
  const [failedId, setFailedId] = useState<string | null>(null);
  const valid = TRACK_ID.test(trackId);
  const art =
    !valid || failedId === trackId ? (
      <PlainSleeve size={size} className={className} />
    ) : (
      <Image
        src={`/api/art/${trackId}`}
        alt=""
        width={size}
        height={size}
        unoptimized
        loading="lazy"
        className={clsx(
          "block shrink-0 border border-[var(--ink)] bg-[var(--paper-deep)] object-cover",
          className,
        )}
        onError={() => setFailedId(trackId)}
        // A server-rendered <img> can fail before hydration attaches onError.
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailedId(trackId);
        }}
      />
    );
  if (!link || !valid) return art;
  return (
    <a
      href={`spotify:track:${trackId}`}
      aria-label={label}
      className="shrink-0"
    >
      {art}
    </a>
  );
}
