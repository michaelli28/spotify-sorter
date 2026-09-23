import { ScopeSchema } from "@/src/lib/cache/schema";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

export interface Selection {
  excluded: ReadonlySet<string>;
  liked: boolean;
}

export interface Sources {
  playlists: readonly OwnedPlaylist[];
  selection: Selection;
}

async function fetchPlaylists(): Promise<OwnedPlaylist[]> {
  const r = await fetch("/api/spotify/playlists");
  const body = (await r.json().catch(() => null)) as {
    playlists?: unknown;
    error?: unknown;
  } | null;
  if (!r.ok || !Array.isArray(body?.playlists)) {
    throw new Error(
      typeof body?.error === "string" ? body.error : `HTTP ${r.status}`,
    );
  }
  return body.playlists as OwnedPlaylist[];
}

// /api/cache also carries per-song scores (the blind-label study): read the
// scope and nothing else from it.
async function fetchSavedScope() {
  const r = await fetch("/api/cache");
  if (!r.ok) return null;
  const body = (await r.json()) as { scope?: unknown } | null;
  const parsed = ScopeSchema.safeParse(body?.scope);
  return parsed.success ? parsed.data : null;
}

/** No stored Spotify token: Try again can't help, only connecting can. */
export class SpotifyNotConnected extends Error {}

// Asked only after a failure. An unreadable status counts as connected, so
// the page keeps its Try again.
async function knownDisconnected(): Promise<boolean> {
  try {
    const r = await fetch("/api/status");
    if (!r.ok) return false;
    const body = (await r.json()) as { connected?: unknown } | null;
    return body?.connected === false;
  } catch {
    return false;
  }
}

/**
 * The playlists, with last time's choice restored. An unreadable saved scope
 * falls back to everything selected; a playlist made since is selected.
 */
export async function loadSources(): Promise<Sources> {
  const [list, saved] = await Promise.allSettled([
    fetchPlaylists(),
    fetchSavedScope(),
  ]);
  if (list.status === "rejected") {
    if (await knownDisconnected()) throw new SpotifyNotConnected();
    throw list.reason;
  }
  const scope = saved.status === "fulfilled" ? saved.value : null;
  const ids = new Set(list.value.map((p) => p.id));
  return {
    playlists: list.value,
    selection: {
      excluded: new Set(
        (scope?.excluded_playlist_ids ?? []).filter((id) => ids.has(id)),
      ),
      liked: scope?.include_liked_songs ?? true,
    },
  };
}

export function withToggled(
  set: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function withAll(
  set: ReadonlySet<string>,
  ids: readonly string[],
  excluded: boolean,
): ReadonlySet<string> {
  const next = new Set(set);
  for (const id of ids) {
    if (excluded) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** "Deselect these 12", "Deselect this one": says which rows it touches. */
export function bulkLabel(verb: "Select" | "Deselect", n: number): string {
  return n === 1 ? `${verb} this one` : `${verb} these ${n}`;
}

export function trackCount(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "track" : "tracks"}`;
}
