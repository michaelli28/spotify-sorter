"use client";
import { Input } from "@/src/components/design/Input";
import { ExternalLink } from "@/src/components/setup/ExternalLink";

export function AnthropicKeyStep({
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
    <>
      <Input
        aria-label="Anthropic API key"
        name="anthropicKey"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        error={error}
        readOnly={busy}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="font-mono"
      />
      {/* Not the Input's hint: the field's description stays its error alone. */}
      <p className="mt-4 text-ink-2">
        Get one at{" "}
        <ExternalLink href="https://console.anthropic.com">
          console.anthropic.com
        </ExternalLink>
      </p>
    </>
  );
}
