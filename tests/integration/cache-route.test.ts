// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, PATCH } from "@/app/api/cache/route";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("cache route", () => {
  it("GET returns default cache shape on first run", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.prefix).toBe("✨");
  });

  it("PATCH updates scope and persists", async () => {
    const req = new Request("http://localhost/api/cache", {
      method: "PATCH",
      body: JSON.stringify({
        scope: {
          included_playlist_ids: ["p1"],
          excluded_playlist_ids: [],
          include_liked_songs: false,
        },
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const get = await GET();
    const body = await get.json();
    expect(body.scope.included_playlist_ids).toEqual(["p1"]);
    expect(body.scope.include_liked_songs).toBe(false);
  });
});
