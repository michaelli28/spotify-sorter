"use client";
import { Card } from "@/src/components/design/Card";
import { Button } from "@/src/components/design/Button";

export function CacheMismatchDialog() {
  return (
    <Card>
      <h2 className="font-[family-name:var(--font-display)] text-2xl mb-3">
        Cache file is from an older version.
      </h2>
      <p className="text-[var(--color-text-secondary)] mb-6">
        Back up{" "}
        <code className="font-[family-name:var(--font-mono)]">
          ./data/cache.json
        </code>{" "}
        first, then delete it and refresh to start fresh.
      </p>
      <Button onClick={() => location.reload()}>Refresh</Button>
    </Card>
  );
}
