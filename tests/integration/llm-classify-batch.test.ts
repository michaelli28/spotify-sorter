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
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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

// Real-looking 22-char Spotify IDs, the kind the model used to mangle.
const OCEAN = "48CiA3IjkNZiyl6S6UbPCy";
const POWER = "6uvh0In7u1Xn4HgxOfAn8O";
const tracks = [
  {
    id: OCEAN,
    title: "Ocean Eyes",
    artist_name: "Billie Eilish",
    genres: ["pop"],
  },
  { id: POWER, title: "Power", artist_name: "Kanye West", genres: ["hip hop"] },
];

type Row = { n: unknown; matches: Array<{ category: string; score: number }> };

function reply(
  rows: Row[] | string,
  usage = { input_tokens: 800, output_tokens: 200 },
) {
  return HttpResponse.json({
    id: "msg_x",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text:
          typeof rows === "string" ? rows : JSON.stringify({ tracks: rows }),
      },
    ],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    usage,
  });
}

function answer(rows: Row[] | string) {
  server.use(
    http.post("https://api.anthropic.com/v1/messages", () => reply(rows)),
  );
}

async function captureRequest(rows: Row[]) {
  let body: Record<string, unknown> = {};
  server.use(
    http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return reply(rows);
    }),
  );
  await classifyBatch({ apiKey: "sk-ant-x", categories, tracks });
  return body;
}

const both: Row[] = [
  { n: 1, matches: [{ category: "Chill Vibes", score: 90 }] },
  { n: 2, matches: [{ category: "Workout Bangers", score: 85 }] },
];

describe("classifyBatch request", () => {
  it("sends tracks as line numbers, never as Spotify IDs", async () => {
    const body = await captureRequest(both);
    const user = JSON.stringify(body.messages);
    expect(user).toContain("1\\tOcean Eyes — Billie Eilish [pop]");
    expect(user).toContain("2\\tPower — Kanye West [hip hop]");
    expect(JSON.stringify(body)).not.toContain(OCEAN);
    expect(JSON.stringify(body)).not.toContain(POWER);
  });

  it("constrains track numbers and category names to enums via structured outputs", async () => {
    const body = await captureRequest(both);
    const format = (
      body.output_config as { format: { type: string; schema: unknown } }
    ).format;
    expect(format.type).toBe("json_schema");
    const row = (
      format.schema as {
        properties: {
          tracks: { items: { properties: Record<string, unknown> } };
        };
      }
    ).properties.tracks.items.properties;
    expect(row.n).toEqual({ type: "integer", enum: [1, 2] });
    const match = (
      row.matches as { items: { properties: Record<string, unknown> } }
    ).items.properties;
    expect(match.category).toEqual({
      type: "string",
      enum: ["Chill Vibes", "Workout Bangers"],
    });
  });

  it("does not ask for reasoning text or prompt caching", async () => {
    const body = await captureRequest(both);
    expect(JSON.stringify(body)).not.toMatch(/reasoning/i);
    expect(JSON.stringify(body)).not.toContain("cache_control");
  });
});

describe("classifyBatch response checks", () => {
  it("maps line numbers back to the original track IDs", async () => {
    answer(both);
    const r = await classifyBatch({ apiKey: "sk-ant-x", categories, tracks });
    expect(r.assignments).toEqual([
      { track_id: OCEAN, matches: [{ category_id: "cat-1", score: 90 }] },
      { track_id: POWER, matches: [{ category_id: "cat-2", score: 85 }] },
    ]);
    expect(r.missing).toEqual([]);
    expect(r.cost_usd).toBeCloseTo(0.0018, 6);
  });

  it("drops an unknown track number and reports the unanswered track as missing", async () => {
    answer([
      { n: 1, matches: [{ category: "Chill Vibes", score: 90 }] },
      { n: 7, matches: [{ category: "Chill Vibes", score: 90 }] },
    ]);
    const r = await classifyBatch({ apiKey: "sk-ant-x", categories, tracks });
    expect(r.assignments.map((a) => a.track_id)).toEqual([OCEAN]);
    expect(r.missing.map((t) => t.id)).toEqual([POWER]);
  });

  it("treats a track number returned twice as missing, since either copy could be wrong", async () => {
    answer([
      { n: 1, matches: [{ category: "Chill Vibes", score: 90 }] },
      { n: 1, matches: [{ category: "Workout Bangers", score: 70 }] },
      { n: 2, matches: [{ category: "Workout Bangers", score: 85 }] },
    ]);
    const r = await classifyBatch({ apiKey: "sk-ant-x", categories, tracks });
    expect(r.assignments.map((a) => a.track_id)).toEqual([POWER]);
    expect(r.missing.map((t) => t.id)).toEqual([OCEAN]);
  });

  it("never returns an empty assignment: a track with no known category is missing", async () => {
    answer([
      { n: 1, matches: [{ category: "Not A Category", score: 90 }] },
      { n: 2, matches: [] },
    ]);
    const r = await classifyBatch({ apiKey: "sk-ant-x", categories, tracks });
    expect(r.assignments).toEqual([]);
    expect(r.missing.map((t) => t.id)).toEqual([OCEAN, POWER]);
  });

  it("drops out-of-range scores, merges a repeated category, and keeps at most 5 highest-first", async () => {
    const many = [
      { id: "c1", name: "A", description: "" },
      { id: "c2", name: "B", description: "" },
      { id: "c3", name: "C", description: "" },
      { id: "c4", name: "D", description: "" },
      { id: "c5", name: "E", description: "" },
      { id: "c6", name: "F", description: "" },
    ];
    answer([
      {
        n: 1,
        matches: [
          { category: "A", score: 150 },
          { category: "B", score: 40 },
          { category: "B", score: 60 },
          { category: "C", score: 70 },
          { category: "D", score: 20 },
          { category: "E", score: 90 },
          { category: "F", score: 50 },
          { category: "a", score: 30 },
        ],
      },
    ]);
    const r = await classifyBatch({
      apiKey: "sk-ant-x",
      categories: many,
      tracks: [tracks[0]!],
    });
    expect(r.assignments[0]!.matches).toEqual([
      { category_id: "c5", score: 90 },
      { category_id: "c3", score: 70 },
      { category_id: "c2", score: 60 },
      { category_id: "c6", score: 50 },
      { category_id: "c1", score: 30 },
    ]);
  });

  it("marks the whole batch missing when the output isn't valid JSON, but still charges for it", async () => {
    answer('{"tracks": [{"n": 1, "matches": [{"category": "Chill');
    const r = await classifyBatch({ apiKey: "sk-ant-x", categories, tracks });
    expect(r.assignments).toEqual([]);
    expect(r.missing.map((t) => t.id)).toEqual([OCEAN, POWER]);
    expect(r.cost_usd).toBeCloseTo(0.0018, 6);
  });

  it("logs the call with its cost", async () => {
    answer(both);
    await classifyBatch({ apiKey: "sk-ant-x", categories, tracks });
    const [file] = await readdir(join(dir, "logs"));
    const line = JSON.parse(
      (await readFile(join(dir, "logs", file!), "utf-8")).trim(),
    );
    expect(line).toMatchObject({
      phase: "classify",
      input_tokens: 800,
      output_tokens: 200,
      batch_size: 2,
    });
    expect(line.cost_usd).toBeCloseTo(0.0018, 6);
  });
});
