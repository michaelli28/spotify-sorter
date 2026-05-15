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
import { runReclassifyForNewCategories } from "@/src/lib/pipeline/reclassify";
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
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      artists: { a1: { name: "A", genres: ["pop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "X",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {
        cold: {
          name: "Old Cat",
          description: "d",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
        cnew: {
          name: "Hyperpop",
          description: "glittery",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
      },
      assignments: {
        t1: {
          matches: [{ category_id: "cold", score: 80 }],
          reasoning: "r",
          classified_at: "2026-05-13T00:00:00.000Z",
          override: null,
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runReclassifyForNewCategories", () => {
  it("adds new category to existing matches, keeps top-5", async () => {
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
              text: JSON.stringify({ scores: [{ track_id: "t1", score: 85 }] }),
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      ),
    );
    const result = await runReclassifyForNewCategories({
      apiKey: "sk-ant-x",
      newCategoryIds: ["cnew"],
    });
    expect(result.tracks_updated).toBe(1);
    const cache = await readCache(join(dir, "cache.json"));
    const matches = cache.assignments["t1"]!.matches;
    expect(matches.find((m) => m.category_id === "cnew")?.score).toBe(85);
  });

  it("does not touch tracks with manual override", async () => {
    const seeded = await readCache(join(dir, "cache.json"));
    await writeCache(
      join(dir, "cache.json"),
      patchCache(seeded, {
        assignments: {
          t1: {
            ...seeded.assignments["t1"]!,
            override: {
              category_id: "cold",
              set_at: "2026-05-13T00:00:00.000Z",
            },
          },
        },
      }),
    );
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ scores: [] }) }],
          usage: { input_tokens: 50, output_tokens: 20 },
        }),
      ),
    );
    await runReclassifyForNewCategories({
      apiKey: "sk-ant-x",
      newCategoryIds: ["cnew"],
    });
    const cache = await readCache(join(dir, "cache.json"));
    expect(
      cache.assignments["t1"]!.matches.find((m) => m.category_id === "cnew"),
    ).toBeUndefined();
  });
});
