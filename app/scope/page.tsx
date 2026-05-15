"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { PlaylistCheckboxCard } from "@/src/components/scope/PlaylistCheckboxCard";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

export default function ScopePage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<OwnedPlaylist[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [includeLiked, setIncludeLiked] = useState(true);

  useEffect(() => {
    fetch("/api/spotify/playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists ?? []));
  }, []);

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: 0.04, delayChildren: 0.1 },
              },
            }}
            className="grid grid-cols-2 gap-4"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <button
                type="button"
                onClick={() => setIncludeLiked((v) => !v)}
                className="block w-full text-left p-4 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] transition-colors"
              >
                <div
                  className={`text-[var(--color-text-primary)] relative inline-block ${includeLiked ? "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-[var(--color-accent)]" : ""}`}
                >
                  Liked Songs
                </div>
                <div className="text-sm text-[var(--color-text-tertiary)] mt-1">
                  read-only — never modified
                </div>
              </button>
            </motion.div>
            {playlists.map((p) => (
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
                />
              </motion.div>
            ))}
          </motion.div>
          <div className="pt-12">
            <Button onClick={scan}>Scan</Button>
          </div>
        </>
      )}
    </PageShell>
  );
}
