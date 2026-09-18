// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetEnvForTests } from "@/src/lib/config/env";

vi.mock("@/src/lib/pipeline/classify", () => ({
  runClassifyFromCache: vi.fn(),
}));
vi.mock("@/src/lib/pipeline/propose", () => ({
  runProposeFromCache: vi.fn(),
}));

import { runClassifyFromCache } from "@/src/lib/pipeline/classify";
import { runProposeFromCache } from "@/src/lib/pipeline/propose";
import { GET as classifyGET } from "@/app/api/llm/classify/route";
import { GET as proposeGET } from "@/app/api/llm/propose/route";

const classifyMock = vi.mocked(runClassifyFromCache);
const proposeMock = vi.mocked(runProposeFromCache);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function readAll(res: Response): Promise<string> {
  return new Response(res.body).text();
}

// Let the route's stream start() run far enough to reach the pipeline.
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  classifyMock.mockReset();
  proposeMock.mockReset();
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  _resetEnvForTests();
});

describe("GET /api/llm/classify", () => {
  it("joins the running job instead of starting a second, double-billed run", async () => {
    const run = deferred<{ tracks_classified: number; cost_usd: number }>();
    classifyMock.mockImplementation(async ({ onProgress }) => {
      onProgress?.("batch", 1, 2);
      return run.promise;
    });

    const first = await classifyGET();
    await tick();
    const second = await classifyGET();
    await tick();
    run.resolve({ tracks_classified: 100, cost_usd: 0.1 });

    const [a, b] = await Promise.all([readAll(first), readAll(second)]);
    expect(classifyMock).toHaveBeenCalledTimes(1);
    for (const body of [a, b]) {
      expect(body).toContain(
        'event: progress\ndata: {"stage":"batch","done":1,"total":2}',
      );
      expect(body).toContain(
        'event: done\ndata: {"tracks_classified":100,"cost_usd":0.1}',
      );
    }
  });

  it("starts a fresh job once the previous one has finished", async () => {
    classifyMock.mockResolvedValue({ tracks_classified: 0, cost_usd: 0 });
    await readAll(await classifyGET());
    await readAll(await classifyGET());
    expect(classifyMock).toHaveBeenCalledTimes(2);
  });

  it("reports a failure to every joined client, then allows a retry", async () => {
    const run = deferred<{ tracks_classified: number; cost_usd: number }>();
    classifyMock.mockReturnValueOnce(run.promise);

    const first = await classifyGET();
    await tick();
    const second = await classifyGET();
    await tick();
    run.reject(new Error("boom"));

    const [a, b] = await Promise.all([readAll(first), readAll(second)]);
    expect(a).toContain('event: error\ndata: {"message":"boom"}');
    expect(b).toContain('event: error\ndata: {"message":"boom"}');

    classifyMock.mockResolvedValueOnce({ tracks_classified: 1, cost_usd: 0 });
    expect(await readAll(await classifyGET())).toContain("event: done");
    expect(classifyMock).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/llm/propose", () => {
  it("joins the running job instead of starting a second, double-billed run", async () => {
    const run = deferred<Awaited<ReturnType<typeof runProposeFromCache>>>();
    proposeMock.mockReturnValue(run.promise);

    const first = await proposeGET();
    await tick();
    const second = await proposeGET();
    await tick();
    run.resolve({ categories: [], cost_usd: 0.02 });

    const [a, b] = await Promise.all([readAll(first), readAll(second)]);
    expect(proposeMock).toHaveBeenCalledTimes(1);
    expect(a).toContain('event: done\ndata: {"categories":[],"cost_usd":0.02}');
    expect(b).toContain('event: done\ndata: {"categories":[],"cost_usd":0.02}');
  });
});
