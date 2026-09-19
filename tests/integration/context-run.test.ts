// @vitest-environment node
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyBatch, type BatchResult } from "@/src/lib/llm/classify";
import { buildLayouts } from "@/src/lib/analysis/context-layout";
import {
  auditSpend,
  linesToRuns,
  readContextMeta,
  readRunLines,
  runContextTest,
  WORST_CASE_CALL_USD,
  type ContextClassify,
  type LogRow,
  type RunLine,
} from "@/src/lib/analysis/context-run";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-context-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const categories = [
  { id: "cat-2", name: "Workout", description: "High energy" },
  { id: "cat-1", name: "Chill", description: "Relaxing" },
];
const ids = ["t1", "t2", "t3", "t4", "t5", "t6"];
const tracksById = Object.fromEntries(
  ids.map((id) => [
    id,
    { id, title: `Song ${id}`, artist_name: "Artist", genres: ["pop"] },
  ]),
);
// 6 tracks in 2 batches of 3 -> 4 runs x 2 batches = 8 calls, 24 slots.
const layouts = buildLayouts({ trackIds: ids, seed: "s", batchSize: 3 });
const usage = { input_tokens: 1000, output_tokens: 100 };

type Call = Parameters<ContextClassify>[0];
function fakeClassify(
  opts: { cost?: number; drop?: (id: string) => boolean; failOn?: number } = {},
) {
  const calls: Call[] = [];
  const classify = vi.fn(async (call: Call): Promise<BatchResult> => {
    calls.push(call);
    if (calls.length === opts.failOn) throw new Error("connection closed");
    const answered = call.tracks.filter((t) => !opts.drop?.(t.id));
    return {
      assignments: answered.map((t) => ({
        track_id: t.id,
        matches: [{ category_id: "cat-1", score: 70 }],
      })),
      missing: call.tracks.filter((t) => opts.drop?.(t.id)),
      usage,
      cost_usd: opts.cost ?? 0.001,
    };
  });
  return { classify, calls };
}

let clock = 0;
const now = () => new Date(Date.UTC(2026, 8, 19) + clock++ * 1000);

const outPath = () => join(dir, "analysis", "context-runs.jsonl");
const metaPath = () => join(dir, "analysis", "context-meta.json");
type RunOpts = Parameters<typeof runContextTest>[0];
function run(
  classify: ContextClassify,
  capUsd = 1,
  over: Partial<RunOpts> = {},
) {
  return runContextTest({
    classify,
    tracksById,
    categories,
    layouts,
    seed: "s",
    outPath: outPath(),
    metaPath: metaPath(),
    capUsd,
    now,
    ...over,
  });
}

// Logs each call as classifyBatch does, then optionally dies on call `killOn`
// before its run line is appended: charged, never recorded.
function loggingClassify(rows: LogRow[], killOn?: number): ContextClassify {
  const { classify } = fakeClassify();
  let n = 0;
  return async (call) => {
    const r = await classify(call);
    rows.push({
      timestamp: now().toISOString(),
      phase: "context-test",
      cost_usd: r.cost_usd,
    });
    if (++n === killOn) throw new Error("killed before the append");
    return r;
  };
}

