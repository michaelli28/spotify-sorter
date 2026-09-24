// @vitest-environment node
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET as managedGET } from "@/app/api/spotify/managed-playlists/route";
import { POST as removePOST } from "@/app/api/spotify/remove-playlists/route";
import { POST as applyPOST } from "@/app/api/spotify/apply/route";
import { runApplyFromCache } from "@/src/lib/pipeline/apply";
import { _resetEnvForTests } from "@/src/lib/config/env";

// Apply itself is stubbed: these tests only need it to be running or not.
vi.mock("@/src/lib/pipeline/apply", () => ({ runApplyFromCache: vi.fn() }));
const applyMock = vi.mocked(runApplyFromCache);

// "Remove SpotifySorter playlists" (spec §8.2). msw only: this has never run
// against real Spotify.

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ISO = "2026-09-01T00:00:00.000Z";
const LIBRARY = "https://api.spotify.com/v1/me/library";

const category = (name: string, playlist: string | null) => ({
  name,
  description: "",
  spotify_playlist_id: playlist,
  created_at: ISO,
  example_track_ids: [],
});

let dir: string;
let cachePath: string;

async function seed(categories: Record<string, ReturnType<typeof category>>) {
  await writeFile(
    cachePath,
    JSON.stringify({
      version: 2,
      auth: { refresh_token: "rt", expires_at: ISO },
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
      categories,
      assignments: {},
      runs: [],
      playlist_snapshots: {},
      liked_songs_fingerprint: null,
    }),
    "utf-8",
  );
}

const readCacheJson = async () =>
  JSON.parse(await readFile(cachePath, "utf-8")) as {
    auth: { refresh_token: string } | null;
    categories: Record<
      string,
      { name: string; spotify_playlist_id: string | null }
    >;
  };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-remove-"));
  cachePath = join(dir, "cache.json");
  process.env.SORTER_DATA_DIR = dir;
  await seed({
    c1: category("Night Drive", "rec1"),
    c2: category("Rain", "rec2"),
    c3: category("Never Applied", null),
  });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const playlist = (id: string, name: string, owner = "me", total = 5) => ({
  id,
  name,
  owner: { id: owner },
  items: { total },
  images: [],
});

// The owner's library as /me/playlists returns it.
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

const STANDARD = [
  playlist("rec1", "✨ Night Drive", "me", 12),
  playlist("rec2", "✨ Rain", "me", 3),
  playlist("pfx1", "✨ Old Category", "me", 30),
  playlist("theirs", "✨ Someone Else's", "friend", 9),
  playlist("plain", "Late Night", "me", 50),
];

// Looked up by id, "theirs" says who owns it.
function theirsOwnedByFriend() {
  server.use(
    http.get("https://api.spotify.com/v1/playlists/theirs", () =>
      HttpResponse.json({
        name: "✨ Someone Else's",
        owner: { id: "friend" },
        items: { total: 9 },
      }),
    ),
  );
}

// Every DELETE /me/library as the list of playlist ids it carried.
function libraryDeletes(
  answer: (ids: string[]) => Response | Promise<Response> = () =>
    new HttpResponse(null, { status: 200 }),
) {
  const calls: string[][] = [];
  server.use(
    http.delete(LIBRARY, ({ request }) => {
      const uris = new URL(request.url).searchParams.get("uris") ?? "";
      const ids = uris
        .split(",")
        .map((u) => u.replace("spotify:playlist:", ""));
      calls.push(ids);
      return answer(ids);
    }),
  );
  return calls;
}

function get(headers: Record<string, string> = {}) {
  return managedGET(
    new Request("http://127.0.0.1:3000/api/spotify/managed-playlists", {
      headers: { cookie: "sorter_access_token=AT", ...headers },
    }),
  );
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return removePOST(
    new Request("http://127.0.0.1:3000/api/spotify/remove-playlists", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        cookie: "sorter_access_token=AT",
        ...headers,
      },
    }),
  );
}

