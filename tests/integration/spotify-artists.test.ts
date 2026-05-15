// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchArtists } from "@/src/lib/spotify/artists";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchArtists", () => {
  it("chunks into 50/req and merges results", async () => {
    let calls = 0;
    server.use(
      http.get("https://api.spotify.com/v1/artists", ({ request }) => {
        calls++;
        const url = new URL(request.url);
        const ids = url.searchParams.get("ids")!.split(",");
        return HttpResponse.json({
          artists: ids.map((id) => ({
            id,
            name: `n${id}`,
            genres: [`g${id}`],
          })),
        });
      }),
    );
    const ids = Array.from({ length: 120 }, (_, i) => `a${i}`);
    const out = await fetchArtists(ids, "AT");
    expect(calls).toBe(3);
    expect(Object.keys(out)).toHaveLength(120);
    expect(out["a0"]).toEqual({ name: "na0", genres: ["ga0"] });
  });

  it("handles empty input", async () => {
    expect(await fetchArtists([], "AT")).toEqual({});
  });
});
