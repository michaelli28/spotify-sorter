"use client";
import { Card } from "@/src/components/design/Card";

export function DevAppInstructions() {
  return (
    <Card>
      <ol className="space-y-4 text-[var(--color-text-secondary)]">
        <li>
          <span className="text-[var(--color-text-primary)]">1.</span> Open{" "}
          <a
            className="text-[var(--color-accent)] hover:underline"
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            developer.spotify.com/dashboard
          </a>{" "}
          and click <em>Create app</em>.
        </li>
        <li>
          <span className="text-[var(--color-text-primary)]">2.</span> Use any
          name (e.g. &quot;SpotifySorter&quot;). Description: anything.
        </li>
        <li>
          <span className="text-[var(--color-text-primary)]">3.</span> Set the
          Redirect URI exactly to{" "}
          <code className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)]">
            http://127.0.0.1:3000/api/auth/callback
          </code>
        </li>
        <li>
          <span className="text-[var(--color-text-primary)]">4.</span> Save.
          Copy the Client ID from the app&apos;s Settings page.
        </li>
      </ol>
    </Card>
  );
}
