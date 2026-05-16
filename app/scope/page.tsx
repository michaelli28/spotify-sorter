"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Heart, Search } from "lucide-react";
import { Button } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { PlaylistCheckboxCard } from "@/src/components/scope/PlaylistCheckboxCard";
import { PlaylistPreviewModal } from "@/src/components/scope/PlaylistPreviewModal";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

const LIKED_SENTINEL = "__liked_songs__";

interface PreviewState {
  playlistId: string | null;
  liked: boolean;
  title: string;
}

export default function ScopePage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<OwnedPlaylist[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [includeLiked, setIncludeLiked] = useState(true);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    fetch("/api/spotify/playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists ?? []));
  }, []);

  function toggle(id: string) {
    if (id === LIKED_SENTINEL) {
      setIncludeLiked((v) => !v);
      return;
    }
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setExcluded(new Set());
    setIncludeLiked(true);
  }

  function deselectAll() {
    setExcluded(new Set((playlists ?? []).map((p) => p.id)));
    setIncludeLiked(false);
  }

  const filteredPlaylists = useMemo(() => {
    if (!playlists) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, filter]);

  const selectedCount =
    (playlists ?? []).filter((p) => !excluded.has(p.id)).length +
    (includeLiked ? 1 : 0);
  const totalCount = (playlists ?? []).length + 1;

  async function scan() {
    const includedIds = (playlists ?? [])
      .filter((p) => !excluded.has(p.id))
      .map((p) => p.id);
    await fetch("/api/cache", {
      method: "PATCH",
      body: JSON.stringify({
        scope: {
          included_playlist_ids: includedIds,
          excluded_playlist_ids: Array.from(excluded),
          include_liked_songs: includeLiked,
        },
      }),
      headers: { "content-type": "application/json" },
    });
    router.push("/scan");
  }

  return (
    <PageShell eyebrow="Step one" title="What should I read?">
      {playlists === null && (
        <p className="text-[var(--color-text-secondary)]">
          Loading your library…
        </p>
      )}
      {playlists !== null && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--color-text-tertiary)]">
                {selectedCount} of {totalCount} selected
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline-offset-4 hover:underline"
              >
                Select all
              </button>
              <span className="text-[var(--color-text-tertiary)]">·</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline-offset-4 hover:underline"
              >
                Deselect all
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter playlists…"
                className="pl-9 pr-3 py-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] focus:border-[var(--color-border-strong)] outline-none text-sm w-64"
              />
            </div>
          </div>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: 0.02, delayChildren: 0.05 },
              },
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <PlaylistCheckboxCard
                playlist={{
                  id: LIKED_SENTINEL,
                  name: "Liked Songs",
                  track_count: 0,
                  cover_url: null,
                }}
                selected={includeLiked}
                onToggle={() => toggle(LIKED_SENTINEL)}
                onPreview={() =>
                  setPreview({
                    playlistId: null,
                    liked: true,
                    title: "Liked Songs",
                  })
                }
                subtitle="read-only — never modified"
                iconFallback={
                  <Heart className="w-6 h-6 text-[var(--color-accent)]" />
                }
              />
            </motion.div>
            {filteredPlaylists.map((p) => (
              <motion.div
                key={p.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <PlaylistCheckboxCard
                  playlist={p}
                  selected={!excluded.has(p.id)}
                  onToggle={() => toggle(p.id)}
                  onPreview={() =>
                    setPreview({
                      playlistId: p.id,
                      liked: false,
                      title: p.name,
                    })
                  }
                />
              </motion.div>
            ))}
          </motion.div>
          {filter.trim() && filteredPlaylists.length === 0 && (
            <p className="text-sm text-[var(--color-text-tertiary)] mt-6">
              No playlists match "{filter}".
            </p>
          )}
          <div className="pt-16 flex items-center gap-6">
            <Button onClick={scan} disabled={selectedCount === 0}>
              Scan
            </Button>
            {selectedCount === 0 && (
              <span className="text-sm text-[var(--color-text-tertiary)]">
                Pick at least one source to read.
              </span>
            )}
          </div>
        </>
      )}
      <PlaylistPreviewModal
        open={preview !== null}
        playlistId={preview?.playlistId ?? null}
        liked={preview?.liked}
        title={preview?.title ?? ""}
        onClose={() => setPreview(null)}
      />
    </PageShell>
  );
}
