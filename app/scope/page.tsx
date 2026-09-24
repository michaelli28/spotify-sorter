"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { ActionBar } from "@/src/components/design/ActionBar";
import { Button, buttonClass } from "@/src/components/design/Button";
import { Input } from "@/src/components/design/Input";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { useNavLock } from "@/src/components/design/NavLock";
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
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

type Load =
  | { kind: "loading" }
  | { kind: "disconnected" }
  | { kind: "error"; message: string }
  | { kind: "ready"; playlists: readonly OwnedPlaylist[] };

/** null previews Liked Songs. total: Spotify's count, shown on the row. */
type Preview = { id: string | null; title: string; total?: number };

// A bulk change sweeps down the visible rows, done within 0.3s.
const sweepDelay = (i: number) => Math.min(i * 0.012, 0.3);

// Held down while its request runs: the keyline stays in register.
const HELD =
  "aria-disabled:cursor-progress aria-disabled:bg-accent-press aria-disabled:after:translate-0";

export default function ScopePage() {
  const router = useRouter();
  const { itemDelay, reduced, fade } = useMotionConfig();
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
  const retryRef = useRef<HTMLButtonElement>(null);
  // Try again held focus when the list arrived: Scan takes its place.
  const focusScan = useRef(false);

  useNavLock(saving);

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
        focusScan.current =
          retryRef.current !== null &&
          document.activeElement === retryRef.current;
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

  useEffect(() => {
    if (load.kind !== "ready" || !focusScan.current) return;
    focusScan.current = false;
    scanRef.current?.focus();
  }, [load.kind]);

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

  // Try again stays mounted, held down, while it asks: focus stays on it.
  const retrying = load.kind === "loading" && attempt > 0;
  function retry() {
    if (load.kind === "loading") return;
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
  const status =
    load.kind === "loading" ? (
      "Loading your playlists…"
    ) : load.kind !== "ready" ? null : saveFailed ? (
      // Two lines on a phone rather than an ellipsis: it's the one thing to read.
      <span className="text-danger max-tab:block max-tab:leading-snug max-tab:whitespace-normal">
        Couldn&apos;t save your choice. Nothing was read.
      </span>
    ) : selectedCount === 0 ? (
      "Pick at least one source."
    ) : totalCount === 1 ? (
      saving && "Saving your choice…"
    ) : (
      <>
        {saving && "Saving "}
        <motion.span
          key={selectedCount}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.hover, ease: EASE_OUT }}
          className="num inline-block text-ink"
        >
          {selectedCount}
        </motion.span>{" "}
        of {totalCount} sources{saving && "…"}
      </>
    );

  // The strip stays in every state (spec §7.4), so nothing jumps when the
  // load ends; each state's one way on takes Scan's place.
  const primary =
    load.kind === "ready" ? (
      <Button
        ref={scanRef}
        onClick={scan}
        disabled={selectedCount === 0}
        aria-disabled={saving || undefined}
        className={HELD}
      >
        Scan
      </Button>
    ) : load.kind === "error" || retrying ? (
      <Button
        ref={retryRef}
        onClick={retry}
        aria-disabled={retrying || undefined}
        className={HELD}
      >
        Try again
      </Button>
    ) : load.kind === "disconnected" ? (
      // A plain <a>: /api/auth/login is a route handler (OAuth).
      <a
        href="/api/auth/login"
        data-variant="primary"
        className={buttonClass()}
      >
        Connect Spotify
      </a>
    ) : null;

  const previewing =
    preview === null
      ? undefined
      : preview.id === null
        ? liked
        : !excluded.has(preview.id);

  return (
    <PageShell title="What should I read?">
      <ActionBar
        status={status}
        end={
          primary && (
            // Keyed by what it does; the retry keeps one key while it asks.
            <motion.span
              key={load.kind === "loading" ? "error" : load.kind}
              className="block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fade}
            >
              {primary}
            </motion.span>
          )
        }
      />

      {load.kind === "error" && (
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-baseline gap-x-8">
            <p role="alert" className="text-lead text-danger">
              Spotify didn&apos;t send your playlists.
            </p>
            <a
              href="/api/auth/login"
              data-variant="ghost"
              className={buttonClass({ variant: "ghost" })}
            >
              Reconnect Spotify
            </a>
          </div>
          <p className="mono mt-1 text-ink-3">{load.message}</p>
        </div>
      )}

      {load.kind === "disconnected" && (
        <p className="text-lead text-ink">Spotify isn&apos;t connected.</p>
      )}

      {load.kind === "ready" && (
        <div
          className={
            playlists.length > 0
              ? "desk:grid desk:grid-cols-[15rem_minmax(0,1fr)] desk:items-start desk:gap-x-16"
              : "max-w-2xl"
          }
        >
          {/* First in the page, so on a phone the bulk buttons sit above
              everything they change, Liked Songs included. Pinned under the
              top strip on desktop, 32px clear of it. */}
          {playlists.length > 0 && (
            <div className="mb-6 desk:sticky desk:top-[calc(var(--strip-h)+var(--space-lg))] desk:col-start-1 desk:row-span-2 desk:row-start-1 desk:mb-0">
              <div className="relative">
                <Input
                  ref={filterRef}
                  type="search"
                  label="Filter playlists"
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
                  // Positioned by a wrapper: Button's own classes would win.
                  <span className="absolute right-0 bottom-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Clear filter"
                      onClick={clearFilter}
                      className="justify-center"
                    >
                      Clear
                    </Button>
                  </span>
                )}
              </div>
              {visible.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-6">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={allIn || saving}
                    onClick={() => setAll(true)}
                  >
                    {query ? bulkLabel("Select", visible.length) : "Select all"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={allOut || saving}
                    onClick={() => setAll(false)}
                  >
                    {query
                      ? bulkLabel("Deselect", visible.length)
                      : "Deselect all"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <ul className="mb-8 border-t-[1.5px] border-ink desk:col-start-2 desk:row-start-1">
            <SourceRow
              name="Liked Songs"
              glyph={<Heart strokeWidth={1.75} className="size-5" />}
              checked={liked}
              onToggle={() => toggle(null)}
              onPreview={() => setPreview({ id: null, title: "Liked Songs" })}
              enterDelay={itemDelay(0)}
              changeDelay={sweep ? sweepDelay(0) : 0}
              disabled={saving}
            />
          </ul>

          {playlists.length === 0 ? (
            // SpotifySorter's own playlists are left out, so "none" can't
            // claim there are none on Spotify.
            <p className="text-ink-2">No other playlists to read.</p>
          ) : (
            <div className="desk:col-start-2 desk:row-start-2">
              {visible.length === 0 ? (
                <p className="text-ink-2">
                  No playlists match “{filter.trim()}”.
                </p>
              ) : (
                <ul className="border-t-[1.5px] border-ink">
                  {visible.map((p, i) => (
                    <SourceRow
                      key={p.id}
                      name={p.name}
                      cover={p.cover_url}
                      count={trackCount(p.track_count)}
                      checked={!excluded.has(p.id)}
                      onToggle={() => toggle(p.id)}
                      onPreview={() =>
                        setPreview({
                          id: p.id,
                          title: p.name,
                          total: p.track_count,
                        })
                      }
                      enterDelay={typed ? 0 : itemDelay(i + 1)}
                      changeDelay={sweep ? sweepDelay(i + 1) : 0}
                      disabled={saving}
                    />
                  ))}
                </ul>
              )}
              {/* Keyboard only: one stop from the end of the list back up
                  to Scan, instead of two Shift+Tabs a row. */}
              {selectedCount > 0 && (
                <div className="sr-only focus-within:not-sr-only focus-within:mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => scanRef.current?.focus()}
                  >
                    Back to Scan
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <PlaylistPreviewModal
        open={preview !== null}
        playlistId={preview?.id ?? null}
        liked={preview !== null && preview.id === null}
        title={preview?.title ?? ""}
        total={preview?.total}
        selected={previewing}
        onToggle={preview ? () => toggle(preview.id) : undefined}
        toggleDisabled={saving}
        onClose={() => setPreview(null)}
      />
    </PageShell>
  );
}
