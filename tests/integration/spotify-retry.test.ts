import { describe, it, expect, vi } from "vitest";
import { withRetry429 } from "@/src/lib/spotify/retry";

describe("withRetry429", () => {
  it("retries with delay equal to Retry-After", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        const headers = new Headers({ "retry-after": "2" });
        const e = Object.assign(new Error("429"), { status: 429, headers });
        throw e;
      }
      return "ok";
    });
    const result = await withRetry429(fn, {
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      maxRetries: 3,
    });
    expect(result).toBe("ok");
    expect(sleeps).toEqual([2000]);
    expect(calls).toBe(2);
  });

  it("gives up after maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue(
      Object.assign(new Error("429"), {
        status: 429,
        headers: new Headers({ "retry-after": "1" }),
      }),
    );
    await expect(
      withRetry429(fn, { sleep: () => Promise.resolve(), maxRetries: 2 }),
    ).rejects.toThrow(/429/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-429", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("500"), { status: 500 }));
    await expect(
      withRetry429(fn, { sleep: () => Promise.resolve(), maxRetries: 5 }),
    ).rejects.toThrow(/500/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
