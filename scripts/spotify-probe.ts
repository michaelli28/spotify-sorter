// SPIKE: read-only live probe of which Spotify API shape this app gets.
// GET requests only. Refreshing the token rewrites `auth` in data/cache.json.
// Prints status codes and field names only: no names, IDs or tokens.
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { ensureFreshToken } from "@/src/lib/spotify/client";
import { spotifyApi } from "@/src/lib/spotify/urls";

process.loadEnvFile(".env.local");

type Json = Record<string, unknown>;

async function get(token: string, path: string) {
  const r = await fetch(spotifyApi(path), {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = r.headers.get("content-type")?.includes("json")
    ? ((await r.json()) as Json)
    : null;
  return { status: r.status, body };
}

const shape = (v: unknown) =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

async function main() {
  const token = await ensureFreshToken(undefined);
  const cache = await readCache(join(process.cwd(), "data", "cache.json"));

  const me = await get(token, "/me");
  console.log("GET /me", me.status);
  const userId = me.body?.id;

  const lists = await get(token, "/me/playlists?limit=50");
  const items = (lists.body?.items ?? []) as Json[];
  const owned = items.find((p) => (p.owner as Json | undefined)?.id === userId);
  console.log("GET /me/playlists", lists.status, {
    playlistKeys: owned ? Object.keys(owned).sort() : [],
    hasItemsTotal: shape((owned?.items as Json | undefined)?.total),
    hasTracksTotal: shape((owned?.tracks as Json | undefined)?.total),
  });

  if (owned) {
    const id = owned.id as string;
    const newItems = await get(token, `/playlists/${id}/items?limit=2`);
    const row = ((newItems.body?.items ?? []) as Json[])[0];
    console.log("GET /playlists/{id}/items", newItems.status, {
      rowKeys: row ? Object.keys(row).sort() : [],
      item: shape(row?.item),
      track: shape(row?.track),
    });
    const oldItems = await get(token, `/playlists/${id}/tracks?limit=2`);
    console.log("GET /playlists/{id}/tracks (old)", oldItems.status);
  }

  const artistId = Object.keys(cache.artists)[0];
  if (artistId) {
    const batch = await get(token, `/artists?ids=${artistId}`);
    console.log("GET /artists?ids= (old batch)", batch.status);
    const single = await get(token, `/artists/${artistId}`);
    console.log("GET /artists/{id}", single.status, {
      genres: shape(single.body?.genres),
    });
  }
}

main().catch((err: unknown) => {
  console.error("probe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
