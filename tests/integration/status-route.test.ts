// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  writeFile,
  stat,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "@/app/api/status/route";

let dir: string;
const savedEnv = {
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-status-"));
  process.env.SORTER_DATA_DIR = dir;
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ISO = "2026-09-01T00:00:00.000Z";
const track = (title: string) => ({ artist_id: "a1", title, first_seen: ISO });
const category = (name: string, playlist: string | null) => ({
  name,
  description: "",
  spotify_playlist_id: playlist,
  created_at: ISO,
  example_track_ids: [],
});
const assignment = (categoryId: string) => ({
  matches: [{ category_id: categoryId, score: 80 }],
  classified_at: ISO,
  override: null,
});

function cacheFile(over: Record<string, unknown> = {}) {
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
    artists: { a1: { name: "Artist", genres: [] } },
    tracks: { t1: track("One"), t2: track("Two"), t3: track("Three") },
    categories: {
      c1: category("Night Drive", "sp1"),
      c2: category("Rain", null),
    },
    // t3 has no assignment; "gone" belongs to a track no longer in the library.
    assignments: {
      t1: assignment("c1"),
      t2: assignment("c2"),
      gone: assignment("c1"),
    },
    runs: [],
    playlist_snapshots: {},
    liked_songs_fingerprint: null,
    ...over,
  };
}

async function seed(body: unknown): Promise<string> {
  const path = join(dir, "cache.json");
  await writeFile(path, JSON.stringify(body, null, 2), "utf-8");
  return path;
}

describe("GET /api/status", () => {
  it("summarises the library without the secrets", async () => {
    await seed(cacheFile());
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      configured: false,
      connected: true,
      tracks: 3,
      categories: 2,
      unsorted: 1,
      applied: 1,
      version_mismatch: false,
      // Apply's rule: the orphan "gone" assignment is not a track, so c1 has 1.
      category_counts: { c1: 1, c2: 1 },
      label_study_open: false,
    });
    expect(JSON.stringify(body)).not.toContain("rt-secret");
  });

  // withSpotify/ensureFreshToken re-save the cache and strip unknown fields;
  // the nav calls this on every page, so it must never write.
  it("leaves the cache file byte-for-byte untouched", async () => {
    const path = await seed({ ...cacheFile(), extra_field: "kept" });
    const before = await readFile(path);
    const mtime = (await stat(path)).mtimeMs;
    await GET();
    expect((await readFile(path)).equals(before)).toBe(true);
    expect((await stat(path)).mtimeMs).toBe(mtime);
    expect(await readdir(dir)).toEqual(["cache.json"]);
  });

  it("reports a first run when there is no cache file, and creates none", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: false,
      connected: false,
      tracks: 0,
      categories: 0,
      unsorted: 0,
      applied: 0,
      version_mismatch: false,
      category_counts: {},
      label_study_open: false,
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("reports a version mismatch instead of failing", async () => {
    await seed({ ...cacheFile(), version: 99 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: false,
      connected: false,
      tracks: 0,
      categories: 0,
      unsorted: 0,
      applied: 0,
      version_mismatch: true,
      category_counts: {},
      label_study_open: false,
    });
  });

  it("is not connected when the cache holds no Spotify token", async () => {
    await seed(cacheFile({ auth: null }));
    const body = await (await GET()).json();
    expect(body.connected).toBe(false);
    expect(body.tracks).toBe(3);
  });

  it("is configured once both keys in the environment are valid", async () => {
    await seed(cacheFile());
    process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect((await (await GET()).json()).configured).toBe(true);
    process.env.ANTHROPIC_API_KEY = "not-a-key";
    expect((await (await GET()).json()).configured).toBe(false);
  });

  // The classify set piece re-reads these after every batch, so they follow
  // the saved cutoff: below it a track still lands in its top match.
  it("counts every category's tracks at the saved threshold", async () => {
    await seed(
      cacheFile({
        config: {
          prefix: "✨",
          confidence_threshold: 90,
          anthropic_model: "claude-haiku-4-5-20251001",
        },
        assignments: {
          t1: {
            matches: [
              { category_id: "c1", score: 95 },
              { category_id: "c2", score: 92 },
            ],
            classified_at: ISO,
            override: null,
          },
          t2: assignment("c2"),
          t3: {
            matches: [{ category_id: "c1", score: 95 }],
            classified_at: ISO,
            override: { category_id: "c2", set_at: ISO },
          },
        },
        categories: {
          c1: category("Night Drive", "sp1"),
          c2: category("Rain", null),
          c3: category("Empty", null),
        },
      }),
    );
    const body = await (await GET()).json();
    expect(body.category_counts).toEqual({ c1: 1, c2: 3, c3: 0 });
  });

  it("reports the labelling study open while its sample is unlabelled", async () => {
    await seed(cacheFile());
    await mkdir(join(dir, "labels"), { recursive: true });
    await writeFile(
      join(dir, "labels", "sample.json"),
      JSON.stringify({
        seed: "s",
        created_at: ISO,
        random_track_ids: ["t1"],
        relabel_track_ids: [],
        pairs: [],
      }),
    );
    await writeFile(
      join(dir, "labels", "definitions.md"),
      "## Night Drive\n## Rain\n",
    );
    expect((await (await GET()).json()).label_study_open).toBe(true);
  });
});
