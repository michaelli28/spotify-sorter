import * as fs from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { dataDir } from "@/src/lib/config/paths";
import { ArtworkSchema, type Artwork } from "./schema";

// Its own file on purpose: art must never read or rewrite data/cache.json.
export const artworkPath = (): string => join(dataDir(), "artwork.json");

const empty = (): Artwork => ({ version: 1, tracks: {} });

// A missing or unreadable store is an empty one. It only caches thumbnail
// URLs oEmbed can hand back again, and the next write replaces it whole.
export async function readArtwork(): Promise<Artwork> {
  let raw: string;
  try {
    raw = await fs.readFile(artworkPath(), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw err;
  }
  try {
    return ArtworkSchema.parse(JSON.parse(raw));
  } catch {
    return empty();
  }
}

// Writes go through one promise chain, each re-reading the file inside it, so
// concurrent misses can't overwrite each other's entries. tmp + rename keeps a
// reader from ever seeing half a file. The chain swallows a failure only to
// stay usable; the caller still gets the rejection.
let writeChain: Promise<void> = Promise.resolve();

export function recordArtwork(
  trackId: string,
  url: string | null,
  fetchedAt: string,
): Promise<void> {
  const write = writeChain.then(async () => {
    const current = await readArtwork();
    const next = ArtworkSchema.parse({
      ...current,
      tracks: { ...current.tracks, [trackId]: { url, fetched_at: fetchedAt } },
    });
    const path = artworkPath();
    await fs.mkdir(dataDir(), { recursive: true });
    const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
    await fs.writeFile(tmp, JSON.stringify(next), "utf-8");
    await fs.rename(tmp, path);
  });
  writeChain = write.catch(() => undefined);
  return write;
}
