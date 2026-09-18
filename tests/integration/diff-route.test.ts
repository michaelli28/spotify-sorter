// @vitest-environment node
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "@/app/api/spotify/diff/route";
import { writeCache, defaultCache, patchCache } from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      auth: {
        refresh_token: "RT",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      scope: {
        included_playlist_ids: ["p1"],
        excluded_playlist_ids: [],
        include_liked_songs: false,
      },
      artists: { a1: { name: "A", genres: [] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "old",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("GET /api/spotify/diff", () => {
  it("returns added/removed against cached tracks", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p1/items", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "t1",
                name: "old",
                is_local: false,
                artists: [{ id: "a1", name: "A" }],
              },
            },
            {
              track: {
                id: "t2",
                name: "new",
                is_local: false,
                artists: [{ id: "a1", name: "A" }],
              },
            },
          ],
          next: null,
        }),
      ),
    );
    const req = new Request("http://127.0.0.1/api/spotify/diff", {
      headers: { cookie: "sorter_access_token=AT" },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.added).toEqual(["t2"]);
    expect(body.removed).toEqual([]);
  });
});