describe("runContextTest", () => {
  it("sends A1, B, A2, C batch by batch, in line order, logged as context-test", async () => {
    const { classify, calls } = fakeClassify();
    await run(classify);
    expect(calls.map((c) => c.tracks.map((t) => t.id))).toEqual([
      layouts.A[0],
      layouts.A[1],
      layouts.B[0],
      layouts.B[1],
      layouts.A[0],
      layouts.A[1],
      layouts.C[0],
      layouts.C[1],
    ]);
    for (const c of calls) {
      expect(c.logPhase).toBe("context-test");
      expect(c.categories).toEqual(categories);
    }
  });

  it("appends one line per batch and records the meta", async () => {
    const { classify } = fakeClassify();
    const summary = await run(classify);
    const lines = await readRunLines(outPath());
    expect(lines).toHaveLength(8);
    expect(lines.map((l) => `${l.run}${l.batch}`)).toEqual([
      "A10",
      "A11",
      "B0",
      "B1",
      "A20",
      "A21",
      "C0",
      "C1",
    ]);
    const first = JSON.parse(
      (await readFile(outPath(), "utf-8")).split("\n")[0]!,
    );
    expect(first).toEqual({
      run: "A1",
      batch: 0,
      track_ids: layouts.A[0],
      assignments: layouts.A[0]!.map((track_id) => ({
        track_id,
        matches: [{ category_id: "cat-1", score: 70 }],
      })),
      missing: [],
      usage,
      cost_usd: 0.001,
      started_at: expect.any(String),
      at: expect.any(String),
    });
    expect(first.started_at < first.at).toBe(true);

    const meta = JSON.parse(await readFile(metaPath(), "utf-8"));
    expect(meta).toEqual({
      seed: "s",
      category_ids: ["cat-2", "cat-1"],
      inputs_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      layouts: { A: layouts.A, B: layouts.B, C: layouts.C },
      created_at: expect.any(String),
    });
    // Opens the spend-audit window before the first call is charged.
    expect(meta.created_at < first.started_at).toBe(true);
    expect(summary).toMatchObject({
      batches_total: 8,
      batches_run: 8,
      batches_skipped: 0,
      missing: { A1: 0, B: 0, A2: 0, C: 0 },
    });
    expect(summary.spent_usd).toBeCloseTo(0.008, 12);
    expect(summary.run_cost_usd).toBeCloseTo(0.008, 12);
    expect(summary.estimate_usd.low).toBeCloseTo(24 * 0.000551, 12);
    expect(summary.estimate_usd.high).toBeCloseTo(24 * 0.000635, 12);
  });

  it("resumes after a failure, skipping the batches already on disk", async () => {
    const first = fakeClassify({ failOn: 3 });
    await expect(run(first.classify)).rejects.toThrow(/connection closed/);
    expect(await readRunLines(outPath())).toHaveLength(2);

    const second = fakeClassify();
    const summary = await run(second.classify);
    expect(second.calls[0]!.tracks.map((t) => t.id)).toEqual(layouts.B[0]);
    expect(second.calls).toHaveLength(6);
    const lines = await readRunLines(outPath());
    expect(new Set(lines.map((l) => `${l.run}:${l.batch}`)).size).toBe(8);
    expect(lines).toHaveLength(8);
    expect(summary).toMatchObject({ batches_run: 6, batches_skipped: 2 });
    expect(summary.spent_usd).toBeCloseTo(0.008, 12);
    expect(summary.run_cost_usd).toBeCloseTo(0.006, 12);
  });

  it("never resends a missing track: it is recorded and left out", async () => {
    // The model skips one track every time it is sent.
    const dropped = layouts.A[0]![1]!;
    const { classify, calls } = fakeClassify({ drop: (id) => id === dropped });
    const summary = await run(classify);
    expect(calls).toHaveLength(8);
    // Each run sends every track exactly once.
    for (let r = 0; r < 4; r++) {
      const sent = calls
        .slice(r * 2, r * 2 + 2)
        .flatMap((c) => c.tracks.map((t) => t.id));
      expect([...sent].sort()).toEqual(ids);
    }
    const lines = await readRunLines(outPath());
    const a1 = lines.find((l) => l.run === "A1" && l.batch === 0)!;
    expect(a1.missing).toEqual([dropped]);
    expect(a1.assignments.map((a) => a.track_id)).not.toContain(dropped);
    expect(summary.missing).toEqual({ A1: 1, B: 1, A2: 1, C: 1 });
  });

  it("aborts at the cap before spending anything", async () => {
    const { classify } = fakeClassify();
    // 24 slots x $0.000635 high estimate = $0.01524 > $0.01.
    await expect(run(classify, 0.01)).rejects.toThrow(/cap/i);
    expect(classify).not.toHaveBeenCalled();
    expect(existsSync(outPath())).toBe(false);
  });

  it("counts earlier spend against the cap on resume", async () => {
    const first = fakeClassify({ cost: 0.3, failOn: 3 });
    await expect(run(first.classify)).rejects.toThrow(/connection closed/);
    // $0.60 spent + 18 slots x $0.000635 = $0.6114 > $0.61.
    const second = fakeClassify();
    await expect(run(second.classify, 0.61)).rejects.toThrow(/cap/i);
    expect(second.classify).not.toHaveBeenCalled();
  });

  it("stops before a batch once real spend plus its estimate would pass the cap", async () => {
    const { classify } = fakeClassify({ cost: 0.5 });
    await expect(run(classify, 1)).rejects.toThrow(/cap/i);
    expect(classify).toHaveBeenCalledTimes(2);
    expect(await readRunLines(outPath())).toHaveLength(2);
  });

  it("stops before a batch whose worst-case charge would pass the cap", async () => {
    const { classify } = fakeClassify();
    // The estimate fits ($0.015 <= $0.05) but one runaway reply could cost
    // WORST_CASE_CALL_USD, so the cap would not hold.
    expect(WORST_CASE_CALL_USD).toBeGreaterThan(0.05);
    await expect(run(classify, 0.05)).rejects.toThrow(/cap/i);
    expect(classify).not.toHaveBeenCalled();
  });

  it("counts charges logged but never recorded against the cap", async () => {
    const { classify } = fakeClassify();
    await expect(
      run(classify, 1, { unrecordedUsd: 1 - WORST_CASE_CALL_USD / 2 }),
    ).rejects.toThrow(/cap/i);
    expect(classify).not.toHaveBeenCalled();
  });

  it("aborts when the stored meta doesn't match the recomputed one", async () => {
    const { classify } = fakeClassify({ failOn: 2 });
    await expect(run(classify)).rejects.toThrow(/connection closed/);
    const meta = JSON.parse(await readFile(metaPath(), "utf-8"));
    await writeFile(
      metaPath(),
      JSON.stringify({ ...meta, category_ids: ["cat-1", "cat-2"] }),
    );
    const second = fakeClassify();
    await expect(run(second.classify)).rejects.toThrow(/meta/i);
    await writeFile(metaPath(), JSON.stringify({ ...meta, seed: "other" }));
    await expect(run(second.classify)).rejects.toThrow(/meta/i);
    expect(second.classify).not.toHaveBeenCalled();
  });

  it("aborts a resume when a category or track input changed, since A1 and A2 must be identical requests", async () => {
    const { classify } = fakeClassify({ failOn: 3 });
    await expect(run(classify)).rejects.toThrow(/connection closed/);
    const second = fakeClassify();
    const reworded = [
      { ...categories[0]!, description: "Reworded" },
      categories[1]!,
    ];
    await expect(
      run(second.classify, 1, { categories: reworded }),
    ).rejects.toThrow(/refusing to mix designs/);
    const regenred = {
      ...tracksById,
      t1: { ...tracksById.t1!, genres: ["rock"] },
    };
    await expect(
      run(second.classify, 1, { tracksById: regenred }),
    ).rejects.toThrow(/refusing to mix designs/);
    expect(second.classify).not.toHaveBeenCalled();
    // Unchanged inputs still resume.
    await expect(run(second.classify)).resolves.toMatchObject({
      batches_run: 6,
    });
  });

  it("refuses to resume run lines that have no meta", async () => {
    const { classify } = fakeClassify({ failOn: 2 });
    await expect(run(classify)).rejects.toThrow(/connection closed/);
    await rm(metaPath());
    const second = fakeClassify();
    await expect(run(second.classify)).rejects.toThrow(/meta/i);
    expect(second.classify).not.toHaveBeenCalled();
  });

  it("throws on a malformed line, naming its line number", async () => {
    const { classify } = fakeClassify({ failOn: 2 });
    await expect(run(classify)).rejects.toThrow(/connection closed/);
    const text = await readFile(outPath(), "utf-8");
    await writeFile(outPath(), text + '{"run":"A1"\n');
    await expect(readRunLines(outPath())).rejects.toThrow(/line 2/);
    const second = fakeClassify();
    await expect(run(second.classify)).rejects.toThrow(/line 2/);
    expect(second.classify).not.toHaveBeenCalled();
  });
});

