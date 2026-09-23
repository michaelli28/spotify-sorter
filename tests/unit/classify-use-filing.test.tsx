import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFiling } from "@/src/components/classify/useFiling";

// The page tests force reduced motion, so only this file drives the animated
// path: the 250ms print tick, the newest-read guard, and reduced motion
// arriving mid-run.

const IDS = ["a", "b", "c", "d", "e", "f", "g"];
const ZERO = Object.fromEntries(IDS.map((id) => [id, 0]));
const ONE = Object.fromEntries(IDS.map((id) => [id, 1]));

// One pending GET /api/status per batch, answered by the test.
let replies: Array<(counts: Record<string, number>) => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  replies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) =>
          replies.push((counts) =>
            resolve({
              ok: true,
              json: async () => ({ category_counts: counts }),
            }),
          ),
        ),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function run() {
  return renderHook(
    ({ batchesDone, reduced }) =>
      useFiling({ initial: ZERO, batchesDone, reduced }),
    { initialProps: { batchesDone: 0, reduced: false } },
  );
}

async function answer(i: number, counts: Record<string, number>) {
  await act(async () => {
    replies[i]!(counts);
    await vi.advanceTimersByTimeAsync(0);
  });
}

const tick = () => act(() => vi.advanceTimersByTime(250));
const printed = (shown: Record<string, number>) =>
  IDS.filter((id) => shown[id] === 1).length;

describe("useFiling", () => {
  it("prints three counts every 250ms, each with one bump", async () => {
    const { result, rerender } = run();
    expect(fetch).not.toHaveBeenCalled();
    rerender({ batchesDone: 1, reduced: false });
    expect(fetch).toHaveBeenCalledWith("/api/status", { cache: "no-store" });
    await answer(0, ONE);
    expect(printed(result.current.shown)).toBe(0);

    tick();
    expect(printed(result.current.shown)).toBe(3);
    tick();
    expect(printed(result.current.shown)).toBe(6);
    tick();
    expect(result.current.shown).toEqual(ONE);
    expect(result.current.queue).toEqual([]);
    expect(Object.values(result.current.bumps)).toEqual(IDS.map(() => 1));
  });

  // Two batches can finish their reads in either order.
  it("prints only the newest read when reads finish out of order", async () => {
    const { result, rerender } = run();
    rerender({ batchesDone: 1, reduced: false });
    rerender({ batchesDone: 2, reduced: false });
    await answer(1, { ...ZERO, a: 5 });
    await answer(0, { ...ZERO, a: 2 });
    tick();
    expect(result.current.shown.a).toBe(5);
    expect(result.current.target.a).toBe(5);
  });

  it("prints what is queued at once, with no more bumps, when reduced motion turns on", async () => {
    const { result, rerender } = run();
    rerender({ batchesDone: 1, reduced: false });
    await answer(0, ONE);
    tick();
    const bumped = { ...result.current.bumps };
    expect(Object.keys(bumped)).toHaveLength(3);

    rerender({ batchesDone: 1, reduced: true });
    expect(result.current.shown).toEqual(ONE);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.bumps).toEqual(bumped);
  });
});
