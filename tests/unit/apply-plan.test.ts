import { describe, expect, it } from "vitest";
import { planApply, type ApplyCache } from "@/src/components/apply/plan";

const AT = "2026-09-01T00:00:00.000Z";

function category(name: string, playlistId: string | null = null) {
  return {
    name,
    description: "",
    spotify_playlist_id: playlistId,
    created_at: AT,
    example_track_ids: [],
  };
}

function track(title: string) {
  return { artist_id: "a1", title, first_seen: AT };
}

function assigned(...matches: Array<[string, number]>) {
  return {
    matches: matches.map(([category_id, score]) => ({ category_id, score })),
    classified_at: AT,
    override: null,
  };
}

function cache(over: Partial<ApplyCache> = {}): ApplyCache {
  return {
    config: {
      prefix: "✨",
      confidence_threshold: 65,
      anthropic_model: "m",
    },
    categories: { c1: category("Dusk"), c2: category("Rain") },
    tracks: { t1: track("One"), t2: track("Two"), t3: track("Three") },
    assignments: {
      t1: assigned(["c1", 90], ["c2", 80]),
      t2: assigned(["c2", 70]),
      t3: assigned(["c1", 70]),
    },
    ...over,
  };
}

describe("planApply", () => {
  // The old preview summed memberships: 12,194 "tracks" from a 3,172-track library.
  it("counts each track once, however many playlists it lands in", () => {
    const plan = planApply(cache());
    expect(plan.tracks).toBe(3);
    expect(plan.rows.map((r) => r.count)).toEqual([2, 2]);
  });

  it("keeps the order the write walks, and splits new from existing playlists", () => {
    const plan = planApply(
      cache({
        categories: {
          c2: category("Rain", "pl-2"),
          c1: category("Dusk"),
        },
      }),
    );
    expect(plan.rows.map((r) => r.name)).toEqual(["Rain", "Dusk"]);
    expect(plan.toCreate).toBe(1);
    expect(plan.toUpdate).toBe(1);
  });

  it("leaves out deleted categories and tracks no longer in the library", () => {
    const plan = planApply(
      cache({
        assignments: {
          t1: assigned(["c9", 90]),
          t2: assigned(["c2", 70]),
          t3: assigned(["c1", 70]),
          gone: assigned(["c1", 90]),
        },
      }),
    );
    expect(plan.rows.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(plan.rows.map((r) => r.count)).toEqual([1, 1]);
    expect(plan.tracks).toBe(2);
  });

  it("names playlists without the prefix", () => {
    const plan = planApply(
      cache({ categories: { c1: category("✨ Dusk"), c2: category("Rain") } }),
    );
    expect(plan.rows.map((r) => r.name)).toEqual(["Dusk", "Rain"]);
    expect(plan.prefix).toBe("✨");
  });

  it("counts the tracks that have no category yet", () => {
    const plan = planApply(
      cache({ tracks: { ...cache().tracks, t4: track("Four") } }),
    );
    expect(plan.unsorted).toBe(1);
    expect(planApply(cache()).unsorted).toBe(0);
  });
});
