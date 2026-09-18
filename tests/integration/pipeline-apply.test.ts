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
        reasoning: "Dreamy production",
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

    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
      http.post("https://api.spotify.com/v1/users/me/playlists", () =>
        HttpResponse.json({ id: "p_new" }),
      ),
      http.post("https://api.spotify.com/v1/playlists/p_new/tracks", () =>
        HttpResponse.json({ snapshot_id: "snap1" }),
      ),
    );

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.tracks_added).toBe(1);
    expect(result.playlists[0]).toMatchObject({
      id: "p_new",
      created: true,
      track_count: 1,
    });

    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.categories["cat-1"]!.spotify_playlist_id).toBe("p_new");
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
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p_existing/tracks", () =>
        HttpResponse.json({
          items: [{ track: { id: "t1" } }],
          next: null,
        }),
      ),
      http.post(
        "https://api.spotify.com/v1/playlists/p_existing/tracks",
        () => {
          addTracksCalled = true;
          return HttpResponse.json({ snapshot_id: "snap2" });
        },
      ),
    );

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(result.created).toBe(0);
    expect(result.tracks_added).toBe(0);
    expect(addTracksCalled).toBe(false);
    expect(result.playlists[0]).toMatchObject({
      id: "p_existing",
      created: false,
    });
  });

  it("first-run finds existing playlist by name to avoid duplicates", async () => {
    await writeCache(join(dir, "cache.json"), seedCache({}));

    let createCalled = false;
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
      http.post("https://api.spotify.com/v1/users/me/playlists", () => {
        createCalled = true;
        return HttpResponse.json({ id: "p_should_not_create" });
      }),
      http.get("https://api.spotify.com/v1/playlists/p_found/tracks", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
      http.post("https://api.spotify.com/v1/playlists/p_found/tracks", () =>
        HttpResponse.json({ snapshot_id: "snap3" }),
      ),
    );

    const result = await runApplyFromCache({ accessToken: TOKEN });

    expect(createCalled).toBe(false);
    expect(result.playlists[0]).toMatchObject({
      id: "p_found",
      created: false,
    });
  });
});
