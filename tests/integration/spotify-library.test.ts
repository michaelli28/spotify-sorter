// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  listManagedPlaylists,
  removePlaylistsFromLibrary,
} from "@/src/lib/spotify/library";

// Removing playlists has never run against real Spotify: msw only.

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const TOKEN = "test-token";
const LIBRARY = "https://api.spotify.com/v1/me/library";
const ids = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `pl${from + i}`);

// Each DELETE's playlist ids, in the order Spotify saw them.
function libraryDeletes(
  answer: (ids: string[], attempt: number) => Response = () =>
    new HttpResponse(null, { status: 200 }),
) {
  const calls: string[][] = [];
  server.use(
    http.delete(LIBRARY, ({ request }) => {
      const uris = new URL(request.url).searchParams.get("uris") ?? "";
      const chunk = uris
        .split(",")
        .map((u) => u.replace("spotify:playlist:", ""));
      calls.push(chunk);
      return answer(chunk, calls.filter((c) => c[0] === chunk[0]).length);
    }),
  );
  return calls;
}

describe("removePlaylistsFromLibrary", () => {
  it("DELETEs /me/library with playlist URIs and the bearer token", async () => {
    let seen: { uris: string | null; auth: string | null } | null = null;
    server.use(
      http.delete(LIBRARY, ({ request }) => {
        seen = {
          uris: new URL(request.url).searchParams.get("uris"),
          auth: request.headers.get("authorization"),
        };
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const result = await removePlaylistsFromLibrary(TOKEN, ["a1", "b2"]);

    expect(seen).toEqual({
      uris: "spotify:playlist:a1,spotify:playlist:b2",
      auth: `Bearer ${TOKEN}`,
    });
    expect(result).toEqual({ removed: ["a1", "b2"], failed: [] });
  });

  it("sends at most 40 playlists per request", async () => {
    const calls = libraryDeletes();

    const result = await removePlaylistsFromLibrary(TOKEN, ids(85));

    expect(calls.map((c) => c.length)).toEqual([40, 40, 5]);
    expect(calls.flat()).toEqual(ids(85));
    expect(result.removed).toEqual(ids(85));
  });

  it("retries only the rate-limited chunk", async () => {
    const calls = libraryDeletes((chunk, attempt) =>
      chunk[0] === "pl40" && attempt === 1
        ? new HttpResponse(null, {
            status: 429,
            headers: { "retry-after": "0" },
          })
        : new HttpResponse(null, { status: 200 }),
    );

    const result = await removePlaylistsFromLibrary(TOKEN, ids(85));

    expect(calls.map((c) => c[0])).toEqual(["pl0", "pl40", "pl40", "pl80"]);
    expect(result).toEqual({ removed: ids(85), failed: [] });
  });

  it("reports a failed chunk and still removes the others", async () => {
    libraryDeletes((chunk) =>
      chunk[0] === "pl40"
        ? new HttpResponse(null, { status: 500 })
        : new HttpResponse(null, { status: 200 }),
    );

    const result = await removePlaylistsFromLibrary(TOKEN, ids(85));

    expect(result.removed).toEqual([...ids(40), ...ids(5, 80)]);
    expect(result.failed).toEqual(
      ids(40, 40).map((id) => ({ id, reason: "spotify_500" })),
    );
  });

  it.each([401, 403])(
    "names a Spotify %i a missing scope (reconnect to fix)",
    async (status) => {
      libraryDeletes(() => new HttpResponse(null, { status }));

      const result = await removePlaylistsFromLibrary(TOKEN, ["a1"]);

      expect(result).toEqual({
        removed: [],
        failed: [{ id: "a1", reason: "missing_scope" }],
      });
    },
  );

  it("reports a network failure without throwing", async () => {
    server.use(http.delete(LIBRARY, () => HttpResponse.error()));

    const result = await removePlaylistsFromLibrary(TOKEN, ["a1"]);

    expect(result).toEqual({
      removed: [],
      failed: [{ id: "a1", reason: "network" }],
    });
  });

  it("calls nothing for an empty list", async () => {
    const calls = libraryDeletes();
    expect(await removePlaylistsFromLibrary(TOKEN, [])).toEqual({
      removed: [],
      failed: [],
    });
    expect(calls).toEqual([]);
  });
});

describe("listManagedPlaylists", () => {
  const ISO = "2026-09-01T00:00:00.000Z";
  const category = (name: string, playlist: string | null) => ({
    name,
    description: "",
    spotify_playlist_id: playlist,
    created_at: ISO,
    example_track_ids: [],
  });
  const playlist = (
    id: string,
    name: string,
    owner: string,
    total: number,
  ) => ({ id, name, owner: { id: owner }, items: { total }, images: [] });

  function library(items: ReturnType<typeof playlist>[]) {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ items, next: null }),
      ),
    );
  }

  it("lists recorded playlists, then owned ones named with the prefix", async () => {
    library([
      playlist("rec1", "✨ Night Drive", "me", 12),
      playlist("pfx1", "✨ Old Category", "me", 30),
      playlist("theirs", "✨ Someone Else's", "friend", 9),
      playlist("plain", "Late Night", "me", 50),
      playlist("near", "✨Glued To The Prefix", "me", 4),
      playlist("rec2", "✨ Rain (renamed in Spotify)", "me", 3),
    ]);

    const result = await listManagedPlaylists(TOKEN, {
      config: { prefix: "✨" },
      categories: {
        c1: category("Night Drive", "rec1"),
        c2: category("Rain", "rec2"),
        c3: category("Never Applied", null),
      },
    });

    expect(result).toEqual([
      { id: "rec1", name: "✨ Night Drive", tracks: 12, source: "recorded" },
      {
        id: "rec2",
        name: "✨ Rain (renamed in Spotify)",
        tracks: 3,
        source: "recorded",
      },
      { id: "pfx1", name: "✨ Old Category", tracks: 30, source: "prefix" },
    ]);
  });

  it("lists a recorded playlist once even when two categories share it", async () => {
    library([playlist("rec1", "✨ Night Drive", "me", 12)]);

    const result = await listManagedPlaylists(TOKEN, {
      config: { prefix: "✨" },
      categories: {
        c1: category("Night Drive", "rec1"),
        c2: category("Night Drive 2", "rec1"),
      },
    });

    expect(result.map((p) => p.id)).toEqual(["rec1"]);
  });

  it("looks up a recorded playlist that's no longer in the library, and skips one Spotify can't find", async () => {
    library([]);
    server.use(
      http.get("https://api.spotify.com/v1/playlists/gone", () =>
        HttpResponse.json({
          name: "✨ Night Drive",
          owner: { id: "me" },
          items: { total: 7 },
        }),
      ),
      http.get("https://api.spotify.com/v1/playlists/deleted", () =>
        HttpResponse.json({ error: { status: 404 } }, { status: 404 }),
      ),
    );

    const result = await listManagedPlaylists(TOKEN, {
      config: { prefix: "✨" },
      categories: {
        c1: category("Night Drive", "gone"),
        c2: category("Rain", "deleted"),
      },
    });

    expect(result).toEqual([
      { id: "gone", name: "✨ Night Drive", tracks: 7, source: "recorded" },
    ]);
  });

  // A category can point at another user's playlist only through a hand edit
  // of the cache, but removing it would unfollow someone else's playlist.
  it.each([
    ["followed in the library", true],
    ["looked up by id", false],
  ])(
    "never lists a recorded playlist another user owns (%s)",
    async (_label, followed) => {
      library(followed ? [playlist("theirs", "✨ Mixtape", "friend", 9)] : []);
      server.use(
        http.get("https://api.spotify.com/v1/playlists/theirs", () =>
          HttpResponse.json({
            name: "✨ Mixtape",
            owner: { id: "friend" },
            items: { total: 9 },
          }),
        ),
      );

      const result = await listManagedPlaylists(TOKEN, {
        config: { prefix: "✨" },
        categories: { c1: category("Mixtape", "theirs") },
      });

      expect(result).toEqual([]);
    },
  );

  it("throws with Spotify's status when the listing fails, so the route can tell a scope problem", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get(
        "https://api.spotify.com/v1/me/playlists",
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    await expect(
      listManagedPlaylists(TOKEN, {
        config: { prefix: "✨" },
        categories: {},
      }),
    ).rejects.toMatchObject({ status: 403 });

    server.use(
      http.get(
        "https://api.spotify.com/v1/me",
        () => new HttpResponse(null, { status: 401 }),
      ),
    );
    await expect(
      listManagedPlaylists(TOKEN, {
        config: { prefix: "✨" },
        categories: {},
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws when Spotify fails a recorded lookup another way", async () => {
    library([]);
    server.use(
      http.get(
        "https://api.spotify.com/v1/playlists/gone",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    await expect(
      listManagedPlaylists(TOKEN, {
        config: { prefix: "✨" },
        categories: { c1: category("Night Drive", "gone") },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
