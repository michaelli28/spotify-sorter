// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { exchangeCodeForToken } from "@/src/lib/spotify/auth";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("exchangeCodeForToken", () => {
  it("exchanges code for tokens and returns expires_at as ISO", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "AT",
          refresh_token: "RT",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "playlist-read-private",
        }),
      ),
    );
    const result = await exchangeCodeForToken({
      clientId: "c",
      code: "C",
      verifier: "V",
      redirectUri: "http://127.0.0.1:3000/api/auth/callback",
    });
    expect(result.access_token).toBe("AT");
    expect(result.refresh_token).toBe("RT");
    expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("throws on 400 error", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(
      exchangeCodeForToken({
        clientId: "c",
        code: "BAD",
        verifier: "V",
        redirectUri: "http://127.0.0.1:3000/api/auth/callback",
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});
