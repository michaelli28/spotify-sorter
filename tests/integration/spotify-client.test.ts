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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withSpotify } from "@/src/lib/spotify/client";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";
import { _resetEnvForTests } from "@/src/lib/config/env";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  _resetEnvForTests();
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      auth: {
        refresh_token: "RT",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.ANTHROPIC_API_KEY;
  _resetEnvForTests();
});

describe("withSpotify", () => {
  it("refreshes expired token then runs callback with valid one", async () => {
    let refreshed = false;
    server.use(
      http.post("https://accounts.spotify.com/api/token", () => {
        refreshed = true;
        return HttpResponse.json({
          access_token: "NEW",
          refresh_token: "RT",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "s",
        });
      }),
    );
    const accessTokenSeen = await withSpotify(
      undefined,
      async (token) => token,
    );
    expect(refreshed).toBe(true);
    expect(accessTokenSeen).toBe("NEW");
    const updated = await readCache(join(dir, "cache.json"));
    expect(new Date(updated.auth!.expires_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("reuses sessionToken if not expired", async () => {
    let refreshCalls = 0;
    server.use(
      http.post("https://accounts.spotify.com/api/token", () => {
        refreshCalls++;
        return HttpResponse.json({});
      }),
    );
    const sessionToken = "CACHED";
    const result = await withSpotify(
      { accessToken: sessionToken, accessTokenExpiresAt: Date.now() + 60_000 },
      async (t) => t,
    );
    expect(refreshCalls).toBe(0);
    expect(result).toBe("CACHED");
  });
});
