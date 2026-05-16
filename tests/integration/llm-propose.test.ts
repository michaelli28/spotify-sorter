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
import { http } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPropose } from "@/src/lib/llm/propose";
import { anthropicSseResponse } from "../helpers/sse-mock";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const validJson = JSON.stringify({
  categories: [
    {
      name: "Aesthetic Rap",
      description: "Cloud rap",
      example_track_ids: ["t1"],
    },
  ],
});

describe("runPropose", () => {
  it("parses propose JSON and returns categories with assigned ids", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        anthropicSseResponse({
          text: validJson,
          input_tokens: 1500,
          output_tokens: 300,
        }),
      ),
    );
    const result = await runPropose({
      apiKey: "sk-ant-x",
      tracks: [
        {
          id: "t1",
          title: "Self Care",
          artist_name: "Mac Miller",
          genres: ["hip hop"],
        },
      ],
    });
    expect(result.categories[0]).toMatchObject({
      name: "Aesthetic Rap",
      example_track_ids: ["t1"],
    });
    expect(result.categories[0]!.id).toBeTruthy();
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("retries once on malformed JSON", async () => {
    let call = 0;
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () => {
        call++;
        if (call === 1) {
          return anthropicSseResponse({
            text: "not json at all",
            input_tokens: 1500,
            output_tokens: 50,
          });
        }
        return anthropicSseResponse({
          text: validJson,
          input_tokens: 1500,
          output_tokens: 300,
        });
      }),
    );
    const result = await runPropose({
      apiKey: "sk-ant-x",
      tracks: [{ id: "t1", title: "X", artist_name: "Y", genres: [] }],
    });
    expect(call).toBe(2);
    expect(result.categories).toHaveLength(1);
  });

  it("completes the LLM call even when onProgress throws (client disconnect)", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        anthropicSseResponse({
          text: validJson,
          input_tokens: 1500,
          output_tokens: 300,
        }),
      ),
    );
    let progressCalls = 0;
    const result = await runPropose({
      apiKey: "sk-ant-x",
      tracks: [{ id: "t1", title: "X", artist_name: "Y", genres: [] }],
      onProgress: () => {
        progressCalls++;
        throw new Error("client disconnected");
      },
    });
    expect(result.categories).toHaveLength(1);
    expect(progressCalls).toBeGreaterThan(0);
  });

  it("throws after second malformed response", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        anthropicSseResponse({
          text: "{bad",
          input_tokens: 1500,
          output_tokens: 5,
        }),
      ),
    );
    await expect(
      runPropose({
        apiKey: "sk-ant-x",
        tracks: [{ id: "t1", title: "X", artist_name: "Y", genres: [] }],
      }),
    ).rejects.toThrow();
  });
});
