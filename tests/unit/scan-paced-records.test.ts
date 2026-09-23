import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import {
  RECORD_GAP_MS,
  usePacedRecords,
} from "@/src/components/scan/usePacedRecords";

function paced(strict = false, read = 0) {
  return renderHook(({ read }: { read: number }) => usePacedRecords(read), {
    initialProps: { read },
    wrapper: strict ? StrictMode : undefined,
  });
}
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("usePacedRecords", () => {
  it("drops nothing before a source is read", () => {
    const { result } = paced();
    wait(1000);
    expect(result.current).toEqual([]);
  });

  it("drops a record as soon as a source is read", () => {
    const { result, rerender } = paced();
    rerender({ read: 1 });
    wait(0);
    expect(result.current).toHaveLength(1);
  });

  // A re-run with every playlist unchanged reads a playlist every few ms.
  it("drops at most one record per 180ms, however fast sources arrive", () => {
    expect(RECORD_GAP_MS).toBe(180);
    const { result, rerender } = paced();
    rerender({ read: 1 });
    wait(0);
    for (const read of [2, 3, 4, 5]) {
      wait(10);
      rerender({ read });
    }
    expect(result.current).toHaveLength(1);
    wait(RECORD_GAP_MS - 41);
    expect(result.current).toHaveLength(1);
    wait(1);
    expect(result.current).toHaveLength(2);
    // Everything read in between went in with that record: nothing lags behind.
    wait(5000);
    expect(result.current).toHaveLength(2);
  });

  it("drops one record per source on a slow scan", () => {
    const { result, rerender } = paced();
    for (const read of [1, 2, 3]) {
      rerender({ read });
      wait(400);
    }
    expect(result.current).toHaveLength(3);
  });

  it("keeps only the last few records: landed ones sit in one spot", () => {
    const { result, rerender } = paced();
    for (const read of [1, 2, 3, 4, 5, 6]) {
      rerender({ read });
      wait(400);
    }
    expect(result.current).toEqual([2, 3, 4, 5]);
  });

  // StrictMode runs every effect twice in development.
  it("still drops records under StrictMode's double effects", () => {
    // Mounted with a source already read, so a drop is pending during the rerun.
    const { result } = paced(true, 1);
    wait(0);
    expect(result.current).toHaveLength(1);
  });

  it("stops dropping once the crate is gone", () => {
    const { rerender, unmount } = paced();
    rerender({ read: 1 });
    wait(0);
    rerender({ read: 2 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
