// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { _resetEnvForTests } from "@/src/lib/config/env";
import { GET } from "@/app/api/auth/login/route";

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  _resetEnvForTests();
});
afterEach(() => {
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.ANTHROPIC_API_KEY;
  _resetEnvForTests();
});

describe("GET /api/auth/login", () => {
  it("redirects to Spotify authorize with PKCE + sets cookies", async () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/login");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("https://accounts.spotify.com/authorize");
    expect(loc).toContain("code_challenge_method=S256");
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("sorter_pkce_verifier="))).toBe(
      true,
    );
    expect(cookies.some((c) => c.startsWith("sorter_oauth_state="))).toBe(true);
  });
});
