"use client";
import { useCallback, useEffect, useState } from "react";
import type { Cache } from "@/src/lib/cache/schema";
import type { DraftCategory } from "@/src/lib/categories/merge";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";
import type { TrackLookupEntry } from "./TrackSearchModal";

export type SourcePhase =
  | { kind: "loading" }
  | { kind: "loadError"; message: string; retryable: boolean }
  | { kind: "proposing"; outputTokens?: number }
  | { kind: "proposeError"; message: string }
  | { kind: "ready" };

export interface Library {
  tracks: Record<string, TrackLookupEntry>;
  trackCount: number;
  unsorted: number;
  /** Placed by Claude, not by hand: what re-scoring a new category sends. */
  rescorable: number;
}

type CachePayload = Pick<
  Cache,
  "tracks" | "artists" | "categories" | "assignments"
>;

const EMPTY: Library = {
  tracks: {},
  trackCount: 0,
  unsorted: 0,
  rescorable: 0,
};

function libraryFrom(cache: CachePayload): Library {
  const tracks = Object.fromEntries(
    Object.entries(cache.tracks).map(([id, t]) => [
      id,
      {
        id,
        title: t.title,
        artist_name: cache.artists[t.artist_id]?.name ?? "",
      },
    ]),
  );
  return {
    tracks,
    trackCount: Object.keys(tracks).length,
    unsorted: unsortedTrackIds(cache).length,
    // The same rule as src/lib/pipeline/reclassify.ts.
    rescorable: Object.values(cache.assignments).filter((a) => !a.override)
      .length,
  };
}

function categoriesFrom(cache: CachePayload): DraftCategory[] {
  return Object.entries(cache.categories).map(([id, c]) => ({
    id,
    name: c.name,
    description: c.description,
    example_track_ids: c.example_track_ids ?? [],
  }));
}

function loadFailure(status: number): SourcePhase {
  return status === 409
    ? {
        kind: "loadError",
        message: "The saved library was written by another version of the app.",
        retryable: false,
      }
    : {
        kind: "loadError",
        message: `The server answered ${status}.`,
        retryable: true,
      };
}

/**
 * Loads the saved categories, or proposes them when there are none. The
 * propose stream lives here, in the page's own lifetime: nothing that
 * re-renders or re-keys the view can open it twice.
 */
export function useCategorySource() {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<SourcePhase>({ kind: "loading" });
  const [library, setLibrary] = useState<Library>(EMPTY);
  // What the cache holds, so the confirm can name what a save changes.
  const [saved, setSaved] = useState<DraftCategory[]>([]);
  const [draft, setDraft] = useState<DraftCategory[]>([]);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    (async () => {
      let cache: CachePayload;
      try {
        const res = await fetch("/api/cache");
        if (cancelled) return;
        if (!res.ok) {
          setPhase(loadFailure(res.status));
          return;
        }
        cache = (await res.json()) as CachePayload;
      } catch {
        if (!cancelled)
          setPhase({
            kind: "loadError",
            message: "The app's server didn't answer.",
            retryable: true,
          });
        return;
      }
      if (cancelled) return;
      setLibrary(libraryFrom(cache));
      const existing = categoriesFrom(cache);
      if (existing.length > 0) {
        setSaved(existing);
        setDraft(existing);
        setPhase({ kind: "ready" });
        return;
      }
      setPhase({ kind: "proposing" });
      es = new EventSource("/api/llm/propose");
      es.addEventListener("progress", (e) => {
        const { output_tokens } = JSON.parse((e as MessageEvent).data) as {
          output_tokens?: number;
        };
        setPhase({ kind: "proposing", outputTokens: output_tokens });
      });
      es.addEventListener("done", (e) => {
        const { categories } = JSON.parse((e as MessageEvent).data) as {
          categories: DraftCategory[];
        };
        es?.close();
        // Propose saves what it returns, so this is already the cache.
        setSaved(categories);
        setDraft(categories);
        setPhase({ kind: "ready" });
      });
      es.addEventListener("error", (e) => {
        const raw = (e as MessageEvent).data as string | undefined;
        es?.close();
        setPhase({
          kind: "proposeError",
          message: raw
            ? ((JSON.parse(raw) as { message?: string }).message ??
              "Unknown error.")
            : "Lost the connection to the server.",
        });
      });
    })();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setPhase({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { phase, library, saved, setSaved, draft, setDraft, reload };
}
