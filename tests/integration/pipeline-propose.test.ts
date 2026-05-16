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
import { runProposeFromCache } from "@/src/lib/pipeline/propose";
import { anthropicSseResponse } from "../helpers/sse-mock";
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
      artists: { a1: { name: "Mac Miller", genres: ["hip hop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Self Care",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runProposeFromCache", () => {
  it("feeds cache tracks to runPropose and persists categories", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        anthropicSseResponse({
          text: JSON.stringify({
            categories: [
              {
                name: "Aesthetic Rap",
                description: "X",
                example_track_ids: ["t1"],
              },
            ],
          }),
          input_tokens: 1500,
          output_tokens: 300,
        }),
      ),
    );
    const result = await runProposeFromCache({ apiKey: "sk-ant-x" });
    expect(result.categories).toHaveLength(1);
    const cache = await readCache(join(dir, "cache.json"));
    expect(Object.values(cache.categories)[0]!.name).toBe("Aesthetic Rap");
  });
});
