// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PATCH, GET } from "@/app/api/cache/route";
import { buildCategoriesPatch } from "@/src/lib/categories/patch-body";

// Deleting a category on /review was the one edit that silently did nothing:
// the route merges the posted map into the stored one, so renames and
// additions landed and removals did not. The category came back on reload and
// /apply would still have created a playlist for it.

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-cache-"));
  process.env.SORTER_DATA_DIR = dir;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "cache.json"), JSON.stringify(seedCache()));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const T0 = "2026-09-01T10:00:00.000Z";
const NOW = "2026-09-23T00:00:00.000Z";

function category(name: string) {
  return {
    name,
    description: `${name} description`,
    spotify_playlist_id: null,
    created_at: T0,
    example_track_ids: [],
  };
}

function seedCache() {
  return {
    version: 2,
    auth: null,
    config: {
      prefix: "x",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    artists: { ar_1: { name: "Artist One", genres: [] } },
    tracks: { t_a: { artist_id: "ar_1", title: "Alpha", first_seen: T0 } },
    categories: {
      c_keep: category("Keep Me"),
      c_drop: category("Drop Me"),
      c_also: category("Also Keep"),
    },
    assignments: {
      t_a: {
        matches: [{ category_id: "c_keep", score: 90 }],
        classified_at: T0,
        override: null,
      },
    },
    runs: [],
    playlist_snapshots: {},
    liked_songs_fingerprint: null,
  };
}

const draft = (ids: string[]) =>
  ids.map((id) => ({
    id,
    name: id === "c_keep" ? "Keep Me" : "Also Keep",
    description: "d",
    example_track_ids: [],
  }));

function patchRequest(body: unknown) {
  return new Request("http://127.0.0.1:3000/api/cache", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function storedCategories(): Promise<string[]> {
  const res = await GET();
  const cache = (await res.json()) as {
    categories: Record<string, unknown>;
  };
  return Object.keys(cache.categories).sort();
}

describe("saving the edited category list", () => {
  it("drops a category the editor removed", async () => {
    const res = await PATCH(
      patchRequest(buildCategoriesPatch(draft(["c_keep", "c_also"]), NOW)),
    );
    expect(res.status).toBe(200);
    expect(await storedCategories()).toEqual(["c_also", "c_keep"]);
  });

  it("keeps every assignment — only categories are replaced", async () => {
    await PATCH(
      patchRequest(buildCategoriesPatch(draft(["c_keep", "c_also"]), NOW)),
    );
    const cache = (await (await GET()).json()) as {
      assignments: Record<string, { matches: unknown[] }>;
    };
    expect(Object.keys(cache.assignments)).toEqual(["t_a"]);
    expect(cache.assignments.t_a!.matches).toHaveLength(1);
  });

  it("still renames, so the whole-map replace did not cost the merge", async () => {
    const renamed = [
      {
        id: "c_keep",
        name: "Renamed",
        description: "d",
        example_track_ids: [],
      },
    ];
    await PATCH(patchRequest(buildCategoriesPatch(renamed, NOW)));
    const cache = (await (await GET()).json()) as {
      categories: Record<string, { name: string }>;
    };
    expect(cache.categories.c_keep!.name).toBe("Renamed");
  });
});
