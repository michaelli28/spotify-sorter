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

  it("skips a relabel whose 48h window has not opened", () => {
    // The run is sequential, so a locked item 403s and aborts everything after
    // it. All 30 relabels were refused this way on 2026-09-21.
    const now = 1_000_000
    const items = [
      { track_id: "open", done: false, opens_at: new Date(now - 1000).toISOString(),
        suggestions: [{ category_id: "c1" }] },
      { track_id: "locked", done: false, opens_at: new Date(now + 60_000).toISOString(),
        suggestions: [{ category_id: "c1" }] },
      { track_id: "never", done: false, opens_at: null,
        suggestions: [{ category_id: "c1" }] },
    ]
    const out = bulkAcceptInputs(items, ORDER, { ...OPTS, pass: 2, now })
    expect(out.map((r) => r.track_id)).toEqual(["open"])
  })

  it("ignores the window on queues that have none", () => {
    const out = bulkAcceptInputs(
      [{ track_id: "a", done: false, suggestions: [{ category_id: "c1" }] }],
      ORDER,
      { ...OPTS, now: 1_000_000 },
    )
    expect(out.map((r) => r.track_id)).toEqual(["a"])
  })

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
