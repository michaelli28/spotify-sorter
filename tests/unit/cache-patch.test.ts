import { describe, it, expect } from "vitest";
import { patchCache } from "@/src/lib/cache/patch";
import { defaultCache } from "@/src/lib/cache/read";

describe("patchCache", () => {
  it("returns a new object (no mutation of input)", () => {
    const before = defaultCache();
    const after = patchCache(before, { config: { prefix: "⭐" } });
    expect(before.config.prefix).toBe("✨");
    expect(after.config.prefix).toBe("⭐");
    expect(after).not.toBe(before);
  });

  it("preserves untouched keys", () => {
    const before = defaultCache();
    const after = patchCache(before, { config: { prefix: "⭐" } });
    expect(after.config.confidence_threshold).toBe(65);
  });

  it("replaces records by key (does not deep-merge entries)", () => {
    const before = patchCache(defaultCache(), {
      tracks: {
        t1: {
          artist_id: "a1",
          title: "A",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    });
    const after = patchCache(before, {
      tracks: {
        t2: {
          artist_id: "a2",
          title: "B",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    });
    expect(Object.keys(after.tracks).sort()).toEqual(["t1", "t2"]);
  });
});
