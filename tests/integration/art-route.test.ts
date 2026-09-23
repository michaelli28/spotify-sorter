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
import { delay, http, HttpResponse } from "msw";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "@/app/api/art/[trackId]/route";

// GET /api/art/<track id>: the <img src> for real album art. oEmbed needs no
// token, so it can never trigger ensureFreshToken's cache re-save.

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const OEMBED = "https://open.spotify.com/oembed";
const ID = "4uLU6hMCjMI75M1A2tKUQC";
const THUMB = "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02";
const HOUR = 60 * 60 * 1000;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-art-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const get = (trackId: string) =>
  GET(new Request(`http://127.0.0.1:3000/api/art/${trackId}`), {
    params: Promise.resolve({ trackId }),
  });

const stored = async () =>
  JSON.parse(await readFile(join(dir, "artwork.json"), "utf-8")) as {
    version: 1;
    tracks: Record<string, { url: string | null; fetched_at: string }>;
  };

async function seedStore(
  tracks: Record<string, { url: string | null; fetched_at: string }>,
) {
  await writeFile(
    join(dir, "artwork.json"),
    JSON.stringify({ version: 1, tracks }),
    "utf-8",
  );
}

function oembed(
  respond: (trackUrl: string | null) => Response | Promise<Response>,
) {
  const calls: string[] = [];
  server.use(
    http.get(OEMBED, ({ request }) => {
      const trackUrl = new URL(request.url).searchParams.get("url");
      calls.push(trackUrl ?? "");
      return respond(trackUrl);
    }),
  );
  return calls;
}

