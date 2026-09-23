"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { ActionBar } from "@/src/components/design/ActionBar";
import { Button, buttonClass } from "@/src/components/design/Button";
import { Input } from "@/src/components/design/Input";
import { PageShell } from "@/src/components/design/PageShell";
import { PlaylistPreviewModal } from "@/src/components/scope/PlaylistPreviewModal";
import { SourceRow } from "@/src/components/scope/SourceRow";
import {
  bulkLabel,
  loadSources,
  SpotifyNotConnected,
  trackCount,
  withAll,
  withToggled,
  type Selection,
} from "@/src/components/scope/sources";
import { EASE_OUT_EXPO, useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

type Load =
  | { kind: "loading" }
  | { kind: "disconnected" }
  | { kind: "error"; message: string }
  | { kind: "ready"; playlists: readonly OwnedPlaylist[] };

/** null previews Liked Songs. */
type Preview = { id: string | null; title: string };

// A bulk change sweeps down the visible rows, done within 0.3s.
const sweepDelay = (i: number) => Math.min(i * 0.012, 0.3);

export default function ScopePage() {
  const router = useRouter();
  const { itemDelay, reduced } = useMotionConfig();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<Selection>({
    excluded: new Set(),
    liked: true,
  });
  const [filter, setFilter] = useState("");
  // Rows that appear after the first paint (a filter change) skip the stagger.
  const [typed, setTyped] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const filterRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSources().then(
      ({ playlists, selection }) => {
        if (cancelled) return;
        setSelection(selection);
        setLoad({ kind: "ready", playlists });
      },
      (e: unknown) => {
        if (cancelled) return;
        setLoad(
          e instanceof SpotifyNotConnected
            ? { kind: "disconnected" }
            : {
                kind: "error",
                message: e instanceof Error ? e.message : "Unknown error",
              },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const playlists = useMemo(
    () => (load.kind === "ready" ? load.playlists : []),
    [load],
  );
  const query = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      query
        ? playlists.filter((p) => p.name.toLowerCase().includes(query))
        : playlists,
    [playlists, query],
  );

  const { excluded, liked } = selection;
  const selectedCount =
    playlists.filter((p) => !excluded.has(p.id)).length + (liked ? 1 : 0);
  const totalCount = playlists.length + 1;

  // Filtering narrows the bulk buttons to the rows on screen; Liked Songs
  // is never in a filtered list, so only the unfiltered buttons touch it.
  const scopeIds = visible.map((p) => p.id);
  const allIn =
    scopeIds.every((id) => !excluded.has(id)) && (query !== "" || liked);
  const allOut =
    scopeIds.every((id) => excluded.has(id)) && (query !== "" || !liked);

  // While Scan saves, the choice on screen must stay the one being saved.
  function toggle(id: string | null) {
    if (inFlight.current) return;
    setSweep(false);
    setSaveFailed(false);
    setSelection((s) =>
      id === null
        ? { ...s, liked: !s.liked }
        : { ...s, excluded: withToggled(s.excluded, id) },
    );
  }

  function setAll(include: boolean) {
    if (inFlight.current) return;
    setSweep(true);
    setSaveFailed(false);
    setSelection((s) => ({
      excluded: withAll(s.excluded, scopeIds, !include),
      liked: query ? s.liked : include,
    }));
  }

  function clearFilter() {
    setFilter("");
    filterRef.current?.focus();
  }

  function retry() {
    setLoad({ kind: "loading" });
    setAttempt((a) => a + 1);
  }

  async function scan() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveFailed(false);
    const ok = await fetch("/api/cache", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: {
          included_playlist_ids: playlists
            .filter((p) => !excluded.has(p.id))
            .map((p) => p.id),
          excluded_playlist_ids: Array.from(excluded),
          include_liked_songs: liked,
        },
      }),
    }).then(
      (r) => r.ok,
      () => false,
    );
    // Leaving mid-save must not drag the user to /scan, which starts a read.
    if (!alive.current) return;
    if (ok) {
      router.push("/scan");
      return;
    }
    inFlight.current = false;
    setSaving(false);
    setSaveFailed(true);
  }

  // With one source there is no count: it would restate the checked row.
  const status = saveFailed ? (
    <span className="text-[var(--color-danger)]">
      Couldn&apos;t save your choice. Nothing was read.
    </span>
  ) : selectedCount === 0 ? (
    "Pick at least one source."
  ) : totalCount === 1 ? null : (
    <>
      <motion.span
        key={selectedCount}
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
        className="inline-block tabular-nums text-[var(--color-text-primary)]"
      >
        {selectedCount}
      </motion.span>{" "}
      of {totalCount} sources
    </>
  );

  const previewing =
    preview === null
      ? undefined
      : preview.id === null
        ? liked
        : !excluded.has(preview.id);

  return (
    <PageShell title="What should I read?">
      {load.kind === "loading" && (
        <p className="text-[var(--color-text-secondary)]">
          Loading your playlists…
        </p>
      )}

      {load.kind === "error" && (
        <div>
          <p className="text-lg text-[var(--color-text-primary)]">
            Spotify didn&apos;t send your playlists.
          </p>
          <p className="mt-2 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-tertiary)]">
            {load.message}
          </p>
          <div className="mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <Button onClick={retry} className="-ml-1">
              Try again
            </Button>
            {/* A plain <a>: /api/auth/login is a route handler (OAuth). */}
            <a
              href="/api/auth/login"
              data-variant="ghost"
              className={buttonClass({ variant: "ghost" })}
            >
              Reconnect Spotify
            </a>
          </div>
        </div>
      )}

      {load.kind === "disconnected" && (
        <div>
          <p className="text-lg text-[var(--color-text-primary)]">
            Spotify isn&apos;t connected.
          </p>
          <div className="mt-8">
            <a
              href="/api/auth/login"
              data-variant="primary"
              className={buttonClass({ className: "-ml-1" })}
            >
              Connect Spotify
            </a>
          </div>
        </div>
      )}

      {load.kind === "ready" && (
        <div
          className={
            playlists.length > 0
              ? "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-x-16"
              : "max-w-2xl"
          }
        >
          {/* Rows bleed their hover into the gutter; the rule stays on the edge. */}
          <div className="mb-8 border-b border-[var(--color-border-default)] pb-2 lg:col-start-2 lg:row-start-1">
            <ul className="-mx-3">
              <SourceRow
                name="Liked Songs"
                glyph={
                  <Heart
                    strokeWidth={1.25}
                    className="size-5 text-[var(--color-text-secondary)]"
                  />
                }
                checked={liked}
                onToggle={() => toggle(null)}
                onPreview={() => setPreview({ id: null, title: "Liked Songs" })}
                enterDelay={itemDelay(0)}
                changeDelay={sweep ? sweepDelay(0) : 0}
                disabled={saving}
              />
            </ul>
          </div>

          {playlists.length === 0 ? (
            <p className="text-[var(--color-text-secondary)]">
              You haven&apos;t made any playlists on Spotify yet.
            </p>
          ) : (
            <>
              <div className="mb-8 lg:sticky lg:top-8 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mb-0">
                <div className="relative">
                  <Input
                    ref={filterRef}
                    type="search"
                    aria-label="Filter playlists"
                    placeholder="Filter playlists"
                    value={filter}
                    onChange={(e) => {
                      setTyped(true);
                      setFilter(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && filter) {
                        e.preventDefault();
                        setFilter("");
                      }
                    }}
                    className="pr-16 [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  {filter && (
                    // Positioned by a wrapper: Button's own `relative` would win.
                    <span className="absolute right-0 bottom-1 max-lg:bottom-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Clear filter"
                        onClick={clearFilter}
                        className="max-lg:py-3"
                      >
                        Clear
                      </Button>
                    </span>
                  )}
                </div>
                {visible.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-x-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={allIn || saving}
                      onClick={() => setAll(true)}
                      className="-ml-1 max-lg:py-3"
                    >
                      {query
                        ? bulkLabel("Select", visible.length)
                        : "Select all"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={allOut || saving}
                      onClick={() => setAll(false)}
                      className="max-lg:py-3"
                    >
                      {query
                        ? bulkLabel("Deselect", visible.length)
                        : "Deselect all"}
                    </Button>
                  </div>
                )}
                {/* Keyboard only: Scan sits after two stops per row. */}
                {selectedCount > 0 && (
                  <div className="sr-only focus-within:not-sr-only focus-within:mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => scanRef.current?.focus()}
                      className="-ml-1"
                    >
                      Skip to Scan
                    </Button>
                  </div>
                )}
              </div>

              <div className="lg:col-start-2 lg:row-start-2">
                {visible.length === 0 ? (
                  <p className="text-[var(--color-text-secondary)]">
                    No playlists match “{filter.trim()}”.
                  </p>
                ) : (
                  <ul className="-mx-3">
                    {visible.map((p, i) => (
                      <SourceRow
                        key={p.id}
                        name={p.name}
                        cover={p.cover_url}
                        count={trackCount(p.track_count)}
                        checked={!excluded.has(p.id)}
                        onToggle={() => toggle(p.id)}
                        onPreview={() =>
                          setPreview({ id: p.id, title: p.name })
                        }
                        enterDelay={typed ? 0 : itemDelay(i + 1)}
                        changeDelay={sweep ? sweepDelay(i + 1) : 0}
                        disabled={saving}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <PlaylistPreviewModal
        open={preview !== null}
        playlistId={preview?.id ?? null}
        liked={preview !== null && preview.id === null}
        title={preview?.title ?? ""}
        selected={previewing}
        onToggle={preview ? () => toggle(preview.id) : undefined}
        toggleDisabled={saving}
        onClose={() => setPreview(null)}
      />

      {load.kind === "ready" && (
        <ActionBar
          status={status}
          end={
            <Button
              ref={scanRef}
              onClick={scan}
              disabled={selectedCount === 0}
              aria-disabled={saving || undefined}
              className="aria-disabled:cursor-progress aria-disabled:after:scale-x-100"
            >
              Scan
            </Button>
          }
        />
      )}
    </PageShell>
  );
}
