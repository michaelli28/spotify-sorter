// @vitest-environment node
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runApplyFromCache } from "@/src/lib/pipeline/apply";
import { POST as applyPOST } from "@/app/api/spotify/apply/route";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const TOKEN = "test-token";

function seedCache(overrides: Parameters<typeof patchCache>[1]) {
  return patchCache(defaultCache(), {
    config: {
      prefix: "SS",
      confidence_threshold: 70,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    artists: { a1: { name: "Mac Miller", genres: ["hip hop"] } },
    tracks: {
      t1: {
        artist_id: "a1",
        title: "Self Care",
        first_seen: "2026-05-13T00:00:00.000Z",
      },
    },
    categories: {
      "cat-1": {
        name: "Aesthetic Rap",
        description: "Cloud rap vibes",
        spotify_playlist_id: null,
        created_at: "2026-05-13T00:00:00.000Z",
        example_track_ids: [],
      },
    },
    assignments: {
      t1: {
        matches: [{ category_id: "cat-1", score: 85 }],
        override: null,
        classified_at: "2026-05-13T00:00:00.000Z",
      },
    },
    ...overrides,
  });
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-apply-pipeline-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runApplyFromCache", () => {
  it("creates playlist, adds tracks, persists playlist_id", async () => {
    await writeCache(join(dir, "cache.json"), seedCache({}));
    let puts = 0;

    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
      http.post("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ id: "p_new" }),
      ),
      http.post("https://api.spotify.com/v1/playlists/p_new/items", () =>
        HttpResponse.json({ snapshot_id: "snap1" }),
      ),
      http.put("https://api.spotify.com/v1/playlists/p_new/items", () => {
        puts++;
        return HttpResponse.json({ snapshot_id: "snap1" });
      }),
    );

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.tracks_added).toBe(1);
    expect(result.tracks_removed).toBe(0);
    // A new playlist is empty: it takes the create + add path, never a replace.
    expect(puts).toBe(0);
    expect(result.playlists[0]).toMatchObject({
      id: "p_new",
      category_id: "cat-1",
      created: true,
      track_count: 1,
    });

    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.categories["cat-1"]!.spotify_playlist_id).toBe("p_new");
  });

  it("never sends Spotify an assignment key that isn't a real track", async () => {
    await writeCache(
      join(dir, "cache.json"),
      seedCache({
        assignments: {
          t1: {
            matches: [{ category_id: "cat-1", score: 85 }],
            override: null,
            classified_at: "2026-05-13T00:00:00.000Z",
          },
          // An orphan the old classifier wrote: a "title — artist" string.
          "6Matilda — Harry Styles": {
            matches: [{ category_id: "cat-1", score: 90 }],
            override: null,
            classified_at: "2026-05-13T00:00:00.000Z",
          },
        },
      }),
    );
    let sent: string[] = [];
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
      http.post("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ id: "p_new" }),
      ),
      http.post(
        "https://api.spotify.com/v1/playlists/p_new/items",
        async ({ request }) => {
          sent = ((await request.json()) as { uris: string[] }).uris;
          return HttpResponse.json({ snapshot_id: "snap1" });
        },
      ),
    );

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(sent).toEqual(["spotify:track:t1"]);
    expect(result.tracks_added).toBe(1);
  });

  it("reuses existing playlist by stored id, skips existing tracks (idempotent)", async () => {
    await writeCache(
      join(dir, "cache.json"),
      seedCache({
        categories: {
          "cat-1": {
            name: "Aesthetic Rap",
            description: "Cloud rap vibes",
            spotify_playlist_id: "p_existing",
            created_at: "2026-05-13T00:00:00.000Z",
            example_track_ids: [],
          },
        },
      }),
    );

    let addTracksCalled = false;
    let replaceCalled = false;
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p_existing/items", () =>
        HttpResponse.json({
          items: [{ track: { id: "t1" } }],
          next: null,
        }),
      ),
      http.post("https://api.spotify.com/v1/playlists/p_existing/items", () => {
        addTracksCalled = true;
        return HttpResponse.json({ snapshot_id: "snap2" });
      }),
      http.put("https://api.spotify.com/v1/playlists/p_existing/items", () => {
        replaceCalled = true;
        return HttpResponse.json({ snapshot_id: "snap2" });
      }),
    );

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.tracks_added).toBe(0);
    expect(result.tracks_removed).toBe(0);
    expect(addTracksCalled).toBe(false);
    expect(replaceCalled).toBe(false);
    expect(result.playlists[0]).toMatchObject({
      id: "p_existing",
      created: false,
    });
  });

  it("first-run finds existing playlist by name to avoid duplicates", async () => {
    await writeCache(join(dir, "cache.json"), seedCache({}));

    let createCalled = false;
    let replaced: string[] = [];
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            {
              id: "p_found",
              name: "SS Aesthetic Rap",
              owner: { id: "me" },
            },
          ],
          next: null,
        }),
      ),
      http.post("https://api.spotify.com/v1/me/playlists", () => {
        createCalled = true;
        return HttpResponse.json({ id: "p_should_not_create" });
      }),
      http.get("https://api.spotify.com/v1/playlists/p_found/items", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
      http.put(
        "https://api.spotify.com/v1/playlists/p_found/items",
        async ({ request }) => {
          replaced = ((await request.json()) as { uris: string[] }).uris;
          return HttpResponse.json({ snapshot_id: "snap3" });
        },
      ),
    );

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(createCalled).toBe(false);
    expect(replaced).toEqual(["spotify:track:t1"]);
    expect(result).toMatchObject({
      created: 0,
      updated: 1,
      tracks_added: 1,
      tracks_removed: 0,
    });
    expect(result.playlists[0]).toMatchObject({
      id: "p_found",
      created: false,
    });
  });
});