describe("linesToRuns", () => {
  it("collects each run's answers by track id", async () => {
    const dropped = layouts.A[0]![0]!;
    const { classify } = fakeClassify({ drop: (id) => id === dropped });
    await run(classify);
    const runs = linesToRuns(await readRunLines(outPath()));
    expect(Object.keys(runs.A1).sort()).toEqual(
      ids.filter((id) => id !== dropped),
    );
    expect(Object.keys(runs.B).sort()).toEqual(
      ids.filter((id) => id !== dropped),
    );
    const kept = ids.find((id) => id !== dropped)!;
    expect(runs.C[kept]).toEqual([{ category_id: "cat-1", score: 70 }]);
    expect(runs.C[dropped]).toBeUndefined();
  });
});

describe("auditSpend", () => {
  const line = (started_at: string, at: string, cost_usd: number): RunLine => ({
    run: "A1",
    batch: 0,
    track_ids: [],
    assignments: [],
    missing: [],
    usage,
    cost_usd,
    started_at,
    at,
  });

  it("sums context-test log rows inside the run window against the lines", () => {
    const lines = [
      line("2026-09-19T10:00:00.000Z", "2026-09-19T10:00:30.000Z", 0.03),
      line("2026-09-19T10:01:00.000Z", "2026-09-19T10:01:30.000Z", 0.02),
    ];
    const rows = [
      {
        timestamp: "2026-09-19T10:00:29.000Z",
        phase: "context-test",
        cost_usd: 0.03,
      },
      {
        timestamp: "2026-09-19T10:01:29.000Z",
        phase: "context-test",
        cost_usd: 0.02,
      },
      // Charged but never recorded (a crash between the call and the append).
      {
        timestamp: "2026-09-19T10:00:45.000Z",
        phase: "context-test",
        cost_usd: 0.01,
      },
      {
        timestamp: "2026-09-19T10:00:40.000Z",
        phase: "classify",
        cost_usd: 0.5,
      },
      {
        timestamp: "2026-09-19T09:00:00.000Z",
        phase: "context-test",
        cost_usd: 0.5,
      },
    ];
    expect(
      auditSpend({
        lines,
        rows,
        from: "2026-09-19T10:00:00.000Z",
        to: "2026-09-19T10:01:30.000Z",
      }),
    ).toEqual({
      window: {
        from: "2026-09-19T10:00:00.000Z",
        to: "2026-09-19T10:01:30.000Z",
      },
      recorded_batches: 2,
      recorded_usd: expect.closeTo(0.05, 12),
      logged_calls: 3,
      logged_usd: expect.closeTo(0.06, 12),
      matches: false,
    });
  });

  // As context-report calls it: from the meta's created_at to report time.
  async function auditStudy(rows: LogRow[]) {
    const meta = (await readContextMeta(metaPath()))!;
    return auditSpend({
      lines: await readRunLines(outPath()),
      rows,
      from: meta.created_at,
      to: now().toISOString(),
    });
  }

  it("matches when every charged call was recorded", async () => {
    const rows: LogRow[] = [];
    await run(loggingClassify(rows));
    expect(await auditStudy(rows)).toMatchObject({
      recorded_batches: 8,
      logged_calls: 8,
      matches: true,
    });
  });

  it("flags a call charged but never recorded after the last line", async () => {
    const rows: LogRow[] = [];
    // The 8th (last) call is charged, then the process dies; nobody reruns.
    await expect(run(loggingClassify(rows, 8))).rejects.toThrow(/killed/);
    expect(await auditStudy(rows)).toMatchObject({
      recorded_batches: 7,
      logged_calls: 8,
      matches: false,
    });
  });

  it("flags a call charged but never recorded before the first line", async () => {
    const rows: LogRow[] = [];
    // A1 batch 0 is charged, then the process dies; the rerun resends it.
    await expect(run(loggingClassify(rows, 1))).rejects.toThrow(/killed/);
    await run(loggingClassify(rows));
    expect(await auditStudy(rows)).toMatchObject({
      recorded_batches: 8,
      logged_calls: 9,
      matches: false,
    });
  });

  it("matches with no lines and no calls", () => {
    const window = {
      from: "2026-09-19T10:00:00.000Z",
      to: "2026-09-19T11:00:00.000Z",
    };
    expect(auditSpend({ lines: [], rows: [], ...window })).toMatchObject({
      window,
      recorded_batches: 0,
      matches: true,
    });
  });
});

describe("classifyBatch logPhase", () => {
  it("logs the call under the phase it is given, so study spend stays separable", async () => {
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
                tracks: [{ n: 1, matches: [{ category: "Chill", score: 80 }] }],
              }),
            },
          ],
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          usage,
        }),
      ),
    );
    const r = await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks: [tracksById.t1!],
      logPhase: "context-test",
    });
    expect(r.assignments).toHaveLength(1);
    const [file] = await readdir(join(dir, "logs"));
    const line = JSON.parse(
      (await readFile(join(dir, "logs", file!), "utf-8")).trim(),
    );
    expect(line).toMatchObject({ phase: "context-test", batch_size: 1 });
  });
});
