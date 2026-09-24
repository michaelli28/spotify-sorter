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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "@/app/api/spotify/playlists/route";

// /scope listed the app's own ✨ playlists as sources, ticked by default, so a
// scan fed its output back in as input.

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ISO = "2026-09-01T00:00:00.000Z";
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-playlists-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeFile(
    join(dir, "cache.json"),
    JSON.stringify({
      version: 2,
      auth: null,
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
      artists: {},
      tracks: {},
      categories: {
        c1: {
          name: "Night Drive",
          description: "",
          // Recorded under a name that no longer carries the prefix.
          spotify_playlist_id: "rec1",
          created_at: ISO,
          example_track_ids: [],
        },
      },
      assignments: {},
      runs: [],
      playlist_snapshots: {},
      liked_songs_fingerprint: null,
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const playlist = (id: string, name: string) => ({
  id,
  name,
  owner: { id: "me" },
  items: { total: 5 },
  images: [],
});

describe("GET /api/spotify/playlists", () => {
  it("leaves out SpotifySorter's own playlists", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            playlist("rec1", "Night Drive (renamed in Spotify)"),
            playlist("pfx1", "✨ Old Category"),
            playlist("plain", "Late Night"),
            playlist("sparkle", "✨Sparkle Mix"),
          ],
          next: null,
        }),
      ),
    );
    const res = await GET(
      new Request("http://127.0.0.1:3000/api/spotify/playlists", {
        headers: { cookie: "sorter_access_token=tok" },
      }),
    );
    expect(res.status).toBe(200);
    const { playlists } = (await res.json()) as {
      playlists: { id: string }[];
    };
    expect(playlists.map((p) => p.id)).toEqual(["plain", "sparkle"]);
  });
});
