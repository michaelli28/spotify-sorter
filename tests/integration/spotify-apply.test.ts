// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  createPlaylist,
  addTracksToPlaylist,
  listPlaylistTrackIds,
  findOwnedPlaylistByName,
} from "@/src/lib/spotify/apply";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const TOKEN = "test-token";

describe("createPlaylist", () => {
  it("POSTs a private playlist to /me/playlists and returns its id", async () => {
    let body: unknown;
    server.use(
      http.post(
        "https://api.spotify.com/v1/me/playlists",
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: "new-playlist-id" }, { status: 201 });
        },
      ),
    );

    const id = await createPlaylist(TOKEN, "My New Playlist");
    expect(id).toBe("new-playlist-id");
    expect(body).toMatchObject({ name: "My New Playlist", public: false });
  });
});

describe("addTracksToPlaylist", () => {
  it("batches uris in 100-track chunks", async () => {
    const calls: string[][] = [];
    server.use(
      http.post(
        "https://api.spotify.com/v1/playlists/pl1/items",
        async ({ request }) => {
          const body = (await request.json()) as { uris: string[] };
          calls.push(body.uris);
          return HttpResponse.json({ snapshot_id: "snap" });
        },
      ),
    );

    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:t${i}`);
    await addTracksToPlaylist(TOKEN, "pl1", uris);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(100);
    expect(calls[1]).toHaveLength(50);
  });

  it("retries only the rate-limited chunk, so earlier chunks aren't appended twice", async () => {
    const calls: string[] = [];
    let rateLimited = false;
    server.use(
      http.post(
        "https://api.spotify.com/v1/playlists/pl1/items",
        async ({ request }) => {
          const { uris } = (await request.json()) as { uris: string[] };
          calls.push(uris[0]!);
          if (uris[0] === "spotify:track:t100" && !rateLimited) {
            rateLimited = true;
            return new HttpResponse(null, {
              status: 429,
              headers: { "retry-after": "0" },
            });
          }
          return HttpResponse.json({ snapshot_id: "snap" });
        },
      ),
    );

    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:t${i}`);
    await addTracksToPlaylist(TOKEN, "pl1", uris);

    expect(calls).toEqual([
      "spotify:track:t0",
      "spotify:track:t100",
      "spotify:track:t100",
    ]);
  });
});

describe("listPlaylistTrackIds", () => {
  it("reads /items rows keyed `item` (new) or `track` (older apps), 50 per page", async () => {
    let limit: string | null = null;
    server.use(
      http.get(
        "https://api.spotify.com/v1/playlists/pl1/items",
        ({ request }) => {
          limit = new URL(request.url).searchParams.get("limit");
          return HttpResponse.json({
            items: [
              { item: { id: "t1" }, track: true },
              { track: { id: "t2" } },
              { item: null },
              { track: null },
            ],
            next: null,
          });
        },
      ),
    );

    const ids = await listPlaylistTrackIds(TOKEN, "pl1");
    expect(ids).toEqual(["t1", "t2"]);
    expect(limit).toBe("50");
  });
});

describe("findOwnedPlaylistByName", () => {
  it("returns id when matching owned playlist exists", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "user123" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            { id: "pl-mine", name: "My Playlist", owner: { id: "user123" } },
            { id: "pl-other", name: "Other", owner: { id: "other-user" } },
          ],
          next: null,
        }),
      ),
    );

    const id = await findOwnedPlaylistByName(TOKEN, "My Playlist");
    expect(id).toBe("pl-mine");
  });

  it("returns null when no match", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "user123" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            { id: "pl-mine", name: "Other Name", owner: { id: "user123" } },
          ],
          next: null,
        }),
      ),
    );

    const id = await findOwnedPlaylistByName(TOKEN, "My Playlist");
    expect(id).toBeNull();
  });
});
