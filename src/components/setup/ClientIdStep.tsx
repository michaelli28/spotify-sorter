"use client";
import { Input } from "@/src/components/design/Input";

export function ClientIdStep({
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
  return (
    <Input
      aria-label="Spotify Client ID"
      name="clientId"
      value={value}
      // A pasted ID often carries a trailing space or newline.
      onChange={(e) => onChange(e.target.value.trim())}
      error={error}
      readOnly={busy}
      autoFocus
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      // Sized to a 32-character ID, so the field hints at what fits.
      className="max-w-[36ch] font-mono"
    />
  );
}
