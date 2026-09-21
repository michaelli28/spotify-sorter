// @vitest-environment node
import { describe, it, expect } from "vitest";
import { bulkAcceptInputs } from "@/src/components/label/logic";

const ORDER = ["c1", "c2", "c3"];
const OPTS = {
  pass: 1 as const,
  set: "gold" as const,
  definitions_sha256: "sha",
  elapsed_ms: 0,
};

describe("bulkAcceptInputs", () => {
  it("skips songs that are already labeled", () => {
    const out = bulkAcceptInputs(
      [
        { track_id: "a", done: true, suggestions: [{ category_id: "c1" }] },
        { track_id: "b", done: false, suggestions: [{ category_id: "c2" }] },
      ],
      ORDER,
      OPTS,
    );
    expect(out.map((r) => r.track_id)).toEqual(["b"]);
  });

  it("skips songs with no suggestions rather than saving an empty set", () => {
    // An empty tick set means "fits none" — a real answer, and not one that
    // accepting a suggestion can ever produce.
    const out = bulkAcceptInputs(
      [
        { track_id: "a", done: false },
        { track_id: "b", done: false, suggestions: [] },
      ],
      ORDER,
      OPTS,
    );
    expect(out).toEqual([]);
  });

  it("writes categories in cache order, not suggestion order", () => {
    const out = bulkAcceptInputs(
      [
        {
          track_id: "a",
          done: false,
          suggestions: [{ category_id: "c3" }, { category_id: "c1" }],
        },
      ],
      ORDER,
      OPTS,
    );
    expect(out[0]!.category_ids).toEqual(["c1", "c3"]);
  });

  it("marks every row assisted, because every row is a copy of the model", () => {
    const out = bulkAcceptInputs(
      [{ track_id: "a", done: false, suggestions: [{ category_id: "c1" }] }],
      ORDER,
      OPTS,
    );
    expect(out[0]!.assisted).toBe(true);
    expect(out[0]!.cant_judge).toBe(false);
  });

  it("drops a suggested category that is no longer in the cache", () => {
    const out = bulkAcceptInputs(
      [
        {
          track_id: "a",
          done: false,
          suggestions: [{ category_id: "c1" }, { category_id: "gone" }],
        },
      ],
      ORDER,
      OPTS,
    );
    expect(out[0]!.category_ids).toEqual(["c1"]);
  });
});
