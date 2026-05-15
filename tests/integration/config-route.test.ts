// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "@/app/api/config/route";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SORTER_ENV_FILE = join(dir, ".env.local");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
  delete process.env.SORTER_ENV_FILE;
});

describe("POST /api/config", () => {
  it("writes secrets to env file and prefix to cache", async () => {
    const req = new Request("http://localhost/api/config", {
      method: "POST",
      body: JSON.stringify({
        spotify_client_id: "a".repeat(32),
        anthropic_api_key: "sk-ant-test",
        prefix: "★",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const env = await readFile(join(dir, ".env.local"), "utf-8");
    expect(env).toContain("SPOTIFY_CLIENT_ID=");
    expect(env).toContain("ANTHROPIC_API_KEY=sk-ant-test");
    const cache = JSON.parse(await readFile(join(dir, "cache.json"), "utf-8"));
    expect(cache.config.prefix).toBe("★");
  });

  it("rejects bad payload with 400", async () => {
    const req = new Request("http://localhost/api/config", {
      method: "POST",
      body: JSON.stringify({ spotify_client_id: "short" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
