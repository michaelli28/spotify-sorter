"use client";
import clsx from "clsx";
import { Button } from "@/src/components/design/Button";
import { RELOAD_MESSAGE } from "./api";

// A 409 (also the tail of a stopped bulk run) tells you to reload; the button
// does exactly that. The message stays one text node.
export function ErrorLine({
  error,
  className,
}: {
  error: string | null;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-4", className)}>
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
      {error.endsWith(RELOAD_MESSAGE) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      )}
    </div>
  );
}
