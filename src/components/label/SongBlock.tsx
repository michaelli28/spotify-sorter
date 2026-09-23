"use client";
import { useEffect, useRef } from "react";
import type { LabelTrack } from "@/src/lib/labeling/schema";

export function SongBlock({ track }: { track: LabelTrack }) {
  // The block remounts per item: start the next song at the top of the page,
  // with focus on its title. The scroll is explicit because in the wide layout
  // the title sits in a sticky rail, where focus() alone never scrolls.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="font-display text-display-3 text-balance text-ink [overflow-wrap:anywhere] focus:outline-none"
        >
          {track.title}
        </h2>
        <p className="mt-3 text-lead text-ink-2">{track.artist_name}</p>
        {track.genres.length > 0 && (
          <p className="mt-2 text-sm text-ink-3">{track.genres.join(" · ")}</p>
        )}
      </div>
      <iframe
        title={`${track.title}, ${track.artist_name}`}
        src={`https://open.spotify.com/embed/track/${encodeURIComponent(track.track_id)}`}
        height={80}
        loading="lazy"
        allow="encrypted-media"
        className="block w-full max-w-xl rounded-[12px] border-0"
      />
    </section>
  );
}
