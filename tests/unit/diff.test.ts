import { describe, it, expect } from "vitest";
import { diffTracks } from "@/src/lib/classification/diff";

describe("diffTracks", () => {
  it("classifies into new / removed / unchanged", () => {
    expect(diffTracks(["t1", "t2", "t3"], ["t2", "t3", "t4"])).toEqual({
      added: ["t4"],
      removed: ["t1"],
      unchanged: ["t2", "t3"],
    });
  });

  it("first run: all current are added", () => {
    expect(diffTracks([], ["t1", "t2"])).toEqual({
      added: ["t1", "t2"],
      removed: [],
      unchanged: [],
    });
  });

  it("handles empty current (full library deletion)", () => {
    expect(diffTracks(["t1"], [])).toEqual({
      added: [],
      removed: ["t1"],
      unchanged: [],
    });
  });
});
