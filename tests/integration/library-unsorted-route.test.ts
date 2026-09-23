// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "@/app/api/library/unsorted/route";

// The diff page's "N new tracks to sort" list. Read-only, the unsorted rule,
// and the labelling sample's songs never appear in it (the total still counts
// them, so the sentence stays true).

const ISO = "2026-09-01T00:00:00.000Z";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-unsorted-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

function cacheWith(trackCount: number, sortedIds: string[] = []) {
  const tracks: Record<string, unknown> = {};
  for (let i = 1; i <= trackCount; i++)
    tracks[`t${i}`] = { artist_id: "a1", title: `Song ${i}`, first_seen: ISO };
  const assignments = Object.fromEntries(
    sortedIds.map((id) => [
      id,
      {
        matches: [{ category_id: "c1", score: 80 }],
        classified_at: ISO,
        override: null,
      },
    ]),
  );
  return {
    version: 2,
    auth: { refresh_token: "rt-secret", expires_at: ISO },
    config: {
      prefix: "✨",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    artists: { a1: { name: "Mac Miller", genres: [] } },
    tracks,
    categories: {},
    assignments,
    runs: [],
    playlist_snapshots: {},
    liked_songs_fingerprint: null,
  };
}

async function seed(body: unknown) {
  await writeFile(join(dir, "cache.json"), JSON.stringify(body), "utf-8");
}

const get = (query = "") =>
  GET(new Request(`http://localhost/api/library/unsorted${query}`));

describe("GET /api/library/unsorted", () => {
  it("lists unsorted tracks with title and artist", async () => {
    await seed(cacheWith(3, ["t2"]));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 2,
      tracks: [
        { id: "t1", title: "Song 1", artist: "Mac Miller" },
        { id: "t3", title: "Song 3", artist: "Mac Miller" },
      ],
    });
  });

  it("returns 50 by default and at most `limit`", async () => {
    await seed(cacheWith(120));
    const all = await (await get()).json();
    expect(all.total).toBe(120);
    expect(all.tracks).toHaveLength(50);
    const five = await (await get("?limit=5")).json();
    expect(five.tracks.map((t: { id: string }) => t.id)).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect((await (await get("?limit=200")).json()).tracks).toHaveLength(120);
  });

  it.each(["0", "-1", "201", "abc", "2.5"])(
    "rejects limit=%s",
    async (limit) => {
      await seed(cacheWith(3));
      const res = await get(`?limit=${limit}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_limit" });
    },
  );

  it("drops the labelling sample's songs from the list, not the total", async () => {
    await seed(cacheWith(4));
    await mkdir(join(dir, "labels"), { recursive: true });
    await writeFile(
      join(dir, "labels", "sample.json"),
      JSON.stringify({
        seed: "s",
        created_at: ISO,
        random_track_ids: ["t1"],
        relabel_track_ids: ["t1"],
        pairs: [{ pair_id: "p1", track_id: "t3", category_id: "c1" }],
      }),
    );
    const body = await (await get("?limit=2")).json();
    expect(body.total).toBe(4);
    expect(body.tracks.map((t: { id: string }) => t.id)).toEqual(["t2", "t4"]);
  });

  // The cache lists oldest scan first. Past `limit` waiting tracks, older
  // leftovers pushed the latest scan's tracks out of /diff's slip.
  it("lists the latest scan first, in Spotify's order inside each scan", async () => {
    const cache = cacheWith(5);
    const at = (iso: string) => ({ artist_id: "a1", first_seen: iso });
    const OLD = "2026-08-01T00:00:00.000Z";
    const NEW = "2026-09-20T00:00:00.000Z";
    Object.assign(cache.tracks, {
      t1: { ...at(OLD), title: "Song 1" },
      t2: { ...at(OLD), title: "Song 2" },
      t3: { ...at(OLD), title: "Song 3" },
      t4: { ...at(NEW), title: "Song 4" },
      t5: { ...at(NEW), title: "Song 5" },
    });
    await seed(cache);
    const ids = async (q: string) =>
      (await (await get(q)).json()).tracks.map((t: { id: string }) => t.id);
    expect(await ids("")).toEqual(["t4", "t5", "t1", "t2", "t3"]);
    expect(await ids("?limit=2")).toEqual(["t4", "t5"]);
  });

  it("never writes: the cache file is byte-for-byte untouched", async () => {
    await seed({ ...cacheWith(2), extra_field: "kept" });
    const path = join(dir, "cache.json");
    const before = await readFile(path);
    await get();
    expect((await readFile(path)).equals(before)).toBe(true);
    expect(await readdir(dir)).toEqual(["cache.json"]);
  });

  it("answers 409 for a cache from another version", async () => {
    await seed({ ...cacheWith(1), version: 99 });
    const res = await get();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "cache_version_mismatch" });
  });

  it("is empty on a first run", async () => {
    expect(await (await get()).json()).toEqual({ total: 0, tracks: [] });
  });
});
