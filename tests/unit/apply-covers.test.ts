import { describe, expect, it, vi } from "vitest";
import {
  coverNotice,
  coverOutcome,
  coverStatus,
  postCover,
  tallyCovers,
  uploadInTurn,
  type CoverOutcome,
  type CoverState,
} from "@/src/components/apply/covers";
import type { SleeveSpec } from "@/src/lib/sleeves/spec";

const spec = { seed: 1 } as unknown as SleeveSpec;

describe("coverOutcome (the cover route's answers)", () => {
  it("is ok when Spotify took the cover", () => {
    expect(coverOutcome(200, { ok: true })).toBe("ok");
  });

  // Spec §7.2: both mean only reconnecting can help.
  it("needs a reconnect for a missing scope or a revoked token", () => {
    expect(coverOutcome(403, { error: "missing_scope" })).toBe("reconnect");
    expect(coverOutcome(401, { error: "reconnect" })).toBe("reconnect");
  });

  it("calls everything else a failed upload worth retrying", () => {
    expect(coverOutcome(413, { error: "too_large" })).toBe("failed");
    expect(coverOutcome(404, { error: "no_playlist" })).toBe("failed");
    expect(coverOutcome(502, { error: "upload_failed" })).toBe("failed");
    expect(coverOutcome(500, null)).toBe("failed");
    // The same-origin guard answers 403 with plain text, not missing_scope.
    expect(coverOutcome(403, null)).toBe("failed");
  });
});

describe("uploadInTurn", () => {
  function deferred() {
    let resolve!: (o: CoverOutcome) => void;
    const promise = new Promise<CoverOutcome>((r) => (resolve = r));
    return { promise, resolve };
  }

  // A running Apply's cache writes race any token refresh (foundation-data.md).
  it("uploads one cover at a time, in order", async () => {
    const calls: string[] = [];
    const pending = [deferred(), deferred(), deferred()];
    const states: Array<[number, CoverState]> = [];
    const run = uploadInTurn({
      items: ["a", "b", "c"],
      upload: (item) => {
        calls.push(item);
        return pending[calls.length - 1]!.promise;
      },
      onState: (i, s) => states.push([i, s]),
      alive: () => true,
    });
    await Promise.resolve();
    expect(calls).toEqual(["a"]);
    pending[0]!.resolve("ok");
    await vi.waitFor(() => expect(calls).toEqual(["a", "b"]));
    pending[1]!.resolve("failed");
    await vi.waitFor(() => expect(calls).toEqual(["a", "b", "c"]));
    pending[2]!.resolve("ok");
    await run;
    expect(states).toEqual([
      [0, "uploading"],
      [0, "ok"],
      [1, "uploading"],
      [1, "failed"],
      [2, "uploading"],
      [2, "ok"],
    ]);
  });

  it("stops at the first reconnect and skips the rest, untried", async () => {
    const upload = vi.fn(
      async (item: string): Promise<CoverOutcome> =>
        item === "b" ? "reconnect" : "ok",
    );
    const states = new Map<number, CoverState>();
    await uploadInTurn({
      items: ["a", "b", "c", "d"],
      upload,
      onState: (i, s) => states.set(i, s),
      alive: () => true,
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect([...states.entries()].sort()).toEqual([
      [0, "ok"],
      [1, "reconnect"],
      [2, "skipped"],
      [3, "skipped"],
    ]);
  });

  it("stops quietly when the page is gone", async () => {
    let alive = true;
    const upload = vi.fn(async (): Promise<CoverOutcome> => {
      alive = false;
      return "ok";
    });
    await uploadInTurn({
      items: ["a", "b"],
      upload,
      onState: () => {},
      alive: () => alive,
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("counts a thrown upload as a failed one and carries on", async () => {
    const states: CoverState[] = [];
    await uploadInTurn({
      items: ["a", "b"],
      upload: async (item) => {
        if (item === "a") throw new Error("canvas");
        return "ok";
      },
      onState: (i, s) => {
        states[i] = s;
      },
      alive: () => true,
    });
    expect(states).toEqual(["failed", "ok"]);
  });
});

describe("postCover", () => {
  it("posts the category and its JPEG to the cover route", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    const toJpeg = vi.fn(async () => "QUJD");
    const outcome = await postCover({ id: "c1", spec }, { fetchImpl, toJpeg });
    expect(outcome).toBe("ok");
    expect(toJpeg).toHaveBeenCalledWith(spec);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/spotify/cover");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      categoryId: "c1",
      jpegBase64: "QUJD",
    });
  });

  it("reads the route's error code", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: "missing_scope" }, { status: 403 }),
    );
    expect(
      await postCover(
        { id: "c1", spec },
        { fetchImpl, toJpeg: async () => "QUJD" },
      ),
    ).toBe("reconnect");
  });

  it("fails without posting when the sleeve won't render", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    expect(
      await postCover(
        { id: "c1", spec },
        {
          fetchImpl,
          toJpeg: async () => {
            throw new Error("too large");
          },
        },
      ),
    ).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails when the request never lands", async () => {
    expect(
      await postCover(
        { id: "c1", spec },
        {
          fetchImpl: async () => {
            throw new TypeError("offline");
          },
          toJpeg: async () => "QUJD",
        },
      ),
    ).toBe("failed");
  });
});

