// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { refreshAccessToken } from "@/src/lib/spotify/refresh";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("refreshAccessToken", () => {
  it("returns new tokens", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "NEW_AT",
          refresh_token: "RT2",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "playlist-read-private",
        }),
      ),
    );
    const r = await refreshAccessToken({ clientId: "c", refreshToken: "RT1" });
    expect(r.access_token).toBe("NEW_AT");
    expect(r.refresh_token).toBe("RT2");
  });

  it("keeps original refresh token if response omits one", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "NEW_AT",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "playlist-read-private",
        }),
      ),
    );
    const r = await refreshAccessToken({ clientId: "c", refreshToken: "RT1" });
    expect(r.refresh_token).toBe("RT1");
  });

  it("throws RefreshRevokedError on 400 invalid_grant", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(
      refreshAccessToken({ clientId: "c", refreshToken: "RT_BAD" }),
    ).rejects.toThrow(/refresh.*revoked/i);
  });
});
