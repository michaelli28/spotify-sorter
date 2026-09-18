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
import { classifyBatch } from "@/src/lib/llm/classify";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-classify-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const categories = [
  { id: "cat-1", name: "Chill Vibes", description: "Relaxing music" },
  { id: "cat-2", name: "Workout Bangers", description: "High energy" },
];

const tracks = [
  {
    id: "t1",
    title: "Ocean Eyes",
    artist_name: "Billie Eilish",
    genres: ["pop"],
  },
  { id: "t2", title: "Power", artist_name: "Kanye West", genres: ["hip hop"] },
];

function makeValidResponse(
  trackAssignments: Array<{
    track_id: string;
    category: string;
    score: number;
  }>,
) {
  return {
    id: "msg_x",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          tracks: trackAssignments.map((a) => ({
            track_id: a.track_id,
            matches: [{ category: a.category, score: a.score }],
          })),
        }),
      },
    ],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    usage: { input_tokens: 800, output_tokens: 200 },
  };
}

describe("classifyBatch", () => {
  it("parses valid response and maps category names to ids", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json(
          makeValidResponse([
            { track_id: "t1", category: "Chill Vibes", score: 90 },
            { track_id: "t2", category: "Workout Bangers", score: 85 },
          ]),
        ),
      ),
    );

    const result = await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks,
    });

    expect(result.assignments).toHaveLength(2);
    const t1 = result.assignments.find((a) => a.track_id === "t1")!;
    expect(t1.matches[0]).toMatchObject({ category_id: "cat-1", score: 90 });
    const t2 = result.assignments.find((a) => a.track_id === "t2")!;
    expect(t2.matches[0]).toMatchObject({ category_id: "cat-2", score: 85 });
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("does not ask the model for reasoning text (output tokens are 93% of cost)", async () => {
    let body = "";
    server.use(
      http.post(
        "https://api.anthropic.com/v1/messages",
        async ({ request }) => {
          body = await request.text();
          return HttpResponse.json(
            makeValidResponse([
              { track_id: "t1", category: "Chill Vibes", score: 90 },
            ]),
          );
        },
      ),
    );
    await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks: [tracks[0]!],
    });
    expect(body).not.toMatch(/reasoning/i);
  });

  it("retries on malformed JSON", async () => {
    let call = 0;
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () => {
        call++;
        if (call === 1) {
          return HttpResponse.json({
            ...makeValidResponse([
              { track_id: "t1", category: "Chill Vibes", score: 90 },
            ]),
            content: [{ type: "text", text: "not json at all" }],
          });
        }
        return HttpResponse.json(
          makeValidResponse([
            { track_id: "t1", category: "Chill Vibes", score: 90 },
          ]),
        );
      }),
    );

    const result = await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks: [tracks[0]!],
    });

    expect(call).toBe(2);
    expect(result.assignments).toHaveLength(1);
  });

  it("drops matches that reference unknown category names", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json(
          makeValidResponse([
            { track_id: "t1", category: "Unknown Category", score: 80 },
            { track_id: "t1", category: "Chill Vibes", score: 70 },
          ]),
        ),
      ),
    );

    // Override the text to have two matches per track
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "msg_x",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tracks: [
                  {
                    track_id: "t1",
                    matches: [
                      { category: "Unknown Category", score: 80 },
                      { category: "Chill Vibes", score: 70 },
                    ],
                  },
                ],
              }),
            },
          ],
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          usage: { input_tokens: 800, output_tokens: 200 },
        }),
      ),
    );

    const result = await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks: [tracks[0]!],
    });

    const t1 = result.assignments.find((a) => a.track_id === "t1")!;
    // "Unknown Category" should be dropped, only "Chill Vibes" (cat-1) survives
    expect(t1.matches).toHaveLength(1);
    expect(t1.matches[0]).toMatchObject({ category_id: "cat-1", score: 70 });
  });
});
