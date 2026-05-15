// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchPlaylistTracks", () => {
  it("returns track + linked_from + skips local", async () => {
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
                linked_from: undefined,
              },
            },
            {
              track: {
                id: "t2",
                name: "Local Demo",
                is_local: true,
                artists: [],
                linked_from: undefined,
              },
            },
            {
              track: {
                id: "t3",
                name: "Remastered",
                is_local: false,
                artists: [{ id: "a3", name: "X" }],
                linked_from: { id: "t3orig" },
              },
            },
            { track: null },
          ],
          next: null,
        }),
      ),
    );
    const tracks = await fetchPlaylistTracks("p1", "AT");
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: "t1",
      title: "Self Care",
      artist_id: "a1",
    });
    expect(tracks[1]!.id).toBe("t3orig");
  });
});

describe("fetchLikedSongs", () => {
  it("paginates Liked Songs endpoint", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "l1",
                name: "X",
                is_local: false,
                artists: [{ id: "a", name: "Y" }],
              },
            },
          ],
          next: null,
        }),
      ),
    );
    const tracks = await fetchLikedSongs("AT");
    expect(tracks[0]!.id).toBe("l1");
  });
});
