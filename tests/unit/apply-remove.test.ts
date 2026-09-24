import { describe, expect, it } from "vitest";
import { needsReconnect } from "@/src/components/apply/refusal";
import {
  failedLine,
  groupManaged,
  readManaged,
  readRemoval,
  removeLabel,
  removedLine,
  type ManagedPlaylist,
} from "@/src/components/apply/remove";

// GET /api/spotify/managed-playlists rows, as the server sends them.
const row = (
  id: string,
  name: string,
  source: "recorded" | "prefix" = "recorded",
) => ({ id, name, tracks: 3, source });

const kept = (
  id: string,
  name: string,
  source: "recorded" | "prefix" = "recorded",
): ManagedPlaylist => ({ id, name, source });

describe("needsReconnect (the cover route's contract, spec §7.2)", () => {
  it("is true for a missing scope and a revoked token", () => {
    expect(needsReconnect(403, { error: "missing_scope" })).toBe(true);
    expect(needsReconnect(401, { error: "reconnect" })).toBe(true);
  });

  it("is false for anything a retry might fix", () => {
    expect(needsReconnect(403, { error: "cross_site" })).toBe(false);
    expect(needsReconnect(403, null)).toBe(false);
    expect(needsReconnect(401, { error: "missing_scope" })).toBe(false);
    expect(needsReconnect(502, { error: "upstream" })).toBe(false);
    expect(needsReconnect(400, "reconnect")).toBe(false);
  });
});

describe("readManaged", () => {
  it("reads the playlists in the server's order", () => {
    expect(
      readManaged(200, {
        playlists: [row("a", "✨ Rain"), row("b", "✨ Old", "prefix")],
      }),
    ).toEqual({
      kind: "list",
      playlists: [kept("a", "✨ Rain"), kept("b", "✨ Old", "prefix")],
    });
  });

  it("says there are none", () => {
    expect(readManaged(200, { playlists: [] })).toEqual({ kind: "empty" });
  });

  it("asks for a reconnect when only that can help", () => {
    expect(readManaged(403, { error: "missing_scope" })).toEqual({
      kind: "reconnect",
    });
    expect(readManaged(401, { error: "reconnect" })).toEqual({
      kind: "reconnect",
    });
  });

  it("says Apply is still writing when the server refuses for that", () => {
    expect(readManaged(409, { error: "apply_running" })).toEqual({
      kind: "applying",
    });
  });

  it("fails on any other answer", () => {
    const failed = { kind: "failed", step: "read" };
    expect(readManaged(502, { error: "upstream" })).toEqual(failed);
    expect(readManaged(409, { error: "cache_version_mismatch" })).toEqual(
      failed,
    );
    expect(readManaged(200, null)).toEqual(failed);
    expect(readManaged(200, { playlists: [{ id: "a" }] })).toEqual(failed);
    expect(
      readManaged(200, { playlists: [row("a", "x", "mine" as "prefix")] }),
    ).toEqual(failed);
  });
});

describe("readRemoval", () => {
  const asked = [
    kept("a", "✨ Rain"),
    kept("b", "✨ Dusk"),
    kept("c", "✨ Old", "prefix"),
  ];

  it("counts the ids it removed", () => {
    expect(
      readRemoval(200, { removed: ["a", "b", "c"], failed: [] }, asked),
    ).toEqual({ kind: "removed", count: 3, failed: [] });
  });

  it("names the playlists that failed", () => {
    expect(
      readRemoval(
        200,
        {
          removed: ["a"],
          failed: [
            { id: "b", reason: "http_500" },
            { id: "c", reason: "http_500" },
          ],
        },
        asked,
      ),
    ).toEqual({
      kind: "removed",
      count: 1,
      failed: [
        { id: "b", name: "✨ Dusk" },
        { id: "c", name: "✨ Old" },
      ],
    });
  });

  it("keeps a failed id it never asked about, by its id", () => {
    expect(
      readRemoval(200, { removed: [], failed: [{ id: "zz" }] }, asked),
    ).toEqual({
      kind: "removed",
      count: 0,
      failed: [{ id: "zz", name: "zz" }],
    });
  });

  it("asks for a reconnect when only that can help", () => {
    expect(readRemoval(403, { error: "missing_scope" }, asked)).toEqual({
      kind: "reconnect",
    });
    expect(readRemoval(401, { error: "reconnect" }, asked)).toEqual({
      kind: "reconnect",
    });
  });

  it("says Apply is still writing when the server refuses for that", () => {
    expect(readRemoval(409, { error: "apply_running" }, asked)).toEqual({
      kind: "applying",
    });
  });

  // 400: an id left the candidate set since the list loaded.
  it("fails on any other answer", () => {
    const failed = { kind: "failed", step: "remove" };
    expect(readRemoval(400, { error: "bad_ids" }, asked)).toEqual(failed);
    expect(readRemoval(502, null, asked)).toEqual(failed);
    expect(readRemoval(200, { removed: 3, failed: [] }, asked)).toEqual(failed);
    expect(readRemoval(200, { removed: ["a"] }, asked)).toEqual(failed);
  });
});

describe("groupManaged", () => {
  it("splits made-here from prefix-only, keeping the order", () => {
    const a = kept("a", "✨ Rain");
    const b = kept("b", "✨ Old", "prefix");
    const c = kept("c", "✨ Dusk");
    expect(groupManaged([a, b, c])).toEqual({ recorded: [a, c], prefix: [b] });
  });
});

describe("the lines", () => {
  it("counts what went", () => {
    expect(removedLine(1)).toBe("1 playlist removed.");
    expect(removedLine(43)).toBe("43 playlists removed.");
    expect(removedLine(1200)).toBe("1,200 playlists removed.");
  });

  it("names what didn't, when that's a few", () => {
    expect(failedLine(["Rain"])).toBe("Couldn't remove Rain.");
    expect(failedLine(["Rain", "Dusk"])).toBe("Couldn't remove Rain and Dusk.");
    expect(failedLine(["Rain", "Dusk", "Old"])).toBe(
      "Couldn't remove Rain, Dusk, and Old.",
    );
  });

  // Every chunk failing is the likely first live run: 43 names would be a
  // 14-line red paragraph read out in full.
  it("counts what didn't, when that's more", () => {
    expect(failedLine(["Rain", "Dusk", "Old", "Gym"])).toBe(
      "Couldn't remove 4 playlists.",
    );
    expect(failedLine(Array.from({ length: 1200 }, (_, i) => `P${i}`))).toBe(
      "Couldn't remove 1,200 playlists.",
    );
  });

  it("puts the count in the button", () => {
    expect(removeLabel(1)).toBe("Remove 1 playlist");
    expect(removeLabel(43)).toBe("Remove 43 playlists");
  });
});
