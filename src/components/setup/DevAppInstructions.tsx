"use client";
import { Fragment, useEffect, useState } from "react";
import { Button } from "@/src/components/design/Button";
import { ExternalLink } from "@/src/components/setup/ExternalLink";

// Must match app/api/auth/login/route.ts and callback/route.ts byte for byte.
const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback";
// After each single slash: where a narrow phone may wrap it, never mid-word.
const URI_PARTS = REDIRECT_URI.split(/(?<=[^/]\/)(?!\/)/);

type CopyState = "idle" | "copied" | "failed";
// Announced once; the failure stays on screen until the next try.
const COPY_NOTE: Record<CopyState, string> = {
  idle: "",
  copied: "Copied the redirect URI.",
  failed: "Couldn't copy. Select the address and copy it by hand.",
};

export function DevAppInstructions() {
  const [copy, setCopy] = useState<CopyState>("idle");

  useEffect(() => {
    if (copy !== "copied") return;
    const t = setTimeout(() => setCopy("idle"), 1600);
    return () => clearTimeout(t);
  }, [copy]);

  // navigator.clipboard is undefined outside a secure context; the catch
  // covers that as well as a refused permission.
  async function copyUri() {
    setCopy("idle");
    try {
      await navigator.clipboard.writeText(REDIRECT_URI);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <ol className="max-w-prose space-y-4 text-ink-2">
      <li>
        Open{" "}
        <ExternalLink href="https://developer.spotify.com/dashboard">
          developer.spotify.com/dashboard
        </ExternalLink>{" "}
        and choose <span className="text-ink">Create app</span>. Any name and
        description will do.
      </li>
      <li>
        Under <span className="text-ink">Redirect URIs</span>, add exactly:
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* Label size and no tracking on phones: all 39 characters fit on
              one line at 390px. */}
          <code className="select-all rounded-[2px] border border-rule-strong bg-paper-deep px-2 py-2 font-mono text-label tracking-normal text-ink tab:px-3 tab:text-body">
            {URI_PARTS.map((part, i) => (
              <Fragment key={part}>
                {i > 0 && <wbr />}
                {part}
              </Fragment>
            ))}
          </code>
          <Button variant="quiet" onClick={copyUri}>
            {copy === "copied" ? "Copied" : "Copy"}
          </Button>
        </div>
        {/* The code is select-all: one click takes the whole address. */}
        <p
          role="status"
          className={copy === "failed" ? "mt-2 text-danger" : "sr-only"}
        >
          {COPY_NOTE[copy]}
        </p>
      </li>
      <li>
        Save, then copy the <span className="text-ink">Client ID</span> from the
        app&apos;s Settings.
      </li>
    </ol>
  );
}
