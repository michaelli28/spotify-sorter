"use client";
import clsx from "clsx";
import { Input } from "@/src/components/design/Input";
import { formatPlaylistName } from "@/src/lib/categories/prefix";

// Only the playlists the app creates get the prefix (apply.ts names them), so
// the preview uses category-like names, never an existing playlist.
const EXAMPLES = ["Aesthetic Rap", "Sad Slow Songs", "Late Drives"];

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
        className="max-w-40"
      />
      <ul
        aria-label="In Spotify"
        className={clsx(
          "mt-10 space-y-1 font-[family-name:var(--font-display)] text-2xl tracking-tight",
          prefix
            ? "text-[var(--color-text-primary)]"
            : "text-[var(--color-text-tertiary)]",
        )}
      >
        {EXAMPLES.map((name) => (
          <li key={name}>{prefix ? formatPlaylistName(prefix, name) : name}</li>
        ))}
      </ul>
    </>
  );
}