describe("GET /api/spotify/managed-playlists", () => {
  it("lists recorded playlists and owned prefix ones, never another owner's or an unprefixed one", async () => {
    library(STANDARD);

    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      playlists: [
        { id: "rec1", name: "✨ Night Drive", tracks: 12, source: "recorded" },
        { id: "rec2", name: "✨ Rain", tracks: 3, source: "recorded" },
        { id: "pfx1", name: "✨ Old Category", tracks: 30, source: "prefix" },
      ],
    });
  });

  // onUnhandledRequest: "error" fails the test if Spotify is called.
  it.each(["cross-site", "same-site", "none"])(
    "refuses a %s request before calling Spotify",
    async (site) => {
      const res = await get({ "sec-fetch-site": site });
      expect(res.status).toBe(403);
    },
  );

  it("answers 409 when the cache is from another version", async () => {
    await writeFile(cachePath, JSON.stringify({ version: 99 }));
    const res = await get();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "cache_version_mismatch" });
  });

  it("never lists a recorded playlist another user owns", async () => {
    await seed({
      c1: category("Night Drive", "rec1"),
      c4: category("Mixtape", "theirs"),
    });
    library(STANDARD);
    theirsOwnedByFriend();

    const res = await get();

    expect(res.status).toBe(200);
    const { playlists } = (await res.json()) as {
      playlists: Array<{ id: string }>;
    };
    // rec2 is no category's any more: it stays only as an owned ✨ playlist.
    expect(playlists).toEqual([
      expect.objectContaining({ id: "rec1", source: "recorded" }),
      expect.objectContaining({ id: "rec2", source: "prefix" }),
      expect.objectContaining({ id: "pfx1", source: "prefix" }),
    ]);
  });

  it.each([
    [401, "/me"],
    [403, "/me/playlists"],
  ])(
    "asks for a reconnect when Spotify answers %i on %s",
    async (status, path) => {
      library(STANDARD);
      server.use(
        http.get(
          `https://api.spotify.com/v1${path}`,
          () => new HttpResponse(null, { status }),
        ),
      );
      const res = await get();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "missing_scope" });
    },
  );

  it("answers 502 when Spotify fails the listing", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get(
        "https://api.spotify.com/v1/me/playlists",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const res = await get();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "list_failed" });
  });
});

