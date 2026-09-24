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
    const body = buildCategoriesPatch({
      draft: [cat("c1", "Dream Pop")],
      saved: {},
      now: NOW,
    });
    expect(body._clear).toEqual(["categories"]);
  });

  it("posts exactly the categories on screen", () => {
    const body = buildCategoriesPatch({
      draft: [cat("c1", "Dream Pop"), cat("c3", "Trance")],
      saved: {},
      now: NOW,
    });
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
    const body = buildCategoriesPatch({
      draft: [cat("c1", "Dream Pop")],
      saved: {},
      now: NOW,
    });
    expect(body._clear).not.toContain("assignments");
    expect(body).not.toHaveProperty("assignments");
  });

  // Every save used to null every link, so a save with no edits made home say
  // "None on Spotify yet" while all the playlists were still there.
  it("keeps the playlist a category is linked to while its name is unchanged", () => {
    const body = buildCategoriesPatch({
      draft: [cat("c1", "Dream Pop")],
      saved: { c1: { name: "Dream Pop", spotify_playlist_id: "pl_dream" } },
      now: NOW,
    });
    expect(body.categories.c1!.spotify_playlist_id).toBe("pl_dream");
  });

  // Apply never renames a Spotify playlist, so a kept link would leave the
  // old name on Spotify. Unlinked, Apply looks the new name up instead.
  it("unlinks a renamed category", () => {
    const body = buildCategoriesPatch({
      draft: [cat("c1", "Shoegaze")],
      saved: { c1: { name: "Dream Pop", spotify_playlist_id: "pl_dream" } },
      now: NOW,
    });
    expect(body.categories.c1!.spotify_playlist_id).toBeNull();
  });
});
