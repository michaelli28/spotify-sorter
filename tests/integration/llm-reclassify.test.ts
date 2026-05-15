// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { reclassifyAgainstCategory } from "@/src/lib/llm/reclassify";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("reclassifyAgainstCategory", () => {
  it("returns 0-100 score per track for the new category", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                scores: [
                  { track_id: "t1", score: 75 },
                  { track_id: "t2", score: 25 },
                ],
              }),
            },
          ],
          usage: { input_tokens: 800, output_tokens: 200 },
        }),
      ),
    );
    const result = await reclassifyAgainstCategory({
      apiKey: "sk-ant-x",
      category: {
        id: "cnew",
        name: "Hyperpop",
        description: "Glittery, hyperactive.",
      },
      tracks: [
        { id: "t1", title: "X", artist_name: "A", genres: ["hyperpop"] },
        { id: "t2", title: "Y", artist_name: "B", genres: ["country"] },
      ],
    });
    expect(result.scores).toEqual([
      { track_id: "t1", score: 75 },
      { track_id: "t2", score: 25 },
    ]);
  });
});
