"use client";
import { Input } from "@/src/components/design/Input";

export function PrefixStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-[var(--color-text-secondary)]">
        AI-sorted playlists will be prefixed so you can tell them apart at a
        glance. You can change this later in Settings.
      </p>
      <Input
        label="Playlist prefix"
        name="prefix"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="✨"
        autoFocus
      />
      {value && (
        <p className="text-xs text-[var(--color-text-tertiary)] pl-1">
          Preview:{" "}
          <span className="text-[var(--color-text-primary)]">
            {value} Liked Songs
          </span>
        </p>
      )}
    </div>
  );
}
