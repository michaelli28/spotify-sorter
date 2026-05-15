"use client";
import { Input } from "@/src/components/design/Input";

export function ClientIdStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-[var(--color-text-secondary)]">
        Paste the Client ID from your Spotify developer app settings.
      </p>
      <Input
        label="Spotify Client ID"
        name="clientId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your Client ID here"
        autoFocus
      />
    </div>
  );
}
