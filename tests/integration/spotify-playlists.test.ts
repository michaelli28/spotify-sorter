// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  listOwnedPlaylists,
  fetchPlaylistSnapshot,
} from "@/src/lib/spotify/playlists";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listOwnedPlaylists", () => {
  it("returns only playlists owned by the current user", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me-id", display_name: "Me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            {
              id: "p1",
              name: "Mine",
              owner: { id: "me-id" },
              tracks: { total: 12 },
              images: [{ url: "x" }],
            },
            {
              id: "p2",
              name: "Followed",
              owner: { id: "someone-else" },
              tracks: { total: 50 },
              images: [],
            },
          ],
          next: null,
        }),
      ),
    );
    const playlists = await listOwnedPlaylists("AT");
    expect(playlists.map((p) => p.id)).toEqual(["p1"]);
    expect(playlists[0]).toMatchObject({ name: "Mine", track_count: 12 });
  });

  it("reads the track count from `items.total` (Feb 2026 rename)", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me-id" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            {
              id: "p1",
              name: "Mine",
              owner: { id: "me-id" },
              items: { total: 7 },
              images: [],
            },
          ],
          next: null,
        }),
      ),
    );
    const playlists = await listOwnedPlaylists("AT");
    expect(playlists[0]!.track_count).toBe(7);
  });
});

describe("fetchPlaylistSnapshot", () => {
  it("reads the track count from `items.total`, else `tracks.total`", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/new", () =>
        HttpResponse.json({ snapshot_id: "s1", items: { total: 9 } }),
      ),
      http.get("https://api.spotify.com/v1/playlists/old", () =>
        HttpResponse.json({ snapshot_id: "s2", tracks: { total: 4 } }),
      ),
    );
    expect(await fetchPlaylistSnapshot("new", "AT")).toEqual({
      snapshot_id: "s1",
      track_count: 9,
    });
    expect(await fetchPlaylistSnapshot("old", "AT")).toEqual({
      snapshot_id: "s2",
      track_count: 4,
    });
  });
});
