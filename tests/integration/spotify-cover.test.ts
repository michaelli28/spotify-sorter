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
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SPOTIFY_SCOPES } from "@/src/lib/spotify/scopes";
import { buildAuthorizeUrl } from "@/src/lib/spotify/auth";
import {
  MAX_COVER_BASE64_BYTES,
  uploadPlaylistCover,
} from "@/src/lib/spotify/cover";
import { POST } from "@/app/api/spotify/cover/route";
import { _resetEnvForTests } from "@/src/lib/config/env";

// Real playlist covers on Apply. Everything here runs against msw: this path
// has never been executed against real Spotify.

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ISO = "2026-09-01T00:00:00.000Z";
const JPEG = "/9j/4AAQSkZJRgABAQ==";
const IMAGES = "https://api.spotify.com/v1/playlists/:id/images";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-cover-"));
  process.env.SORTER_DATA_DIR = dir;
  const category = (name: string, playlist: string | null) => ({
    name,
    description: "",
    spotify_playlist_id: playlist,
    created_at: ISO,
    example_track_ids: [],
  });
  await writeFile(
    join(dir, "cache.json"),
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
      categories: {
        c1: category("Night Drive", "pl1"),
        c2: category("Rain", null),
      },
      assignments: {},
      runs: [],
      playlist_snapshots: {},
      liked_songs_fingerprint: null,
    }),
    "utf-8",
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://127.0.0.1:3000/api/spotify/cover", {
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

describe("scopes", () => {
  it("asks for ugc-image-upload so covers can be written", () => {
    expect(SPOTIFY_SCOPES).toContain("ugc-image-upload");
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "c",
        redirectUri: "http://127.0.0.1:3000/cb",
        challenge: "x",
        state: "s",
      }),
    );
    expect(url.searchParams.get("scope")!.split(" ")).toContain(
      "ugc-image-upload",
    );
  });
});

