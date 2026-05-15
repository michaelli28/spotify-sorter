import { describe, it, expect, vi } from "vitest";
import { createDegradingPool } from "@/src/lib/llm/concurrency";

describe("createDegradingPool", () => {
  it("runs at initial concurrency", async () => {
    const pool = createDegradingPool({
      initial: 3,
      min: 1,
      recoveryWindowMs: 100,
    });
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return "ok";
    });
    await pool.runAll(tasks);
    expect(peak).toBe(3);
  });

  it("drops concurrency when reportRateLimit() is called", async () => {
    const pool = createDegradingPool({
      initial: 3,
      min: 1,
      recoveryWindowMs: 10_000,
    });
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(2);
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(1);
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(1);
  });

  it("recovers to initial after a clean window", async () => {
    vi.useFakeTimers();
    const pool = createDegradingPool({
      initial: 3,
      min: 1,
      recoveryWindowMs: 30,
    });
    pool.reportRateLimit();
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(1);
    vi.advanceTimersByTime(31);
    pool.tick();
    expect(pool.currentLimit()).toBe(3);
    vi.useRealTimers();
  });
});
