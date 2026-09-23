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

  // /me/playlists is ordered by recently-modified, so a library that shifts
  // between page fetches can serve the same playlist on two pages. Rendering
  // that list by id then warns about duplicate React keys and shows the row
  // twice. Observed live: 107 playlists, 2 of them duplicated.
  it("drops a playlist repeated across pages", async () => {
    const owned = (id: string, name: string) => ({
      id,
      name,
      owner: { id: "me-id" },
      tracks: { total: 1 },
      images: [],
    });
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me-id" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", ({ request }) => {
        const offset = new URL(request.url).searchParams.get("offset");
        return offset === "50"
          ? HttpResponse.json({
              items: [owned("p2", "Shifted"), owned("p3", "Third")],
              next: null,
            })
          : HttpResponse.json({
              items: [owned("p1", "First"), owned("p2", "Shifted")],
              next: "https://api.spotify.com/v1/me/playlists?limit=50&offset=50",
            });
      }),
    );
    const playlists = await listOwnedPlaylists("AT");
    expect(playlists.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
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
