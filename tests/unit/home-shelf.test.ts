import { describe, expect, it } from "vitest";
import { buildShelf, type ShelfCache } from "@/src/components/home/shelf";
import { catalogueSpecs } from "@/src/lib/sleeves/spec";

const ISO = "2026-09-01T00:00:00.000Z";
// Real track ids are 22 base-62 characters; the records carry them to <AlbumArt>.
const id = (n: number) => `track${String(n).padStart(17, "0")}`;
const track = (title: string, artist = "a1") => ({
  artist_id: artist,
  title,
  first_seen: ISO,
});
const category = (
  name: string,
  extra: Partial<ShelfCache["categories"][string]> = {},
) => ({
  name,
  description: "",
  spotify_playlist_id: null,
  created_at: ISO,
  example_track_ids: [],
  ...extra,
});
const assigned = (...ids: string[]) => ({
  matches: ids.map((category_id, i) => ({ category_id, score: 90 - i * 30 })),
  classified_at: ISO,
  override: null,
});

function cache(over: Partial<ShelfCache> = {}): ShelfCache {
  return {
    config: {
      prefix: "✨",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    artists: { a1: { name: "Current Blue", genres: [] } },
    tracks: {},
    categories: {},
    assignments: {},
    ...over,
  };
}

describe("buildShelf: the crate's dividers", () => {
  it("stands the categories largest first, numbered in catalogue order", () => {
    const shelf = buildShelf(
      cache({
        categories: {
          c1: category("Emo Rap Heartbreak"),
          c2: category("Bedroom Pop Intimacy"),
          c3: category("Stutter House"),
        },
      }),
      { c1: 618, c2: 1442, c3: 14 },
      new Set(),
    );
    expect(shelf.entries.map((e) => [e.catalogueNo, e.name, e.count])).toEqual([
      [2, "Bedroom Pop Intimacy", 1442],
      [1, "Emo Rap Heartbreak", 618],
      [3, "Stutter House", 14],
    ]);
    expect(shelf.adds).toBe(2074);
    expect(shelf.threshold).toBe(65);
  });

  it("stands every category, in catalogue order, when nothing is placed yet", () => {
    const shelf = buildShelf(
      cache({ categories: { c1: category("Rain"), c2: category("Night") } }),
      { c1: 0, c2: 0 },
      new Set(),
    );
    expect(shelf.entries.map((e) => e.id)).toEqual(["c1", "c2"]);
    expect(shelf.adds).toBe(0);
  });

  it("leaves out a category that holds no tracks once others do", () => {
    const shelf = buildShelf(
      cache({
        categories: { c1: category("Rain"), c2: category("Just added") },
      }),
      { c1: 3, c2: 0 },
      new Set(),
    );
    expect(shelf.entries.map((e) => e.id)).toEqual(["c1"]);
  });

  // Apply makes a playlist for every category, an empty one included
  // (src/lib/pipeline/apply.ts), so the count isn't the crate's.
  it("counts a playlist for every category, even one with no tracks", () => {
    const shelf = buildShelf(
      cache({
        categories: { c1: category("Rain"), c2: category("Just added") },
      }),
      { c1: 3, c2: 0 },
      new Set(),
    );
    expect(shelf.playlists).toBe(2);
  });

  it("prints each sleeve in the whole catalogue's context, with the owner's colour", () => {
    const categories = {
      c1: category("Rain", { temperature: "charge" as const }),
      c2: category("Just added"),
      c3: category("Dream Pop Ethereal"),
    };
    const shelf = buildShelf(
      cache({ categories }),
      { c1: 5, c2: 0, c3: 2 },
      new Set(),
    );
    const specs = catalogueSpecs(
      Object.entries(categories).map(([id, c]) => ({ id, ...c })),
    );
    for (const e of shelf.entries) expect(e.spec).toEqual(specs.get(e.id));
    expect(shelf.entries.find((e) => e.id === "c1")?.temperature).toBe(
      "charge",
    );
    expect(shelf.entries.find((e) => e.id === "c3")?.temperature).toBe("haze");
  });

  it("marks the categories already on Spotify", () => {
    const shelf = buildShelf(
      cache({
        categories: {
          c1: category("Rain", { spotify_playlist_id: "sp1" }),
          c2: category("Night"),
        },
      }),
      { c1: 1, c2: 1 },
      new Set(),
    );
    expect(
      Object.fromEntries(shelf.entries.map((e) => [e.id, e.onSpotify])),
    ).toEqual({ c1: true, c2: false });
  });
});

describe("buildShelf: the records under the crate", () => {
  const tracks = {
    [id(1)]: track("drive"),
    [id(2)]: track("the perfect pair", "a2"),
    [id(3)]: track("forever&more"),
    [id(4)]: track("fourth"),
  };
  const examples = [id(9), id(1), id(2), id(3), id(4)];

  it("takes the first three example tracks still in the library, with artists", () => {
    const shelf = buildShelf(
      cache({
        tracks,
        artists: {
          a1: { name: "Current Blue", genres: [] },
          a2: { name: "beabadoobee", genres: [] },
        },
        categories: { c1: category("Rain", { example_track_ids: examples }) },
      }),
      { c1: 4 },
      new Set(),
    );
    expect(shelf.entries[0]?.records).toEqual([
      { id: id(1), title: "drive", artist: "Current Blue" },
      { id: id(2), title: "the perfect pair", artist: "beabadoobee" },
      { id: id(3), title: "forever&more", artist: "Current Blue" },
    ]);
  });

  it("never shows a song from the labelling sample", () => {
    const shelf = buildShelf(
      cache({
        tracks,
        categories: { c1: category("Rain", { example_track_ids: examples }) },
      }),
      { c1: 4 },
      new Set([id(1), id(3)]),
    );
    expect(shelf.entries[0]?.records.map((r) => r.id)).toEqual([id(2), id(4)]);
  });

  it("shows no records at all when the sample couldn't be read", () => {
    const shelf = buildShelf(
      cache({
        tracks,
        categories: { c1: category("Rain", { example_track_ids: examples }) },
      }),
      { c1: 4 },
      null,
    );
    expect(shelf.entries[0]?.records).toEqual([]);
  });
});

describe("buildShelf: tracks that fit none", () => {
  it("counts sorted tracks whose every category is gone, and nothing else", () => {
    const shelf = buildShelf(
      cache({
        tracks: {
          [id(1)]: track("kept"),
          [id(2)]: track("orphaned"),
          [id(3)]: track("half-orphaned"),
          [id(4)]: track("unsorted"),
        },
        categories: { c1: category("Rain") },
        assignments: {
          [id(1)]: assigned("c1"),
          [id(2)]: assigned("gone"),
          // Its top match is gone, but it still passes the cutoff for c1.
          [id(3)]: {
            matches: [
              { category_id: "gone", score: 90 },
              { category_id: "c1", score: 70 },
            ],
            classified_at: ISO,
            override: null,
          },
        },
      }),
      { c1: 2 },
      new Set(),
    );
    expect(shelf.fitNone).toBe(1);
  });
});
