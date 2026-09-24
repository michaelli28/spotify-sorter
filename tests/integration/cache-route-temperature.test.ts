// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, PATCH } from "@/app/api/cache/route";
import { buildCategoriesPatch } from "@/src/lib/categories/patch-body";
import {
  mergeCategories,
  type DraftCategory,
} from "@/src/lib/categories/merge";

// The review sheet's Colour picker saves through the same PATCH as every other
// edit. The override must persist, a rename must not drop it, and "Auto
// (guess)" must remove the key rather than store a null.

const NOW = "2026-09-23T00:00:00.000Z";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-temp-route-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const draft = (over: Partial<DraftCategory> = {}): DraftCategory => ({
  id: "c1",
  name: "Bedroom Pop",
  description: "soft",
  example_track_ids: ["t1"],
  ...over,
});

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/cache", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

async function saved(id = "c1"): Promise<Record<string, unknown>> {
  const body = await (await GET()).json();
  return body.categories[id];
}

describe("temperature through PATCH /api/cache", () => {
  it("persists an override posted by the editor", async () => {
    const res = await patch(
      buildCategoriesPatch({
        draft: [draft({ temperature: "dusk" })],
        saved: {},
        now: NOW,
      }),
    );
    expect(res.status).toBe(200);
    expect((await saved()).temperature).toBe("dusk");
  });

  it("keeps the override across a rename", async () => {
    await patch(
      buildCategoriesPatch({
        draft: [draft({ temperature: "dusk" })],
        saved: {},
        now: NOW,
      }),
    );
    await patch(
      buildCategoriesPatch({
        draft: [draft({ name: "Bedroom Pop Intimacy", temperature: "dusk" })],
        saved: {},
        now: NOW,
      }),
    );
    const c1 = await saved();
    expect(c1.name).toBe("Bedroom Pop Intimacy");
    expect(c1.temperature).toBe("dusk");
  });

  it("removes the key when the owner picks Auto (guess)", async () => {
    await patch(
      buildCategoriesPatch({
        draft: [draft({ temperature: "dusk" })],
        saved: {},
        now: NOW,
      }),
    );
    await patch(
      buildCategoriesPatch({ draft: [draft()], saved: {}, now: NOW }),
    );
    expect(await saved()).not.toHaveProperty("temperature");
    const raw = JSON.parse(await readFile(join(dir, "cache.json"), "utf-8"));
    expect(raw.categories.c1).not.toHaveProperty("temperature");
  });

  it("refuses an unknown value and leaves the stored override alone", async () => {
    await patch(
      buildCategoriesPatch({
        draft: [draft({ temperature: "glow" })],
        saved: {},
        now: NOW,
      }),
    );
    const body = buildCategoriesPatch({
      draft: [draft()],
      saved: {},
      now: NOW,
    });
    const bad = {
      ...body,
      categories: { c1: { ...body.categories.c1, temperature: "sunny" } },
    };
    const res = await patch(bad);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad body" });
    expect((await saved()).temperature).toBe("glow");
  });
});

describe("temperature in the editor's draft helpers", () => {
  it("buildCategoriesPatch omits the key when there is no override", () => {
    const body = buildCategoriesPatch({
      draft: [draft()],
      saved: {},
      now: NOW,
    });
    expect(body.categories.c1).not.toHaveProperty("temperature");
  });

  it("a merge keeps the target's override", () => {
    const merged = mergeCategories(
      [
        draft({ id: "a", temperature: "haze" }),
        draft({ id: "b", name: "Other", temperature: "charge" }),
      ],
      "b",
      "a",
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.temperature).toBe("haze");
  });
});
