// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildLabelState } from "@/src/lib/labeling/store";
import {
  TrackLabelInputSchema,
  type Suggestion,
} from "@/src/lib/labeling/schema";

// Suggestions exist because Michael asked for them on 2026-09-21, with the cost
// stated: a row labelled while the model's answer was on screen cannot serve as
// a blind label for the comparison against that same model. These tests pin the
// two things that keep the record honest — suggestions only appear when they are
// explicitly passed in, and every assisted row is stamped.

const CACHE = {
  tracks: {
    t1: { artist_id: "a1", title: "One", first_seen: "2026-01-01" },
    t2: { artist_id: "a1", title: "Two", first_seen: "2026-01-01" },
  },
  artists: { a1: { name: "Artist", genres: [] } },
  categories: {
    c1: { name: "Alpha" },
    c2: { name: "Beta" },
  },
} as never as Parameters<typeof buildLabelState>[0];

const BASE = {
  ...(CACHE as object),
  sample: {
    seed: "s",
    created_at: "2026-01-01T00:00:00.000Z",
    random_track_ids: ["t1"],
    pairs: [],
    relabel_track_ids: [],
  },
  gold: {
    seed: "g",
    created_at: "2026-01-01T00:00:00.000Z",
    pool: { no_genre: 1, already_sampled: 0, eligible: 1 },
    track_ids: ["t2"],
  },
  definitions: "## Alpha\nalpha def\n\n## Beta\nbeta def\n",
  definitionsSha: "sha",
  labels: [],
} as never as Parameters<typeof buildLabelState>[0];

describe("suggestions are opt-in", () => {
  it("omits them entirely when none are passed", () => {
    const state = buildLabelState(BASE);
    expect(state.random[0]!.suggestions).toBeUndefined();
    expect(state.gold[0]!.suggestions).toBeUndefined();
  });

  it("attaches them to both the random and the gold queues when passed", () => {
    const suggestions: Record<string, readonly Suggestion[]> = {
      t1: [{ category_id: "c1", score: 85 }],
      t2: [
        { category_id: "c2", score: 72 },
        { category_id: "c1", score: 61 },
      ],
    };
    const state = buildLabelState({ ...BASE, suggestions });
    expect(state.random[0]!.suggestions).toEqual([
      { category_id: "c1", score: 85 },
    ]);
    // order is preserved: the model's own ranking, best first
    expect(state.gold[0]!.suggestions?.map((s) => s.category_id)).toEqual([
      "c2",
      "c1",
    ]);
  });

  it("never invents a suggestion for a track that has none", () => {
    const state = buildLabelState({
      ...BASE,
      suggestions: { t1: [{ category_id: "c1", score: 85 }] },
    });
    expect(state.gold[0]!.suggestions).toBeUndefined();
  });
});

describe("the pairs queue stays blind", () => {
  it("never carries suggestions, even when every track has them", () => {
    const withPair = {
      ...BASE,
      sample: {
        ...(BASE as { sample: Record<string, unknown> }).sample,
        pairs: [{ pair_id: "p1", track_id: "t1", category_id: "c1" }],
      },
      suggestions: {
        t1: [{ category_id: "c1", score: 85 }],
        t2: [{ category_id: "c2", score: 72 }],
      },
    } as never as Parameters<typeof buildLabelState>[0];
    const state = buildLabelState(withPair);
    // the same track carries them in the track queue...
    expect(state.random[0]!.suggestions).toBeDefined();
    // ...and must not in the pairs queue, where the answer is yes/no against
    // one named category and a score would simply be the answer.
    expect(
      (state.pairs[0] as { suggestions?: unknown }).suggestions,
    ).toBeUndefined();
  });
});

describe("assisted stamp", () => {
  const row = {
    kind: "track" as const,
    track_id: "t1",
    pass: 1 as const,
    category_ids: ["c1"],
    cant_judge: false,
    elapsed_ms: 10,
    definitions_sha256: "sha",
    set: "gold" as const,
  };

  it("defaults to false so every existing row stays blind", () => {
    const parsed = TrackLabelInputSchema.parse(row);
    expect(parsed.assisted).toBe(false);
  });

  it("round-trips true", () => {
    const parsed = TrackLabelInputSchema.parse({ ...row, assisted: true });
    expect(parsed.assisted).toBe(true);
  });

  it("still rejects a cant_judge row that carries categories", () => {
    expect(() =>
      TrackLabelInputSchema.parse({
        ...row,
        cant_judge: true,
        assisted: true,
      }),
    ).toThrow();
  });
});
