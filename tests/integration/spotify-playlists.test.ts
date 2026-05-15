// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listOwnedPlaylists } from "@/src/lib/spotify/playlists";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listOwnedPlaylists", () => {
  it("returns only playlists owned by the current user", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me-id", display_name: "Me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            {
              id: "p1",
              name: "Mine",
              owner: { id: "me-id" },
              tracks: { total: 12 },
              images: [{ url: "x" }],
            },
            {
              id: "p2",
              name: "Followed",
              owner: { id: "someone-else" },
              tracks: { total: 50 },
              images: [],
            },
          ],
          next: null,
        }),
      ),
    );
    const playlists = await listOwnedPlaylists("AT");
    expect(playlists.map((p) => p.id)).toEqual(["p1"]);
    expect(playlists[0]).toMatchObject({ name: "Mine", track_count: 12 });
  });
});