// Apply makes an existing playlist match the category exactly (spec §8.1):
// songs the owner added by hand in Spotify are removed.
// "Rain" and "SS Rain" both print as the playlist "SS Rain". With the sync,
// each Apply would replace one category's songs with the other's.
describe("runApplyFromCache with two categories named for one playlist", () => {
  it("refuses before calling Spotify or writing the cache", async () => {
    const category = (name: string) => ({
      name,
      description: "",
      spotify_playlist_id: null,
      created_at: "2026-05-13T00:00:00.000Z",
      example_track_ids: [],
    });
    await writeCache(
      join(dir, "cache.json"),
      seedCache({
        categories: {
          "cat-1": category("Rain"),
          "cat-2": category("Dusk"),
          "cat-3": category("SS Rain"),
        },
      }),
    );
    const before = await readCache(join(dir, "cache.json"));

    // onUnhandledRequest: "error" fails the test if Spotify is called.
    await expect(runApplyFromCache({ accessToken: TOKEN })).rejects.toThrow(
      '"Rain" and "SS Rain" would both be the playlist "SS Rain". Rename one on Review.',
    );
    expect(await readCache(join(dir, "cache.json"))).toEqual(before);
  });
});

describe("runApplyFromCache syncs an existing playlist", () => {
  const ITEMS = "https://api.spotify.com/v1/playlists/p_existing/items";

  // `n` real tracks, all filed in cat-1, whose playlist already exists.
  function seedExisting(n: number) {
    const ids = Array.from({ length: n }, (_, i) => `t${i + 1}`);
    return seedCache({
      tracks: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            artist_id: "a1",
            title: id,
            first_seen: "2026-05-13T00:00:00.000Z",
          },
        ]),
      ),
      assignments: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            matches: [{ category_id: "cat-1", score: 85 }],
            override: null,
            classified_at: "2026-05-13T00:00:00.000Z",
          },
        ]),
      ),
      categories: {
        "cat-1": {
          name: "Aesthetic Rap",
          description: "Cloud rap vibes",
          spotify_playlist_id: "p_existing",
          created_at: "2026-05-13T00:00:00.000Z",
          example_track_ids: [],
        },
      },
    });
  }

  // The playlist currently holds `current`; returns every write as
  // { method, uris } in the order Spotify saw them.
  function playlistHolds(current: string[]) {
    const writes: Array<{ method: string; uris: string[] }> = [];
    const write = async ({ request }: { request: Request }) => {
      const { uris } = (await request.json()) as { uris: string[] };
      writes.push({ method: request.method, uris });
      return HttpResponse.json(
        { snapshot_id: "snap" },
        { status: request.method === "POST" ? 201 : 200 },
      );
    };
    server.use(
      http.get(ITEMS, () =>
        HttpResponse.json({
          items: current.map((id) => ({ item: { id } })),
          next: null,
        }),
      ),
      http.put(ITEMS, write),
      http.post(ITEMS, write),
    );
    return writes;
  }

  it("still writes nothing when the same songs are there with a hand-added duplicate", async () => {
    await writeCache(join(dir, "cache.json"), seedExisting(2));
    const writes = playlistHolds(["t2", "t1", "t1"]);

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(writes).toEqual([]);
    expect(result).toMatchObject({
      updated: 0,
      tracks_added: 0,
      tracks_removed: 0,
    });
  });

  it("replaces the playlist and counts the songs it removed", async () => {
    await writeCache(join(dir, "cache.json"), seedExisting(1));
    const writes = playlistHolds(["t1", "hand1", "hand2"]);

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(writes).toEqual([{ method: "PUT", uris: ["spotify:track:t1"] }]);
    expect(result).toMatchObject({
      created: 0,
      updated: 1,
      tracks_added: 0,
      tracks_removed: 2,
    });
    expect(result.playlists[0]).toMatchObject({
      id: "p_existing",
      track_count: 1,
      created: false,
    });
  });

  it("counts added and removed as sets, so a duplicate is one removal", async () => {
    await writeCache(join(dir, "cache.json"), seedExisting(2));
    const writes = playlistHolds(["hand1", "hand1", "t2"]);

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(writes).toEqual([
      { method: "PUT", uris: ["spotify:track:t1", "spotify:track:t2"] },
    ]);
    expect(result.tracks_added).toBe(1);
    expect(result.tracks_removed).toBe(1);
  });

  it("empties a playlist whose category has no songs left", async () => {
    // patchCache merges records, so drop the assignments by hand.
    await writeCache(join(dir, "cache.json"), {
      ...seedExisting(1),
      assignments: {},
    });
    const writes = playlistHolds(["t1"]);

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(writes).toEqual([{ method: "PUT", uris: [] }]);
    expect(result.tracks_removed).toBe(1);
  });

  it("replaces more than 100 songs as a PUT of 100, then POSTs of 100", async () => {
    await writeCache(join(dir, "cache.json"), seedExisting(250));
    const writes = playlistHolds(["hand1"]);

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(
      writes.map((w) => `${w.method} ${w.uris[0]} ${w.uris.length}`),
    ).toEqual([
      "PUT spotify:track:t1 100",
      "POST spotify:track:t101 100",
      "POST spotify:track:t201 50",
    ]);
    expect(result.tracks_added).toBe(250);
    expect(result.tracks_removed).toBe(1);
  });

  it("records the removals in the run summary", async () => {
    await writeCache(join(dir, "cache.json"), seedExisting(1));
    playlistHolds(["t1", "hand1", "hand2"]);

    await runApplyFromCache({ accessToken: TOKEN });

    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.runs.at(-1)!.summary).toBe(
      "0 created, 1 updated, 0 tracks added, 2 tracks removed.",
    );
  });

  it("sends tracks_removed in the Apply stream's done event", async () => {
    await writeCache(join(dir, "cache.json"), seedExisting(1));
    playlistHolds(["t1", "hand1"]);

    const res = await applyPOST(
      new Request("http://127.0.0.1:3000/api/spotify/apply", {
        method: "POST",
        headers: { cookie: "sorter_access_token=AT" },
      }),
    );
    const text = await res.text();
    const done = /event: done\ndata: (.*)\n/.exec(text);

    expect(done, text).not.toBeNull();
    expect(JSON.parse(done![1]!)).toMatchObject({
      tracks_added: 0,
      tracks_removed: 1,
    });
  });
});
