// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readArtwork, recordArtwork } from "@/src/lib/artwork/store";

// data/artwork.json: the album-art URL store. Its own file, so art never
// touches data/cache.json.

const ISO = "2026-09-23T00:00:00.000Z";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-art-store-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const id = (n: number) => `track${String(n).padStart(17, "0")}`;
const url = (n: number) => `https://i.scdn.co/image/${n}`;

describe("artwork store", () => {
  it("reads as empty before anything is stored, and creates nothing", async () => {
    expect(await readArtwork()).toEqual({ version: 1, tracks: {} });
    expect(await readdir(dir)).toEqual([]);
  });

  it("records a url and a no-art null, each with when it was fetched", async () => {
    await recordArtwork(id(1), url(1), ISO);
    await recordArtwork(id(2), null, ISO);
    expect(await readArtwork()).toEqual({
      version: 1,
      tracks: {
        [id(1)]: { url: url(1), fetched_at: ISO },
        [id(2)]: { url: null, fetched_at: ISO },
      },
    });
  });

  it("loses no entry when many writes race, and leaves valid JSON", async () => {
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => recordArtwork(id(i), url(i), ISO)),
    );
    const raw = await readFile(join(dir, "artwork.json"), "utf-8");
    expect(Object.keys(JSON.parse(raw).tracks)).toHaveLength(40);
    // Atomic writes: every tmp file was renamed into place.
    expect(await readdir(dir)).toEqual(["artwork.json"]);
  });

  it("keeps working after one write fails", async () => {
    await expect(recordArtwork(id(1), "not a url", ISO)).rejects.toThrow();
    await recordArtwork(id(2), url(2), ISO);
    expect(Object.keys((await readArtwork()).tracks)).toEqual([id(2)]);
  });

  it("starts over from a corrupt file instead of failing every request", async () => {
    await writeFile(join(dir, "artwork.json"), "{half", "utf-8");
    expect(await readArtwork()).toEqual({ version: 1, tracks: {} });
    await recordArtwork(id(1), url(1), ISO);
    const raw = await readFile(join(dir, "artwork.json"), "utf-8");
    expect(JSON.parse(raw).tracks[id(1)].url).toBe(url(1));
  });
});
