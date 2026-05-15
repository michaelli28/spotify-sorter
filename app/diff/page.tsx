"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/src/components/design/PageShell";
import { DiffBanner } from "@/src/components/shared/DiffBanner";

interface DiffResponse {
  added: string[];
  removed: string[];
  removed_examples: string[];
  existing_category_count: number;
  is_first_run: boolean;
}

export default function DiffPage() {
  const router = useRouter();
  const [diff, setDiff] = useState<DiffResponse | null>(null);

  useEffect(() => {
    fetch("/api/spotify/diff")
      .then((r) => r.json())
      .then(setDiff);
  }, []);

  if (!diff) {
    return (
      <PageShell eyebrow="Comparing" title="Diffing your library…">
        <p className="text-[var(--color-text-secondary)]">
          Reading current state.
        </p>
      </PageShell>
    );
  }

  if (diff.is_first_run || diff.existing_category_count === 0) {
    router.replace("/review");
    return null;
  }

  if (diff.added.length === 0 && diff.removed.length === 0) {
    return (
      <PageShell eyebrow="Nothing to do" title="Your library is unchanged.">
        <p className="text-[var(--color-text-secondary)] mb-8">
          No new or removed tracks since the last run.
        </p>
        <a
          href="/"
          className="text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          ← Back to start
        </a>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Re-run" title="What changed.">
      <DiffBanner
        added={diff.added.length}
        removed={diff.removed.length}
        removedExamples={diff.removed_examples}
        existingCategoryCount={diff.existing_category_count}
        onApplyExisting={() => router.push("/classify")}
        onEditCategories={() => router.push("/review")}
      />
    </PageShell>
  );
}
