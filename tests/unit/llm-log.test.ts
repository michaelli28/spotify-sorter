import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logLLMCall } from "@/src/lib/llm/log";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("logLLMCall", () => {
  it("appends one JSONL line per call", async () => {
    await logLLMCall({
      model: "claude-haiku-4-5-20251001",
      phase: "propose",
      input_tokens: 100,
      output_tokens: 50,
      latency_ms: 1234,
      retries: 0,
      batch_size: null,
      cost_usd: 0.001,
    });
    await logLLMCall({
      model: "claude-haiku-4-5-20251001",
      phase: "classify",
      input_tokens: 200,
      output_tokens: 100,
      latency_ms: 567,
      retries: 1,
      batch_size: 50,
      cost_usd: 0.003,
    });
    const files = await readdir(join(dir, "logs"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^llm-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const content = await readFile(join(dir, "logs", files[0]!), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).phase).toBe("propose");
    expect(JSON.parse(lines[1]!).batch_size).toBe(50);
  });
});
