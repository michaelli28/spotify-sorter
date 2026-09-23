// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// playlist-tracks was the only Spotify route that required the session cookie.
// The cookie is host-scoped to 127.0.0.1 and lives 3600s, while its four
// siblings fall back to the stored refresh token — so the playlist grid loaded
// and every track preview 401'd, either on localhost or an hour after
// connecting. It should authenticate like the rest.

vi.mock("@/src/lib/spotify/client", () => ({
  withSpotify: vi.fn(
    async (_session: unknown, fn: (token: string) => Promise<unknown>) =>
      fn("refreshed-token"),
  ),
}));
vi.mock("@/src/lib/spotify/tracks", () => ({
  fetchPlaylistTracks: vi.fn(async () => [
    { id: "t1", title: "Alpha", artist_name: "Artist One", extra: "dropped" },
  ]),
  fetchLikedSongs: vi.fn(async () => [
    { id: "t9", title: "Liked", artist_name: "Artist Nine" },
  ]),
}));

import { withSpotify } from "@/src/lib/spotify/client";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";
import { GET } from "@/app/api/spotify/playlist-tracks/route";

beforeEach(() => vi.clearAllMocks());

const get = (query: string, cookie?: string) =>
  GET(
    new Request(`http://127.0.0.1:3000/api/spotify/playlist-tracks?${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );

describe("GET /api/spotify/playlist-tracks", () => {
  it("serves a playlist with no cookie, via the stored refresh token", async () => {
    const res = await get("id=p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tracks: [{ id: "t1", title: "Alpha", artist_name: "Artist One" }],
    });
    expect(vi.mocked(withSpotify)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(withSpotify).mock.calls[0]![0]).toBeUndefined();
    expect(vi.mocked(fetchPlaylistTracks)).toHaveBeenCalledWith(
      "p1",
      "refreshed-token",
    );
  });

  it("serves liked songs with no cookie", async () => {
    const res = await get("liked=true");
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchLikedSongs)).toHaveBeenCalledWith("refreshed-token");
  });

  it("still prefers the cookie's token when one is present", async () => {
    const res = await get("id=p1", "sorter_access_token=AT");
    expect(res.status).toBe(200);
    expect(vi.mocked(withSpotify).mock.calls[0]![0]).toMatchObject({
      accessToken: "AT",
    });
  });

  it("still rejects a request naming neither a playlist nor liked", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
  });
});
