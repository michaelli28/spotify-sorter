// @vitest-environment node
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runScan } from "@/src/lib/pipeline/scan";
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

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      scope: {
        included_playlist_ids: ["p1"],
        excluded_playlist_ids: [],
        include_liked_songs: true,
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runScan", () => {
  it("fetches tracks + artists, dedupes, persists to cache", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p1/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "t1",
                name: "Self Care",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
            {
              track: {
                id: "t2",
                name: "Spike",
                is_local: false,
                artists: [{ id: "a2", name: "Mac Miller" }],
              },
            },
          ],
          next: null,
        }),
      ),
      http.get("https://api.spotify.com/v1/me/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "t1",
                name: "Self Care",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
          ],
          next: null,
        }),
      ),
      http.get("https://api.spotify.com/v1/artists", ({ request }) => {
        const ids = new URL(request.url).searchParams.get("ids")!.split(",");
        return HttpResponse.json({
          artists: ids.map((id) => ({
            id,
            name: `n-${id}`,
            genres: ["hip hop"],
          })),
        });
      }),
    );
    const result = await runScan({ accessToken: "AT" });
    expect(result.unique_tracks).toBe(2);
    const cache = await readCache(join(dir, "cache.json"));
    expect(Object.keys(cache.tracks).sort()).toEqual(["t1", "t2"]);
    expect(cache.artists["a1"]!.genres).toContain("hip hop");
  });

  it("throws EMPTY_LIBRARY when zero tracks in scope", async () => {
    await writeCache(
      join(dir, "cache.json"),
      patchCache(defaultCache(), {
        scope: {
          included_playlist_ids: [],
          excluded_playlist_ids: [],
          include_liked_songs: false,
        },
      }),
    );
    await expect(runScan({ accessToken: "AT" })).rejects.toThrow(
      /EMPTY_LIBRARY/,
    );
  });
});
