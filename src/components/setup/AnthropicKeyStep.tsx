"use client";
import { Input } from "@/src/components/design/Input";

export function AnthropicKeyStep({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-6">
      <p className="text-[var(--color-text-secondary)]">
        SpotifySorter uses Claude to classify and name playlists. Enter your
        Anthropic API key from{" "}
        <a
          className="text-[var(--color-accent)] hover:underline"
          href="https://console.anthropic.com"
          target="_blank"
          rel="noreferrer"
        >
          console.anthropic.com
        </a>
        .
      </p>
      <div className="space-y-2">
        <Input
          label="Anthropic API Key"
          name="anthropicKey"
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-ant-…"
          autoFocus
        />
        {error && (
          <p className="text-xs text-[var(--color-text-tertiary)] pl-1">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