describe("uploadPlaylistCover", () => {
  it("PUTs the base64 body as image/jpeg with the bearer token", async () => {
    let seen: {
      url: string;
      type: string | null;
      auth: string | null;
      body: string;
    } | null = null;
    server.use(
      http.put(IMAGES, async ({ request }) => {
        seen = {
          url: request.url,
          type: request.headers.get("content-type"),
          auth: request.headers.get("authorization"),
          body: await request.text(),
        };
        return new HttpResponse(null, { status: 202 });
      }),
    );
    await uploadPlaylistCover("pl1", JPEG, "AT");
    expect(seen).toEqual({
      url: "https://api.spotify.com/v1/playlists/pl1/images",
      type: "image/jpeg",
      auth: "Bearer AT",
      body: JPEG,
    });
  });

  it("retries a 429 through the shared backoff helper", async () => {
    let calls = 0;
    server.use(
      http.put(IMAGES, () =>
        ++calls === 1
          ? new HttpResponse(null, {
              status: 429,
              headers: { "retry-after": "0" },
            })
          : new HttpResponse(null, { status: 202 }),
      ),
    );
    await uploadPlaylistCover("pl1", JPEG, "AT");
    expect(calls).toBe(2);
  });

  it("throws with Spotify's status on failure", async () => {
    server.use(http.put(IMAGES, () => new HttpResponse(null, { status: 403 })));
    await expect(uploadPlaylistCover("pl1", JPEG, "AT")).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("POST /api/spotify/cover", () => {
  it("uploads the cover to the category's playlist", async () => {
    let body = "";
    server.use(
      http.put(IMAGES, async ({ request, params }) => {
        expect(params.id).toBe("pl1");
        body = await request.text();
        return new HttpResponse(null, { status: 202 });
      }),
    );
    const res = await post({ categoryId: "c1", jpegBase64: JPEG });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(body).toBe(JPEG);
  });

  it("refuses a request from another site before touching Spotify", async () => {
    const res = await post(
      { categoryId: "c1", jpegBase64: JPEG },
      { "sec-fetch-site": "cross-site" },
    );
    expect(res.status).toBe(403);
  });

  it.each([
    ["no category", { jpegBase64: JPEG }],
    ["empty image", { categoryId: "c1", jpegBase64: "" }],
    ["not base64", { categoryId: "c1", jpegBase64: "not base64!" }],
    [
      "a data URL",
      { categoryId: "c1", jpegBase64: `data:image/jpeg;base64,${JPEG}` },
    ],
    ["not JSON", "{"],
  ])("answers 400 for %s", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
  });

  it("answers 400 for an image over Spotify's 256 KB payload cap", async () => {
    const over = "A".repeat(MAX_COVER_BASE64_BYTES + 4);
    const res = await post({ categoryId: "c1", jpegBase64: over });
    expect(res.status).toBe(400);
    const atCap = "A".repeat(MAX_COVER_BASE64_BYTES);
    server.use(http.put(IMAGES, () => new HttpResponse(null, { status: 202 })));
    expect((await post({ categoryId: "c1", jpegBase64: atCap })).status).toBe(
      200,
    );
  });

  it("answers 404 when the category has no playlist yet", async () => {
    const res = await post({ categoryId: "c2", jpegBase64: JPEG });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_playlist" });
  });

  it("answers 404 for an unknown category", async () => {
    const res = await post({ categoryId: "nope", jpegBase64: JPEG });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_playlist" });
  });

  it.each([401, 403])(
    "maps Spotify %i to 403 missing_scope (reconnect to add covers)",
    async (status) => {
      server.use(http.put(IMAGES, () => new HttpResponse(null, { status })));
      const res = await post({ categoryId: "c1", jpegBase64: JPEG });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "missing_scope" });
    },
  );

  // The cookie's token needs no refresh token: only a request without it does.
  it("uploads with the access cookie alone, before any refresh token is stored", async () => {
    const path = join(dir, "cache.json");
    const cache = JSON.parse(await readFile(path, "utf-8"));
    await writeFile(path, JSON.stringify({ ...cache, auth: null }));
    server.use(http.put(IMAGES, () => new HttpResponse(null, { status: 202 })));
    const res = await post({ categoryId: "c1", jpegBase64: JPEG });
    expect(res.status).toBe(200);
  });

  it("answers 502 when Spotify fails another way", async () => {
    server.use(http.put(IMAGES, () => new HttpResponse(null, { status: 500 })));
    const res = await post({ categoryId: "c1", jpegBase64: JPEG });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upload_failed" });
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

    it("answers 401 reconnect, not a retryable 502, when the refresh token is revoked", async () => {
      let puts = 0;
      server.use(
        http.post("https://accounts.spotify.com/api/token", () =>
          HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
        ),
        http.put(IMAGES, () => {
          puts++;
          return new HttpResponse(null, { status: 202 });
        }),
      );
      const res = await post(
        { categoryId: "c1", jpegBase64: JPEG },
        { cookie: "" },
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "reconnect" });
      expect(puts).toBe(0);
    });

    it("answers 401 reconnect when the app was never connected", async () => {
      const path = join(dir, "cache.json");
      const cache = JSON.parse(await readFile(path, "utf-8"));
      await writeFile(path, JSON.stringify({ ...cache, auth: null }));
      const res = await post(
        { categoryId: "c1", jpegBase64: JPEG },
        { cookie: "" },
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "reconnect" });
    });
  });

  it("answers 413 for a body far over the cap without parsing it", async () => {
    let puts = 0;
    server.use(
      http.put(IMAGES, () => {
        puts++;
        return new HttpResponse(null, { status: 202 });
      }),
    );
    const huge = "A".repeat(MAX_COVER_BASE64_BYTES * 4);
    const res = await post({ categoryId: "c1", jpegBase64: huge });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
    expect(puts).toBe(0);
  });

  it("answers 413 from a declared content-length alone", async () => {
    const res = await post(
      { categoryId: "c1", jpegBase64: JPEG },
      { "content-length": String(MAX_COVER_BASE64_BYTES * 4) },
    );
    expect(res.status).toBe(413);
  });

  it("answers 409 as JSON when the cache is from another version", async () => {
    await writeFile(join(dir, "cache.json"), JSON.stringify({ version: 99 }));
    const res = await post({ categoryId: "c1", jpegBase64: JPEG });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "cache_version_mismatch" });
  });

  it("never rewrites the cache when the session token is fresh", async () => {
    server.use(http.put(IMAGES, () => new HttpResponse(null, { status: 202 })));
    const path = join(dir, "cache.json");
    const before = await readFile(path);
    await post({ categoryId: "c1", jpegBase64: JPEG });
    expect((await readFile(path)).equals(before)).toBe(true);
  });
});
