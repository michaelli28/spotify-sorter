import { describe, expect, it } from "vitest";
import { unsortedTrackIds } from "@/src/lib/classification/unsorted";

const track = {
  artist_id: "a1",
  title: "Song",
  first_seen: "2026-01-01T00:00:00.000Z",
};
const assignment = {
  matches: [{ category_id: "c1", score: 80 }],
  classified_at: "2026-01-02T00:00:00.000Z",
  override: null,
};

describe("unsortedTrackIds", () => {
  it("lists the tracks that have no assignment, in cache order", () => {
    const ids = unsortedTrackIds({
      tracks: { t3: track, t1: track, t2: track },
      assignments: { t1: assignment },
    });
    expect(ids).toEqual(["t3", "t2"]);
  });

  it("is empty when every track is sorted", () => {
    expect(
      unsortedTrackIds({
        tracks: { t1: track },
        assignments: { t1: assignment },
      }),
    ).toEqual([]);
  });

  // The count comes from tracks, like src/lib/pipeline/classify.ts, so an
  // assignment for a track that has left the library can't hide a real one.
  it("ignores assignments for tracks that are no longer in the library", () => {
    const ids = unsortedTrackIds({
      tracks: { t1: track, t2: track },
      assignments: { gone1: assignment, gone2: assignment, t1: assignment },
    });
    expect(ids).toEqual(["t2"]);
  });

  it("is empty for an empty library", () => {
    expect(unsortedTrackIds({ tracks: {}, assignments: {} })).toEqual([]);
  });
});
