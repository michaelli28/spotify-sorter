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
import { runClassifyFromCache } from "@/src/lib/pipeline/classify";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const TRACK_COUNT = 400; // 8 batches of 50

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-classify-limits-"));
  process.env.SORTER_DATA_DIR = dir;
  const tracks = Object.fromEntries(
    Array.from({ length: TRACK_COUNT }, (_, i) => [
      `t${i}`,
      {
        artist_id: "a1",
        title: `Song ${i}`,
        first_seen: "2026-05-13T00:00:00.000Z",
      },
    ]),
  );
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      artists: { a1: { name: "Artist", genres: [] } },
      tracks,
      categories: {
        "cat-1": {
          name: "Chill Vibes",
          description: "Relaxing music",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
          example_track_ids: [],
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

// Answers every track in the request with one "Chill Vibes" match, keyed by
// whatever the prompt line starts with (the text before the first tab).
async function echoAllTracks(request: Request) {
  const body = (await request.json()) as {
    messages: Array<{ content: string }>;
  };
  const keys = body.messages[0]!.content.split("\n")
    .filter((line) => line.includes("\t"))
    .map((line) => line.split("\t")[0]!);
  return HttpResponse.json({
    id: "msg_x",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          tracks: keys.map((k) => ({
            n: Number(k),
            matches: [{ category: "Chill Vibes", score: 80 }],
          })),
        }),
      },
    ],
    usage: { input_tokens: 1000, output_tokens: 500 },
  });
}

describe("runClassifyFromCache limits", () => {
  it("never has more than 3 classify calls in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      http.post(
        "https://api.anthropic.com/v1/messages",
        async ({ request }) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 20));
          inFlight--;
          return echoAllTracks(request);
        },
      ),
    );
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });
    expect(result.tracks_classified).toBe(TRACK_COUNT);
    expect(maxInFlight).toBe(3);
  });

  it("gives up on a persistent 429 after the SDK's retries instead of looping", async () => {
    let calls = 0;
    server.use(
      http.post(
        "https://api.anthropic.com/v1/messages",
        async ({ request }) => {
          calls++;
          // Escape hatch so the old uncapped loop ends and the test fails cleanly.
          if (calls > 30) return echoAllTracks(request);
          // No body: the SDK cancels a retried response's body, and cancelling
          // an msw body never settles.
          return new HttpResponse(null, {
            status: 429,
            headers: { "retry-after-ms": "1" },
          });
        },
      ),
    );
    await expect(runClassifyFromCache({ apiKey: "sk-ant-x" })).rejects.toThrow(
      /429/,
    );
    // Each batch: 1 call + 2 SDK retries; no batch past the first 3 starts.
    expect(calls).toBeLessThanOrEqual(9);
  });

  it("records a failed run with the cost spent so far", async () => {
    let calls = 0;
    server.use(
      http.post(
        "https://api.anthropic.com/v1/messages",
        async ({ request }) => {
          calls++;
          if (calls <= 2) return echoAllTracks(request);
          return HttpResponse.json(
            {
              type: "error",
              error: { type: "invalid_request_error", message: "bad" },
            },
            { status: 400 },
          );
        },
      ),
    );
    await expect(runClassifyFromCache({ apiKey: "sk-ant-x" })).rejects.toThrow(
      /bad/,
    );
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.runs).toHaveLength(1);
    const run = cache.runs[0]!;
    expect(run.summary).toMatch(/failed/i);
    expect(run.tracks_classified).toBe(100);
    // 2 successful calls × (1000 in @ $1/M + 500 out @ $5/M)
    expect(run.cost_usd).toBeCloseTo(2 * 0.0035, 6);
  });
});
