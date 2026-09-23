import { afterEach, describe, expect, it, vi } from "vitest";
import {
  crateKeyTarget,
  entranceSeen,
  markEntranceSeen,
  swipeStep,
} from "@/src/components/home/flip";

// The crate is ordered front (0, largest) to back (n - 1, smallest).
describe("crateKeyTarget", () => {
  it("goes one divider back (smaller) on Up and Right", () => {
    expect(crateKeyTarget("ArrowUp", 2, 5)).toBe(3);
    expect(crateKeyTarget("ArrowRight", 2, 5)).toBe(3);
  });

  it("goes one divider forward (larger) on Down and Left", () => {
    expect(crateKeyTarget("ArrowDown", 2, 5)).toBe(1);
    expect(crateKeyTarget("ArrowLeft", 2, 5)).toBe(1);
  });

  it("jumps to the front on Home and the back on End", () => {
    expect(crateKeyTarget("Home", 3, 5)).toBe(0);
    expect(crateKeyTarget("End", 1, 5)).toBe(4);
  });

  it("stops at either end instead of wrapping", () => {
    expect(crateKeyTarget("ArrowDown", 0, 5)).toBe(0);
    expect(crateKeyTarget("ArrowUp", 4, 5)).toBe(4);
  });

  it("ignores every other key", () => {
    expect(crateKeyTarget("Enter", 2, 5)).toBeNull();
    expect(crateKeyTarget("a", 2, 5)).toBeNull();
  });
});

describe("swipeStep", () => {
  it("flips back (smaller) on a swipe left past 60px or 400px/s", () => {
    expect(swipeStep(-61, 0)).toBe(1);
    expect(swipeStep(-10, -401)).toBe(1);
  });

  it("flips forward (larger) on a swipe right past 60px or 400px/s", () => {
    expect(swipeStep(61, 0)).toBe(-1);
    expect(swipeStep(10, 401)).toBe(-1);
  });

  it("stays put on a short, slow drag", () => {
    expect(swipeStep(-40, -200)).toBe(0);
    expect(swipeStep(59, 399)).toBe(0);
  });
});

describe("the entrance, once per browser session", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("plays until it has been seen in this session", () => {
    expect(entranceSeen()).toBe(false);
    markEntranceSeen();
    expect(entranceSeen()).toBe(true);
  });

  it("plays (once per mount) when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => markEntranceSeen()).not.toThrow();
    expect(entranceSeen()).toBe(false);
  });
});
