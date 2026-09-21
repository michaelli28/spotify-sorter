// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildLabelState } from "@/src/lib/labeling/store";
import { bulkAcceptPairInputs } from "@/src/components/label/logic";
import { PairLabelInputSchema } from "@/src/lib/labeling/schema";

// Pair suggestions exist because Michael asked for them on 2026-09-21, the same
// day and for the same reason as the track ones. The cost here is different and
// larger: the pairs sample was stratified across pre-registered SCORE BINS to
// measure calibration, so answering from the score on screen makes the
// calibration curve a readback of that score. These tests pin the mechanics and
// the `assisted` stamp that lets the analysis see it.

const CACHE = {
  tracks: { t1: { artist_id: "a1", title: "One", first_seen: "2026-01-01" } },
  artists: { a1: { name: "Artist", genres: [] } },
  categories: { c1: { name: "Alpha" }, c2: { name: "Beta" } },
};

const BASE = {
  ...CACHE,
  sample: {
    seed: "s",
    created_at: "2026-01-01T00:00:00.000Z",
    random_track_ids: [],
    pairs: [
      { pair_id: "p1", track_id: "t1", category_id: "c1" },
      { pair_id: "p2", track_id: "t1", category_id: "c2" },
    ],
    relabel_track_ids: [],
  },
  definitions: "## Alpha\nalpha def\n\n## Beta\nbeta def\n",
  definitionsSha: "sha",
  labels: [],
} as never as Parameters<typeof buildLabelState>[0];

describe("pair suggestions are opt-in", () => {
  it("omits them when none are passed", () => {
    const state = buildLabelState(BASE);
    expect(state.pairs[0]!.suggestion).toBeUndefined();
  });

  it("attaches them per pair_id when passed", () => {
    const state = buildLabelState({
      ...BASE,
      pairSuggestions: {
        p1: { score: 85, verdict: "yes" },
        p2: { score: null, verdict: "no" },
      },
    });
    expect(state.pairs[0]!.suggestion).toEqual({ score: 85, verdict: "yes" });
    // null score = the model never ranked this category for this track, which
    // is itself an implicit "no".
    expect(state.pairs[1]!.suggestion).toEqual({ score: null, verdict: "no" });
  });

  it("still never carries the track-style suggestions list", () => {
    const state = buildLabelState({
      ...BASE,
      suggestions: { t1: [{ category_id: "c1", score: 85 }] },
      pairSuggestions: { p1: { score: 85, verdict: "yes" } },
    });
    expect(
      (state.pairs[0] as { suggestions?: unknown }).suggestions,
    ).toBeUndefined();
  });
});

describe("bulkAcceptPairInputs", () => {
  const OPTS = { definitions_sha256: "sha", elapsed_ms: 0 };

  it("skips answered pairs and pairs with no suggestion", () => {
    const out = bulkAcceptPairInputs(
      [
        {
          pair_id: "p1",
          done: true,
          suggestion: { score: 85, verdict: "yes" as const },
        },
        {
          pair_id: "p2",
          done: false,
          suggestion: { score: 40, verdict: "no" as const },
        },
        { pair_id: "p3", done: false },
      ],
      OPTS,
    );
    expect(out.map((r) => r.pair_id)).toEqual(["p2"]);
    expect(out[0]!.answer).toBe("no");
  });

  it("carries the model's verdict and marks every row assisted", () => {
    const out = bulkAcceptPairInputs(
      [
        {
          pair_id: "p1",
          done: false,
          suggestion: { score: 85, verdict: "yes" as const },
        },
      ],
      OPTS,
    );
    expect(out[0]).toMatchObject({
      kind: "pair",
      pair_id: "p1",
      answer: "yes",
      assisted: true,
    });
  });

  it("never answers cant_judge, which is a human-only answer", () => {
    const out = bulkAcceptPairInputs(
      [
        {
          pair_id: "p1",
          done: false,
          suggestion: { score: 0, verdict: "no" as const },
        },
      ],
      OPTS,
    );
    // The union is "yes" | "no": cant_judge is unrepresentable here, which is a
    // stronger guarantee than a runtime check could give.
    expect(out.map((r) => r.answer)).toEqual(["no"]);
  });
});

describe("pair assisted stamp", () => {
  const row = {
    kind: "pair" as const,
    pair_id: "p1",
    answer: "yes" as const,
    elapsed_ms: 10,
    definitions_sha256: "sha",
  };

  it("defaults false so every pair row written before today stays blind", () => {
    expect(PairLabelInputSchema.parse(row).assisted).toBe(false);
  });

  it("round-trips true", () => {
    expect(
      PairLabelInputSchema.parse({ ...row, assisted: true }).assisted,
    ).toBe(true);
  });
});
