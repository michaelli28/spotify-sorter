import { describe, expect, it } from "vitest";
import { buildCategoriesPatch } from "@/src/lib/categories/patch-body";

// A deleted category used to survive: the cache route merges the posted map
// into the stored one, so removals were the only edit that silently did
// nothing. It came back on reload, and /apply still made a playlist for it.

const NOW = "2026-09-23T00:00:00.000Z";
const cat = (id: string, name: string) => ({
  id,
  name,
  description: `${name} desc`,
  example_track_ids: [`${id}-t1`],
});

describe("buildCategoriesPatch", () => {
  it("clears the stored map so a removed category cannot survive the merge", () => {
    const body = buildCategoriesPatch([cat("c1", "Dream Pop")], NOW);
    expect(body._clear).toEqual(["categories"]);
  });

  it("posts exactly the categories on screen", () => {
    const body = buildCategoriesPatch(
      [cat("c1", "Dream Pop"), cat("c3", "Trance")],
      NOW,
    );
    expect(Object.keys(body.categories)).toEqual(["c1", "c3"]);
    expect(body.categories.c1).toEqual({
      name: "Dream Pop",
      description: "Dream Pop desc",
      spotify_playlist_id: null,
      created_at: NOW,
      example_track_ids: ["c1-t1"],
    });
  });

  it("clears only categories — assignments must survive", () => {
    const body = buildCategoriesPatch([cat("c1", "Dream Pop")], NOW);
    expect(body._clear).not.toContain("assignments");
    expect(body).not.toHaveProperty("assignments");
  });
});
