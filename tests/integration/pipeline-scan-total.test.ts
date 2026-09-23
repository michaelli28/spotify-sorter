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
import { writeCache, defaultCache, patchCache } from "@/src/lib/cache";

// The scan page fills its crate by playlists done ÷ playlists total. The first
// "playlists" event used to count Liked Songs in the total and the rest didn't,
// so the fill jumped backwards (0 of 3, then 1 of 2) and a record went missing.
// Liked Songs is its own stage ("liked"), so the playlists total is playlists.

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-scan-total-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

async function seed(includeLiked: boolean) {
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      scope: {
        included_playlist_ids: ["p1", "p2"],
        excluded_playlist_ids: [],
        include_liked_songs: includeLiked,
      },
    }),
  );
}

const row = (id: string) => ({
  track: {
    id,
    name: `Song ${id}`,
    is_local: false,
    artists: [{ id: `a-${id}`, name: `Artist ${id}` }],
  },
});

function spotify() {
  server.use(
    http.get("https://api.spotify.com/v1/playlists/:id", ({ params }) =>
      HttpResponse.json({
        snapshot_id: `snap-${String(params.id)}`,
        tracks: { total: 1 },
      }),
    ),
    http.get("https://api.spotify.com/v1/playlists/:id/items", ({ params }) =>
      HttpResponse.json({ items: [row(`t-${String(params.id)}`)], next: null }),
    ),
    http.get("https://api.spotify.com/v1/me/tracks", () =>
      HttpResponse.json({ total: 1, items: [row("t-liked")], next: null }),
    ),
    http.get("https://api.spotify.com/v1/artists", ({ request }) => {
      const ids = new URL(request.url).searchParams.get("ids")!.split(",");
      return HttpResponse.json({
        artists: ids.map((id) => ({ id, name: id, genres: [] })),
      });
    }),
  );
}

async function events() {
  const seen: Array<{ stage: string; current: number; total: number }> = [];
  await runScan({
    accessToken: "AT",
    onProgress: (stage, current, total) => seen.push({ stage, current, total }),
  });
  return seen;
}

describe("runScan playlists progress", () => {
  it("carries the same total on every playlists event, Liked Songs included", async () => {
    await seed(true);
    spotify();
    const seen = await events();
    const playlists = seen.filter((e) => e.stage === "playlists");
    expect(playlists.map((e) => e.total)).toEqual([2, 2, 2]);
    expect(playlists.map((e) => e.current)).toEqual([0, 1, 2]);
    // Liked Songs still reports on its own stage.
    expect(seen).toContainEqual({ stage: "liked", current: 1, total: 1 });
  });

  it("carries the same total when Liked Songs is left out", async () => {
    await seed(false);
    spotify();
    const playlists = (await events()).filter((e) => e.stage === "playlists");
    expect(playlists.map((e) => e.total)).toEqual([2, 2, 2]);
  });
});
