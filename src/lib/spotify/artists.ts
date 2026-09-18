import type { Artist } from "@/src/lib/cache";
import { spotifyApi } from "./urls";

export async function fetchArtists(
  ids: string[],
  accessToken: string,
): Promise<Record<string, Artist>> {
  const out: Record<string, Artist> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = spotifyApi(`/artists?ids=${chunk.join(",")}`);
    const r = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok)
      throw new Error(`Spotify artists ${r.status}: ${await r.text()}`);
    const json = (await r.json()) as {
      artists: Array<{ id: string; name: string; genres: string[] } | null>;
    };
    for (const a of json.artists) {
      if (!a) continue;
      out[a.id] = { name: a.name, genres: a.genres };
    }
  }
  return out;
}
