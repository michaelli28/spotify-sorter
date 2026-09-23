import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  PRINT_STEP_MS,
  usePrintPacer,
} from "@/src/components/apply/usePrintPacer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function pacer(target: number, reduced = false) {
  return renderHook(({ target, reduced }) => usePrintPacer(target, reduced), {
    initialProps: { target, reduced },
  });
}

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("usePrintPacer", () => {
  it("prints nothing before there is anything written", () => {
    expect(pacer(0).result.current).toBe(0);
  });

  // Brief §4.4 C: 41 × 30ms = 1.2s, so it never outlasts the work.
  it("catches up on landed writes at 30ms a sleeve", async () => {
    const { result, rerender } = pacer(0);
    rerender({ target: 41, reduced: false });
    expect(result.current).toBe(0);
    await tick(PRINT_STEP_MS);
    expect(result.current).toBe(1);
    await tick(PRINT_STEP_MS * 9);
    expect(result.current).toBe(10);
    await tick(PRINT_STEP_MS * 40);
    expect(result.current).toBe(41);
    expect(PRINT_STEP_MS).toBe(30);
  });

  it("follows real progress one write at a time", async () => {
    const { result, rerender } = pacer(0);
    rerender({ target: 1, reduced: false });
    await tick(PRINT_STEP_MS);
    expect(result.current).toBe(1);
    await tick(1000);
    expect(result.current).toBe(1);
    rerender({ target: 2, reduced: false });
    await tick(PRINT_STEP_MS);
    expect(result.current).toBe(2);
  });

  // Try again starts a new run from the first playlist.
  it("drops back at once when a new run starts over", async () => {
    const { result, rerender } = pacer(0);
    rerender({ target: 3, reduced: false });
    await tick(PRINT_STEP_MS * 3);
    expect(result.current).toBe(3);
    rerender({ target: 0, reduced: false });
    expect(result.current).toBe(0);
    rerender({ target: 2, reduced: false });
    expect(result.current).toBe(0);
    await tick(PRINT_STEP_MS * 2);
    expect(result.current).toBe(2);
  });

  it("prints everything written at once under reduced motion", () => {
    const { result, rerender } = pacer(0, true);
    rerender({ target: 41, reduced: true });
    expect(result.current).toBe(41);
  });
});