describe("GET /api/art/[trackId]", () => {
  it.each(["abc", `${ID}X`, "4uLU6hMCjMI75M1A2tKUQ-", "..%2F..%2Fcache.json"])(
    "answers 400 for the id %s without fetching",
    async (bad) => {
      const res = await get(bad);
      expect(res.status).toBe(400);
    },
  );

  it("redirects a stored hit without asking oEmbed", async () => {
    await seedStore({
      [ID]: { url: THUMB, fetched_at: new Date().toISOString() },
    });
    const calls = oembed(() => HttpResponse.json({ thumbnail_url: THUMB }));
    const res = await get(ID);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(THUMB);
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(calls).toEqual([]);
  });

  it("fetches a miss from oEmbed, stores it, and redirects", async () => {
    const calls = oembed(() => HttpResponse.json({ thumbnail_url: THUMB }));
    const res = await get(ID);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(THUMB);
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(calls).toEqual([`https://open.spotify.com/track/${ID}`]);
    expect((await stored()).tracks[ID]!.url).toBe(THUMB);
  });

  it.each([
    "https://evil.example/cover.jpg",
    "http://i.scdn.co/image/abc",
    "https://i.scdn.co.evil.example/image/abc",
    "https://spotifycdn.com.evil.example/x",
    "javascript:alert(1)",
  ])("never redirects to %s (open-redirect guard)", async (thumb) => {
    oembed(() => HttpResponse.json({ thumbnail_url: thumb }));
    const res = await get(ID);
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect((await stored()).tracks[ID]!.url).toBeNull();
  });

  it("accepts i.scdn.co as well as *.spotifycdn.com", async () => {
    const scdn = "https://i.scdn.co/image/ab67616d00001e02";
    oembed(() => HttpResponse.json({ thumbnail_url: scdn }));
    expect((await get(ID)).headers.get("location")).toBe(scdn);
  });

  it("refuses a stored url on a foreign host and asks oEmbed again", async () => {
    await seedStore({
      [ID]: {
        url: "https://evil.example/x.jpg",
        fetched_at: new Date().toISOString(),
      },
    });
    const calls = oembed(() => HttpResponse.json({ thumbnail_url: THUMB }));
    const res = await get(ID);
    expect(res.headers.get("location")).toBe(THUMB);
    expect(calls).toHaveLength(1);
  });

  it("stores no-art as null, answers 404, and doesn't ask again within 24 h", async () => {
    const calls = oembed(() => new HttpResponse(null, { status: 404 }));
    expect((await get(ID)).status).toBe(404);
    expect((await stored()).tracks[ID]!.url).toBeNull();
    expect((await get(ID)).status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("treats an oEmbed answer with no thumbnail as no art", async () => {
    oembed(() => HttpResponse.json({ title: "x" }));
    expect((await get(ID)).status).toBe(404);
    expect((await stored()).tracks[ID]!.url).toBeNull();
  });

  it("asks again once a no-art entry is older than 24 h", async () => {
    await seedStore({
      [ID]: {
        url: null,
        fetched_at: new Date(Date.now() - 25 * HOUR).toISOString(),
      },
    });
    const calls = oembed(() => HttpResponse.json({ thumbnail_url: THUMB }));
    const res = await get(ID);
    expect(res.status).toBe(302);
    expect(calls).toHaveLength(1);
    expect((await stored()).tracks[ID]!.url).toBe(THUMB);
  });

  it("stores nothing when oEmbed fails, so the next request retries", async () => {
    oembed(() => new HttpResponse(null, { status: 503 }));
    expect((await get(ID)).status).toBe(502);
    expect(await readdir(dir)).toEqual([]);
  });

  it("gives up after 8 s and stores nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // The route reads the store (real file I/O) before it starts the clock, so
    // advance only once the oEmbed request is actually in flight.
    let arrived!: () => void;
    const inFlight = new Promise<void>((resolve) => (arrived = resolve));
    oembed(async () => {
      arrived();
      await delay("infinite");
      return HttpResponse.json({});
    });
    let settled = false;
    const pending = get(ID).then((r) => {
      settled = true;
      return r;
    });
    await inFlight;
    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(await readdir(dir)).toEqual([]);
  });

  it("gives up when the body stalls past 8 s and stores nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let arrived!: () => void;
    const inFlight = new Promise<void>((resolve) => (arrived = resolve));
    // Headers at once, then half a body that never finishes. The abort errors
    // the stream, as undici does for a real response.
    server.use(
      http.get(OEMBED, ({ request }) => {
        arrived();
        return new HttpResponse(
          new ReadableStream<Uint8Array>({
            start(ctrl) {
              ctrl.enqueue(new TextEncoder().encode('{"thumbnail_url":'));
              request.signal.addEventListener("abort", () =>
                ctrl.error(new DOMException("aborted", "AbortError")),
              );
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }),
    );
    const pending = get(ID);
    await inFlight;
    await vi.advanceTimersByTimeAsync(8_001);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(await readdir(dir)).toEqual([]);
  });

  it("treats a 200 that isn't JSON as a failure to retry, not as no art", async () => {
    oembed(() => HttpResponse.text("<html>try again</html>"));
    const res = await get(ID);
    expect(res.status).toBe(502);
    expect(await readdir(dir)).toEqual([]);
  });

  it("refuses an <img> on another website without asking oEmbed", async () => {
    const calls = oembed(() => HttpResponse.json({ thumbnail_url: THUMB }));
    const res = await GET(
      new Request(`http://127.0.0.1:3000/api/art/${ID}`, {
        headers: { "sec-fetch-site": "cross-site" },
      }),
      { params: Promise.resolve({ trackId: ID }) },
    );
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("serves the app's own pages", async () => {
    oembed(() => HttpResponse.json({ thumbnail_url: THUMB }));
    for (const site of ["same-origin", "same-site", "none"]) {
      const res = await GET(
        new Request(`http://127.0.0.1:3000/api/art/${ID}`, {
          headers: { "sec-fetch-site": site },
        }),
        { params: Promise.resolve({ trackId: ID }) },
      );
      expect(res.status).toBe(302);
    }
  });

  it("keeps at most 4 oEmbed requests in flight and loses no entry in a burst", async () => {
    const ids = Array.from(
      { length: 12 },
      (_, i) => `${String(i).padStart(2, "0")}${"a".repeat(20)}`,
    );
    let inFlight = 0;
    let peak = 0;
    oembed(async (trackUrl) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight--;
      return HttpResponse.json({
        thumbnail_url: `${THUMB}/${trackUrl!.split("/").pop()}`,
      });
    });
    const results = await Promise.all(ids.map(get));
    expect(results.map((r) => r.status)).toEqual(ids.map(() => 302));
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    const tracks = (await stored()).tracks;
    expect(Object.keys(tracks).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(tracks[id]!.url).toBe(`${THUMB}/${id}`);
  });

  it("never reads or writes cache.json", async () => {
    // readCache would throw on this file; the route must not care.
    await writeFile(join(dir, "cache.json"), "{not json", "utf-8");
    oembed(() => HttpResponse.json({ thumbnail_url: THUMB }));
    expect((await get(ID)).status).toBe(302);
    expect(await readFile(join(dir, "cache.json"), "utf-8")).toBe("{not json");
  });
});
