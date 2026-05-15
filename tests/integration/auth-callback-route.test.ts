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
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _resetEnvForTests } from "@/src/lib/config/env";
import { GET } from "@/app/api/auth/callback/route";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  _resetEnvForTests();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.ANTHROPIC_API_KEY;
  _resetEnvForTests();
});

describe("GET /api/auth/callback", () => {
  it("exchanges code, persists tokens, redirects to /scope", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "playlist-read-private",
        }),
      ),
    );
    const req = new Request(
      "http://127.0.0.1:3000/api/auth/callback?code=AC&state=ST",
      { headers: { cookie: "sorter_pkce_verifier=V; sorter_oauth_state=ST" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/scope");
    const cache = JSON.parse(await readFile(join(dir, "cache.json"), "utf-8"));
    expect(cache.auth.refresh_token).toBe("RT");
  });

  it("rejects state mismatch", async () => {
    const req = new Request(
      "http://127.0.0.1:3000/api/auth/callback?code=AC&state=BAD",
      { headers: { cookie: "sorter_pkce_verifier=V; sorter_oauth_state=ST" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("handles user-deny (error=access_denied)", async () => {
    const req = new Request(
      "http://127.0.0.1:3000/api/auth/callback?error=access_denied&state=ST",
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/?error=denied");
  });
});
