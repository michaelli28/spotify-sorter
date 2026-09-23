"use client";
import { useId } from "react";
import clsx from "clsx";
import { Input } from "@/src/components/design/Input";
import { formatPlaylistName } from "@/src/lib/categories/prefix";

// Only the playlists the app creates get the prefix (apply.ts names them), so
// the preview uses a category-like name, never an existing playlist.
const EXAMPLE = "Bedroom Pop Intimacy";

export function PrefixStep({
  value,
  onChange,
  error,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  busy: boolean;
}) {
  const prefix = value.trim();
  const captionId = useId();
  return (
    <>
      <Input
        aria-label="Playlist prefix"
        name="prefix"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        readOnly={busy}
        // POST /api/config rejects anything longer.
        maxLength={8}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className="max-w-48 text-lead"
      />
      {/* A divider's tab, printed with the playlist's name. Plain stock: a
          tint would claim a temperature this page can't know. */}
      <figure aria-labelledby={captionId} className="mt-8 max-w-md">
        <figcaption
          id={captionId}
          className="mb-2 font-mono text-label text-ink-3"
        >
          In Spotify
        </figcaption>
        <div className="border-b border-rule-strong pl-3 tab:pl-6">
          <span
            // No prefix can't be saved, so it prints as a blank tab.
            data-empty={prefix ? undefined : true}
            // Wraps, never truncates: the whole name is the point.
            className={clsx(
              "inline-block max-w-full rounded-t-[4px] border-b-0 px-4 py-2 text-body font-semibold [overflow-wrap:anywhere] tab:text-lead",
              prefix
                ? "border border-rule-strong bg-tab-stock text-tab-ink"
                : "border-[1.5px] border-dashed border-rule-strong bg-paper-deep text-ink-3",
            )}
          >
            {prefix ? formatPlaylistName(prefix, EXAMPLE) : EXAMPLE}
          </span>
        </div>
      </figure>
    </>
  );
}
