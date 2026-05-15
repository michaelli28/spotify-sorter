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
  it("POSTs private playlist and returns id", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "user123" }),
      ),
      http.post("https://api.spotify.com/v1/users/user123/playlists", () =>
        HttpResponse.json({ id: "new-playlist-id" }),
      ),
    );

    const id = await createPlaylist(TOKEN, "My New Playlist");
    expect(id).toBe("new-playlist-id");
  });
});

describe("addTracksToPlaylist", () => {
  it("batches uris in 100-track chunks", async () => {
    const calls: string[][] = [];
    server.use(
      http.post(
        "https://api.spotify.com/v1/playlists/pl1/tracks",
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
});

describe("listPlaylistTrackIds", () => {
  it("returns existing track ids", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/pl1/tracks", () =>
        HttpResponse.json({
          items: [
            { track: { id: "t1" } },
            { track: { id: "t2" } },
            { track: null },
          ],
          next: null,
        }),
      ),
    );

    const ids = await listPlaylistTrackIds(TOKEN, "pl1");
    expect(ids).toEqual(["t1", "t2"]);
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
