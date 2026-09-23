import type { ReactNode } from "react";
import clsx from "clsx";

export interface TrackRowProps {
  /** 1-based position. Omit it for every row in a list, or for none. */
  index?: number;
  title: string;
  artist: string;
  /** Makes the title a link (e.g. a spotify: URI). */
  href?: string;
  /** Art before the title: an <AlbumArt> or sleeve at 40–44px. It draws its
   *  own keyline and must not name itself (the title already does). */
  media?: ReactNode;
  /** A control at the row's end. Keep it one width across a list. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * One track as a liner-notes line: catalogue number in mono ink-3, the art,
 * then the title in Franklin 600 over the artist in ink-2. Render inside an
 * <ol> or <ul>. With an href the whole row is the link's target (brief §5's
 * 44px; the title line alone is 22px), so art inside it takes `link={false}`.
 */
export function TrackRow({
  index,
  title,
  artist,
  href,
  media,
  trailing,
  className,
}: TrackRowProps) {
  return (
    <li
      className={clsx(
        "flex items-center gap-3 py-1",
        href && "relative",
        className,
      )}
    >
      {index !== undefined && (
        <span className="mono num w-8 flex-none text-right text-ink-3">
          {String(index).padStart(2, "0")}
        </span>
      )}
      {media !== undefined && <span className="flex-none">{media}</span>}
      <span className="min-w-0 flex-1 leading-snug">
        {href ? (
          // The ::after spans the positioned row. The link itself isn't
          // positioned, so its truncate (overflow: hidden) can't clip it.
          <a
            href={href}
            className="block truncate font-semibold text-ink underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline"
          >
            {title}
          </a>
        ) : (
          <span className="block truncate font-semibold text-ink">{title}</span>
        )}
        <span className="block truncate text-ink-2">{artist}</span>
      </span>
      {trailing !== undefined && (
        // Above the link's overlay, so the control stays clickable.
        <span className="relative z-[1] flex-none">{trailing}</span>
      )}
    </li>
  );
}
