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

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-classify-pipeline-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      artists: { a1: { name: "Billie Eilish", genres: ["pop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Ocean Eyes",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
        t2: {
          artist_id: "a1",
          title: "Bad Guy",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {
        "cat-1": {
          name: "Chill Vibes",
          description: "Relaxing music",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

function makeClassifyResponse(
  tracks: Array<{ id: string; category: string; score: number }>,
) {
  return {
    id: "msg_x",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          tracks: tracks.map((t) => ({
            track_id: t.id,
            matches: [{ category: t.category, score: t.score }],
            reasoning: "Fits well",
          })),
        }),
      },
    ],
    usage: { input_tokens: 800, output_tokens: 200 },
  };
}

describe("runClassifyFromCache", () => {
  it("classifies unclassified tracks and persists assignments", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json(
          makeClassifyResponse([
            { id: "t1", category: "Chill Vibes", score: 90 },
            { id: "t2", category: "Chill Vibes", score: 80 },
          ]),
        ),
      ),
    );

    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });

    expect(result.tracks_classified).toBe(2);
    expect(result.cost_usd).toBeGreaterThan(0);

    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.assignments["t1"]).toBeDefined();
    expect(cache.assignments["t1"]!.matches[0]).toMatchObject({
      category_id: "cat-1",
      score: 90,
    });
    expect(cache.assignments["t2"]).toBeDefined();
  });

  it("skips already-classified tracks on second run", async () => {
    let callCount = 0;
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () => {
        callCount++;
        return HttpResponse.json(
          makeClassifyResponse([
            { id: "t1", category: "Chill Vibes", score: 90 },
            { id: "t2", category: "Chill Vibes", score: 80 },
          ]),
        );
      }),
    );

    // First run classifies both
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    const firstCallCount = callCount;

    // Second run should skip both (no unclassified tracks remain)
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });

    expect(result.tracks_classified).toBe(0);
    expect(callCount).toBe(firstCallCount); // no additional API calls
  });

  it("appends a run record to cache.runs after classifying", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json(
          makeClassifyResponse([
            { id: "t1", category: "Chill Vibes", score: 90 },
            { id: "t2", category: "Chill Vibes", score: 80 },
          ]),
        ),
      ),
    );
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.runs).toHaveLength(1);
    expect(cache.runs[0]).toMatchObject({
      type: "classify",
      tracks_classified: 2,
      tracks_total: 2,
    });
  });

  it("appends a no-op run record when nothing to classify", async () => {
    let callCount = 0;
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () => {
        callCount++;
        return HttpResponse.json(
          makeClassifyResponse([
            { id: "t1", category: "Chill Vibes", score: 90 },
            { id: "t2", category: "Chill Vibes", score: 80 },
          ]),
        );
      }),
    );
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.runs).toHaveLength(2);
    expect(cache.runs[1]).toMatchObject({
      type: "classify",
      tracks_classified: 0,
      cost_usd: 0,
    });
    expect(cache.runs[1]!.summary).toContain("already classified");
  });
});
