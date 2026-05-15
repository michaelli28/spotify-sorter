import { describe, it, expect } from "vitest";
import { dedupeTracks } from "@/src/lib/spotify/dedupe";
import type { NormalizedTrack } from "@/src/lib/spotify/tracks";

const t = (id: string, artist = "a1"): NormalizedTrack => ({
  id,
  title: id,
  artist_id: artist,
  artist_name: "A",
});

describe("dedupeTracks", () => {
  it("returns one entry per unique id", () => {
    const result = dedupeTracks([t("1"), t("2"), t("1")]);
    expect(result.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });
  it("preserves first-seen order across input", () => {
    const result = dedupeTracks([t("a"), t("b"), t("c"), t("a")]);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("empty input returns empty array", () => {
    expect(dedupeTracks([])).toEqual([]);
  });
});
