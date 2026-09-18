// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { dataDir, envFile } from "@/src/lib/config/paths";
import { ensureFreshToken } from "@/src/lib/spotify/client";

function withoutEnv(key: string, fn: () => Promise<void> | void) {
  const saved = process.env[key];
  delete process.env[key];
  return Promise.resolve(fn()).finally(() => {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  });
}

describe("test hygiene", () => {
  it("gives every test a temp data dir outside the repo", () => {
    const dir = process.env.SORTER_DATA_DIR;
    expect(dir).toBeTruthy();
    expect(resolve(dir!).startsWith(resolve(process.cwd()))).toBe(false);
  });

  it("refuses to fall back to ./data under test", () =>
    withoutEnv("SORTER_DATA_DIR", () => {
      expect(() => dataDir()).toThrow(/SORTER_DATA_DIR/);
    }));

  it("refuses to fall back to ./.env.local under test", () =>
    withoutEnv("SORTER_ENV_FILE", () => {
      expect(() => envFile()).toThrow(/SORTER_ENV_FILE/);
    }));

  it("ensureFreshToken cannot read or rewrite ./data under test", () =>
    withoutEnv("SORTER_DATA_DIR", async () => {
      await expect(ensureFreshToken(undefined)).rejects.toThrow(
        /SORTER_DATA_DIR/,
      );
    }));

  it("blocks real network calls", async () => {
    await expect(fetch("https://api.spotify.com/v1/me")).rejects.toThrow(
      /network blocked/i,
    );
    await expect(
      fetch("https://api.anthropic.com/v1/messages", { method: "POST" }),
    ).rejects.toThrow(/network blocked/i);
  });
});
