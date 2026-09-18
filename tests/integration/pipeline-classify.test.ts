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

const TRACKS = {
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
};

async function seed(
  extra: Parameters<typeof patchCache>[1] = {},
): Promise<void> {
  await writeCache(
    join(dir, "cache.json"),
    patchCache(
      patchCache(defaultCache(), {
        artists: { a1: { name: "Billie Eilish", genres: ["pop"] } },
        tracks: TRACKS,
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
      extra,
    ),
  );
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-classify-pipeline-"));
  process.env.SORTER_DATA_DIR = dir;
  await seed();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const SCORES: Record<string, number> = { "Ocean Eyes": 90, "Bad Guy": 80 };

// Answers each numbered line of the prompt by title, so follow-up calls (which
// renumber the tracks they resend) are answered correctly too. Titles in
// `skip` are left out of the answer, like a model that drops a track.
function classifyHandler(
  opts: {
    skip?: string[] | ((call: number) => string[]);
    calls?: string[][];
  } = {},
) {
  let call = 0;
  return http.post(
    "https://api.anthropic.com/v1/messages",
    async ({ request }) => {
      const body = (await request.json()) as {
        messages: Array<{ content: string }>;
      };
      const lines = body.messages[0]!.content.split("\n")
        .filter((line) => line.includes("\t"))
        .map((line) => line.split("\t"))
        .map(([n, rest]) => ({ n: Number(n), title: rest!.split(" — ")[0]! }));
      opts.calls?.push(lines.map((l) => l.title));
      const skip =
        typeof opts.skip === "function" ? opts.skip(call) : (opts.skip ?? []);
      call++;
      const rows = lines
        .filter((l) => !skip.includes(l.title))
        .map((l) => ({
          n: l.n,
          matches: [{ category: "Chill Vibes", score: SCORES[l.title] ?? 50 }],
        }));
      return HttpResponse.json({
        id: "msg_x",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ tracks: rows }) }],
        usage: { input_tokens: 800, output_tokens: 200 },
      });
    },
  );
}

const COST_PER_CALL = 0.0018; // 800 in @ $1/M + 200 out @ $5/M

describe("runClassifyFromCache", () => {
  it("classifies unclassified tracks and persists assignments", async () => {
    server.use(classifyHandler());
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });

    expect(result.tracks_classified).toBe(2);
    expect(result.cost_usd).toBeCloseTo(COST_PER_CALL, 6);
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.assignments["t1"]!.matches).toEqual([
      { category_id: "cat-1", score: 90 },
    ]);
    expect(cache.assignments["t2"]!.matches).toEqual([
      { category_id: "cat-1", score: 80 },
    ]);
  });

  it("resends a track the model skipped, and counts that call's cost too", async () => {
    const calls: string[][] = [];
    server.use(
      classifyHandler({
        skip: (call) => (call === 0 ? ["Bad Guy"] : []),
        calls,
      }),
    );
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });

    expect(calls).toEqual([["Ocean Eyes", "Bad Guy"], ["Bad Guy"]]);
    expect(result.tracks_classified).toBe(2);
    expect(result.cost_usd).toBeCloseTo(2 * COST_PER_CALL, 6);
    const cache = await readCache(join(dir, "cache.json"));
    expect(Object.keys(cache.assignments).sort()).toEqual(["t1", "t2"]);
    expect(cache.runs[0]!.cost_usd).toBeCloseTo(2 * COST_PER_CALL, 6);
  });

  it("records a track still missing after 3 tries as skipped, never as a guess", async () => {
    const calls: string[][] = [];
    server.use(classifyHandler({ skip: ["Bad Guy"], calls }));
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });

    expect(calls).toHaveLength(3);
    expect(result.tracks_classified).toBe(1);
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.assignments["t2"]).toBeUndefined();
    expect(cache.runs[0]).toMatchObject({
      tracks_classified: 1,
      skipped: ["t2"],
    });
    expect(cache.runs[0]!.summary).toContain("1 skipped");
    expect(cache.runs[0]!.cost_usd).toBeCloseTo(3 * COST_PER_CALL, 6);
  });

  it("only ever writes assignments for real tracks", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "msg_x",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          // The old failure: an answer keyed by a mangled Spotify ID.
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tracks: [
                  {
                    track_id: "48CiA3IjkJZiyl6S6UbPCy",
                    matches: [{ category: "Chill Vibes", score: 90 }],
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 800, output_tokens: 200 },
        }),
      ),
    );
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    const cache = await readCache(join(dir, "cache.json"));
    expect(Object.keys(cache.assignments)).toEqual([]);
    expect(cache.runs[0]).toMatchObject({ skipped: ["t1", "t2"] });
  });

  it("counts reused tracks, not assignment keys, so orphans can't inflate the summary", async () => {
    await seed({
      assignments: {
        t1: {
          matches: [{ category_id: "cat-1", score: 90 }],
          classified_at: "2026-05-13T00:00:00.000Z",
          override: null,
        },
        "6Matilda — Harry Styles": {
          matches: [{ category_id: "cat-1", score: 90 }],
          classified_at: "2026-05-13T00:00:00.000Z",
          override: null,
        },
      },
    });
    server.use(classifyHandler());
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.runs[0]!.summary).toBe(
      "Classified 1 new tracks. 1 reused from cache.",
    );
    expect(cache.runs[1]!.summary).toBe(
      "All 2 tracks already classified — no Claude call needed.",
    );
  });

  it("skips already-classified tracks on second run", async () => {
    const calls: string[][] = [];
    server.use(classifyHandler({ calls }));
    await runClassifyFromCache({ apiKey: "sk-ant-x" });
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });

    expect(result.tracks_classified).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("appends a run record to cache.runs after classifying", async () => {
    server.use(classifyHandler());
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
    server.use(classifyHandler());
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