describe("the cover lines", () => {
  const tally = (...states: CoverState[]) => tallyCovers(states);

  it("counts nothing when there is nothing to upload", () => {
    expect(coverStatus(tally())).toBe("");
    expect(coverNotice(tally())).toBeNull();
  });

  it("counts covers while they upload", () => {
    const t = tally("ok", "failed", "uploading", "waiting");
    expect(t.running).toBe(true);
    expect(coverStatus(t)).toBe("Adding covers: 2 of 4");
    expect(coverNotice(t)).toBeNull();
  });

  // The close already says how many playlists: "41 covers added." was the
  // same count a third time.
  it("says when every cover is on, without the count", () => {
    expect(coverStatus(tally("ok", "ok"))).toBe("Every cover added.");
    expect(coverStatus(tally("ok"))).toBe("Cover added.");
    expect(coverNotice(tally("ok", "ok"))).toBeNull();
  });

  it("offers Retry covers for failures, counted", () => {
    const t = tally("ok", "failed", "failed");
    expect(coverStatus(t)).toBe("1 of 3 covers added.");
    expect(coverNotice(t)).toEqual({
      kind: "retry",
      text: "2 covers didn't upload.",
    });
    expect(coverNotice(tally("ok", "failed"))).toEqual({
      kind: "retry",
      text: "1 cover didn't upload.",
    });
  });

  // No Retry: retrying can't add a scope the token lacks.
  // The notice under the close says it; the strip only adds a tally that differs.
  it("leaves the strip empty when no cover went on", () => {
    expect(coverStatus(tally("failed", "failed"))).toBe("");
    expect(coverStatus(tally("reconnect", "skipped"))).toBe("");
  });

  // Retry covers stays put while it works, so focus has somewhere to stay.
  it("keeps the notice while a retry runs, and only then", () => {
    const t = tally("ok", "uploading", "waiting");
    expect(coverNotice(t, { retrying: true })).toEqual({
      kind: "retrying",
      text: "Retrying covers…",
    });
    expect(coverNotice(t)).toBeNull();
    // Finished: the retry flag no longer matters.
    expect(coverNotice(tally("ok", "ok"), { retrying: true })).toBeNull();
    expect(coverNotice(tally("ok", "failed"), { retrying: true })).toEqual({
      kind: "retry",
      text: "1 cover didn't upload.",
    });
  });

  it("asks for a reconnect, and never a retry, when the scope is missing", () => {
    const t = tally("reconnect", "skipped", "skipped");
    expect(coverStatus(t)).toBe("");
    expect(coverNotice(t)).toEqual({
      kind: "reconnect",
      text: "Reconnect Spotify to add covers, then apply again.",
    });
    expect(coverNotice(tally("ok", "failed", "reconnect", "skipped"))).toEqual(
      expect.objectContaining({ kind: "reconnect" }),
    );
  });
});