describe("POST /api/spotify/remove-playlists", () => {
  it("removes recorded and prefix playlists and forgets the recorded ids", async () => {
    library(STANDARD);
    const calls = libraryDeletes();

    const res = await post({ ids: ["rec1", "rec2", "pfx1"] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      removed: ["rec1", "rec2", "pfx1"],
      failed: [],
    });
    expect(calls).toEqual([["rec1", "rec2", "pfx1"]]);
    const cache = await readCacheJson();
    expect(cache.categories.c1!.spotify_playlist_id).toBeNull();
    expect(cache.categories.c2!.spotify_playlist_id).toBeNull();
  });

  it.each([
    ["another owner's playlist", "theirs"],
    ["an unprefixed playlist", "plain"],
    ["an id Spotify never listed", "made-up"],
  ])("refuses %s with 400 and removes nothing", async (_label, outsider) => {
    library(STANDARD);
    const calls = libraryDeletes();
    const before = await readFile(cachePath);

    const res = await post({ ids: ["rec1", outsider] });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "not_managed",
      ids: [outsider],
    });
    expect(calls).toEqual([]);
    expect((await readFile(cachePath)).equals(before)).toBe(true);
  });

  it("refuses a recorded playlist another user owns, removing nothing", async () => {
    await seed({
      c1: category("Night Drive", "rec1"),
      c4: category("Mixtape", "theirs"),
    });
    library(STANDARD);
    theirsOwnedByFriend();
    const calls = libraryDeletes();
    const before = await readFile(cachePath);

    const res = await post({ ids: ["theirs"] });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_managed", ids: ["theirs"] });
    expect(calls).toEqual([]);
    expect((await readFile(cachePath)).equals(before)).toBe(true);
  });

  it("answers 413 for a body far over the largest valid one, without calling Spotify", async () => {
    const calls = libraryDeletes();
    const ids = Array.from({ length: 1000 }, (_, i) => `${i}`.padEnd(64, "x"));
    const res = await post(JSON.stringify({ ids, pad: "x".repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
    expect(calls).toEqual([]);
  });

  it("accepts the largest valid body: 1,000 ids of 64 characters", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `${i}`.padEnd(64, "x"));
    library(STANDARD);
    const calls = libraryDeletes();
    const res = await post({ ids });
    // Past the size check: none of them is a candidate.
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("not_managed");
    expect(calls).toEqual([]);
  });

  it("still says what went when forgetting the removed ids fails", async () => {
    library(STANDARD);
    libraryDeletes(async () => {
      // The cache turns unreadable while Spotify removes.
      await writeFile(cachePath, JSON.stringify({ version: 99 }));
      return new HttpResponse(null, { status: 200 });
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ ids: ["rec1", "pfx1"] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: ["rec1", "pfx1"], failed: [] });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("works with the access cookie alone, before any refresh token is stored", async () => {
    const cache = JSON.parse(await readFile(cachePath, "utf-8"));
    await writeFile(cachePath, JSON.stringify({ ...cache, auth: null }));
    library(STANDARD);
    const calls = libraryDeletes();

    const listed = await get();
    const res = await post({ ids: ["rec1"] });

    expect(listed.status).toBe(200);
    expect(res.status).toBe(200);
    expect(calls).toEqual([["rec1"]]);
  });

  it("removes in chunks of 40", async () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      playlist(`pfx${i}`, `✨ Orphan ${i}`),
    );
    library([...STANDARD, ...many]);
    const calls = libraryDeletes();

    const ids = ["rec1", "rec2", ...many.map((p) => p.id)];
    const res = await post({ ids });

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.length)).toEqual([40, 7]);
    expect(calls.flat()).toEqual(ids);
  });

  it("reports a partial failure and forgets only the playlists that went", async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      playlist(`pfx${i}`, `✨ Orphan ${i}`),
    );
    library([...STANDARD, ...many]);
    // First chunk: rec1 + 39 orphans. Second chunk (rec2 + one orphan) fails.
    libraryDeletes((ids) =>
      ids.includes("rec2")
        ? new HttpResponse(null, { status: 500 })
        : new HttpResponse(null, { status: 200 }),
    );

    const ids = [
      "rec1",
      ...many.slice(0, 39).map((p) => p.id),
      "rec2",
      "pfx39",
    ];
    const res = await post({ ids });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      removed: string[];
      failed: Array<{ id: string; reason: string }>;
    };
    expect(body.removed).toEqual(ids.slice(0, 40));
    expect(body.failed).toEqual([
      { id: "rec2", reason: "spotify_500" },
      { id: "pfx39", reason: "spotify_500" },
    ]);
    const cache = await readCacheJson();
    expect(cache.categories.c1!.spotify_playlist_id).toBeNull();
    expect(cache.categories.c2!.spotify_playlist_id).toBe("rec2");
  });

  it("never rewrites the cache when only prefix playlists went", async () => {
    library(STANDARD);
    libraryDeletes();
    const before = await readFile(cachePath);

    const res = await post({ ids: ["pfx1"] });

    expect(res.status).toBe(200);
    expect((await readFile(cachePath)).equals(before)).toBe(true);
  });

  it("re-reads the cache before its one write, so a change made meanwhile survives", async () => {
    library(STANDARD);
    libraryDeletes(async () => {
      // Another write lands while Spotify is removing (e.g. a rename in
      // another tab, or a token refresh).
      const cache = JSON.parse(await readFile(cachePath, "utf-8"));
      cache.categories.c2.name = "Rain (renamed meanwhile)";
      cache.auth.refresh_token = "rt-new";
      await writeFile(cachePath, JSON.stringify(cache));
      return new HttpResponse(null, { status: 200 });
    });

    const res = await post({ ids: ["rec1"] });

    expect(res.status).toBe(200);
    const cache = await readCacheJson();
    expect(cache.categories.c1!.spotify_playlist_id).toBeNull();
    expect(cache.categories.c2).toMatchObject({
      name: "Rain (renamed meanwhile)",
      spotify_playlist_id: "rec2",
    });
    expect(cache.auth!.refresh_token).toBe("rt-new");
  });

  it("answers 403 missing_scope when Spotify refuses every removal", async () => {
    library(STANDARD);
    libraryDeletes(() => new HttpResponse(null, { status: 403 }));
    const before = await readFile(cachePath);

    const res = await post({ ids: ["rec1", "pfx1"] });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "missing_scope" });
    expect((await readFile(cachePath)).equals(before)).toBe(true);
  });

  it.each(["cross-site", "same-site", "none"])(
    "refuses a %s request before calling Spotify",
    async (site) => {
      const calls = libraryDeletes();
      const res = await post({ ids: ["rec1"] }, { "sec-fetch-site": site });
      expect(res.status).toBe(403);
      expect(calls).toEqual([]);
    },
  );

  it("accepts the app's own pages", async () => {
    library(STANDARD);
    libraryDeletes();
    const res = await post(
      { ids: ["pfx1"] },
      { "sec-fetch-site": "same-origin" },
    );
    expect(res.status).toBe(200);
  });

  it.each([
    ["no ids", {}],
    ["an empty list", { ids: [] }],
    ["a non-string id", { ids: [42] }],
    ["an empty id", { ids: [""] }],
    ["not JSON", "{"],
  ])("answers 400 bad_body for %s", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_body" });
  });

  it("answers 409 when the cache is from another version", async () => {
    await writeFile(cachePath, JSON.stringify({ version: 99 }));
    const res = await post({ ids: ["rec1"] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "cache_version_mismatch" });
  });

  it("answers 502 when Spotify fails the listing, removing nothing", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get(
        "https://api.spotify.com/v1/me/playlists",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const calls = libraryDeletes();
    const res = await post({ ids: ["rec1"] });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "remove_failed" });
    expect(calls).toEqual([]);
  });
});

