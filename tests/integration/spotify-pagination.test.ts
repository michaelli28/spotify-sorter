// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { paginate } from "@/src/lib/spotify/pagination";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("paginate", () => {
  it("walks Spotify cursors until next is null", async () => {
    let calls = 0;
    server.use(
      http.get(
        "https://api.spotify.com/v1/users/me/playlists",
        ({ request }) => {
          calls++;
          const url = new URL(request.url);
          const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
          if (offset === 0) {
            return HttpResponse.json({
              items: [{ id: "p1" }, { id: "p2" }],
              next: "https://api.spotify.com/v1/users/me/playlists?offset=2&limit=2",
            });
          }
          if (offset === 2) {
            return HttpResponse.json({ items: [{ id: "p3" }], next: null });
          }
          return HttpResponse.json({ items: [], next: null });
        },
      ),
    );
    const items = await paginate<{ id: string }>(
      "https://api.spotify.com/v1/users/me/playlists?limit=2",
      { accessToken: "AT" },
    );
    expect(items.map((i) => i.id)).toEqual(["p1", "p2", "p3"]);
    expect(calls).toBe(2);
  });

  it("throws on non-200", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/x", () =>
        HttpResponse.json(
          { error: { status: 500, message: "boom" } },
          { status: 500 },
        ),
      ),
    );
    await expect(
      paginate("https://api.spotify.com/v1/x", { accessToken: "AT" }),
    ).rejects.toThrow(/500/);
  });

  // withRetry429 and the routes' missing_scope mapping read these.
  it("puts Spotify's status and headers on the error", async () => {
    server.use(
      http.get(
        "https://api.spotify.com/v1/x",
        () =>
          new HttpResponse(null, {
            status: 429,
            headers: { "retry-after": "7" },
          }),
      ),
    );
    const err: unknown = await paginate("https://api.spotify.com/v1/x", {
      accessToken: "AT",
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429 });
    expect((err as { headers: Headers }).headers.get("retry-after")).toBe("7");
  });
});
