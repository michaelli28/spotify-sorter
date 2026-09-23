"use client";
import { useEffect, useState } from "react";
import { Button } from "@/src/components/design/Button";
import { ExternalLink } from "@/src/components/setup/ExternalLink";

// Must match app/api/auth/login/route.ts and callback/route.ts byte for byte.
const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback";

type CopyState = "idle" | "copied" | "failed";
const COPY_LABEL: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Couldn't copy",
};

export function DevAppInstructions() {
  const [copy, setCopy] = useState<CopyState>("idle");

  useEffect(() => {
    if (copy === "idle") return;
    const t = setTimeout(() => setCopy("idle"), 1600);
    return () => clearTimeout(t);
  }, [copy]);

  // navigator.clipboard is undefined outside a secure context; the catch
  // covers that as well as a refused permission.
  async function copyUri() {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <ol className="max-w-prose space-y-6 leading-relaxed text-[var(--color-text-secondary)]">
      <li>
        Open{" "}
        <ExternalLink href="https://developer.spotify.com/dashboard">
          developer.spotify.com/dashboard
        </ExternalLink>{" "}
        and choose{" "}
        <span className="text-[var(--color-text-primary)]">Create app</span>.
        Any name and description will do.
      </li>
      <li>
        Under{" "}
        <span className="text-[var(--color-text-primary)]">Redirect URIs</span>,
        add exactly:
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <code className="select-all break-all font-[family-name:var(--font-mono)] text-sm text-[var(--color-text-primary)]">
            {REDIRECT_URI}
          </code>
          <Button variant="ghost" size="sm" onClick={copyUri} className="-ml-1">
            {COPY_LABEL[copy]}
          </Button>
        </div>
      </li>
      <li>
        Save, then copy the{" "}
        <span className="text-[var(--color-text-primary)]">Client ID</span> from
        the app&apos;s Settings.
      </li>
    </ol>
  );
}