describe("when only reconnecting can help", () => {
  beforeEach(() => {
    process.env.SPOTIFY_CLIENT_ID = "c".repeat(32);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    _resetEnvForTests();
  });
  afterEach(() => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.ANTHROPIC_API_KEY;
    _resetEnvForTests();
  });

  function revoked() {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
  }

  it("GET answers 401 reconnect when the refresh token is revoked", async () => {
    revoked();
    const res = await get({ cookie: "" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "reconnect" });
  });

  it("POST answers 401 reconnect when the refresh token is revoked, removing nothing", async () => {
    revoked();
    const calls = libraryDeletes();
    const res = await post({ ids: ["rec1"] }, { cookie: "" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "reconnect" });
    expect(calls).toEqual([]);
  });

  it.each(["GET", "POST"])(
    "%s answers 401 reconnect when the app was never connected",
    async (method) => {
      const cache = JSON.parse(await readFile(cachePath, "utf-8"));
      await writeFile(cachePath, JSON.stringify({ ...cache, auth: null }));
      const res =
        method === "GET"
          ? await get({ cookie: "" })
          : await post({ ids: ["rec1"] }, { cookie: "" });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "reconnect" });
    },
  );
});

// A running Apply writes its start-of-run copy of the cache back, which would
// restore the ids a removal just cleared (review-safety probe J).
describe("while an Apply is writing", () => {
  const DONE = {
    created: 0,
    updated: 0,
    tracks_added: 0,
    tracks_removed: 0,
    playlists: [],
  };

  function startApply() {
    let finish!: () => void;
    let fail!: (err: Error) => void;
    applyMock.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          finish = () => resolve(DONE);
          fail = reject;
        }),
    );
    const res = applyPOST(
      new Request("http://127.0.0.1:3000/api/spotify/apply", {
        method: "POST",
        headers: { cookie: "sorter_access_token=AT" },
      }),
    );
    return {
      finish: async () => {
        finish();
        await new Response((await res).body).text();
      },
      fail: async () => {
        fail(new Error("Spotify 500"));
        await new Response((await res).body).text();
      },
    };
  }

  // onUnhandledRequest: "error" fails the test if Spotify is called.
  it("refuses to list or remove, and calls nothing", async () => {
    const apply = startApply();
    await new Promise((r) => setTimeout(r, 0));
    const before = await readFile(cachePath);

    const listed = await get();
    const removed = await post({ ids: ["rec1"] });

    expect(listed.status).toBe(409);
    expect(await listed.json()).toEqual({ error: "apply_running" });
    expect(removed.status).toBe(409);
    expect(await removed.json()).toEqual({ error: "apply_running" });
    expect((await readFile(cachePath)).equals(before)).toBe(true);
    await apply.finish();
  });

  it.each(["finish", "fail"] as const)(
    "removes again once the Apply ends (%s)",
    async (end) => {
      const apply = startApply();
      await new Promise((r) => setTimeout(r, 0));
      await apply[end]();
      library(STANDARD);
      const calls = libraryDeletes();

      const res = await post({ ids: ["rec1"] });

      expect(res.status).toBe(200);
      expect(calls).toEqual([["rec1"]]);
    },
  );
});
