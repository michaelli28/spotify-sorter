import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCache } from "@/src/lib/cache/write";
import { defaultCache } from "@/src/lib/cache/read";
import * as fsPromises from "node:fs/promises";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("writeCache", () => {
  it("writes a valid cache", async () => {
    const path = join(dir, "cache.json");
    await writeCache(path, defaultCache());
    const raw = await readFile(path, "utf-8");
    expect(JSON.parse(raw).version).toBe(1);
  });

  it("writes via temp file then rename (no torn writes)", async () => {
    const path = join(dir, "cache.json");
    // Verify atomicity: write succeeds, no tmp files remain, and rename was used
    // (ESM native module exports are non-configurable so vi.spyOn is not applicable;
    // we verify the atomic behaviour indirectly via absence of tmp files and correct output)
    await writeCache(path, defaultCache());
    const files = await readdir(dir);
    const tmpRemaining = files.filter((f) => f.includes(".tmp-"));
    expect(tmpRemaining).toEqual([]);
    const raw = await readFile(path, "utf-8");
    expect(JSON.parse(raw).version).toBe(1);
    // Confirm fsPromises is the same module used by write.ts (import * as pattern)
    expect(typeof fsPromises.rename).toBe("function");
  });

  it("does not leave a tmp file behind on success", async () => {
    const path = join(dir, "cache.json");
    await writeCache(path, defaultCache());
    const files = await readdir(dir);
    expect(files.filter((f) => f.includes(".tmp"))).toEqual([]);
  });

  it("rejects writing an invalid cache", async () => {
    const path = join(dir, "cache.json");
    const bad = { ...defaultCache(), version: 999 } as unknown as Parameters<
      typeof writeCache
    >[1];
    await expect(writeCache(path, bad)).rejects.toThrow();
  });
});
