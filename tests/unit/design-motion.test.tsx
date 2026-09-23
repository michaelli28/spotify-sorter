import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, renderHook, waitFor } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduced: false }));
const nav = vi.hoisted(() => ({ pathname: "/scope" }));

vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import {
  EASE_OUT,
  SPRING_SETTLE,
  STAGGER,
  staggerDelay,
} from "@/src/components/design/motion";
import { PageTransition } from "@/src/components/design/PageTransition";

afterEach(() => {
  motion.reduced = false;
  nav.pathname = "/scope";
});

describe("useMotionConfig", () => {
  // One source of truth: the hook's values are the brief §4.4 tokens.
  it("takes its spring, ease and stagger from the motion tokens", () => {
    const { result } = renderHook(() => useMotionConfig());
    expect(result.current.spring).toEqual(SPRING_SETTLE);
    expect(result.current.pageEase).toEqual({ duration: 0.6, ease: EASE_OUT });
    expect(result.current.stagger).toEqual({
      staggerChildren: STAGGER.each,
      delayChildren: STAGGER.delay,
    });
  });

  // 41 cards at 0.04s each once finished ~1.7s after the page appeared.
  it("caps the stagger at item 12, on the brief's timing", () => {
    const { result } = renderHook(() => useMotionConfig());
    const { itemDelay } = result.current;
    for (const i of [-3, 0, 1, 12, 40])
      expect(itemDelay(i)).toBeCloseTo(staggerDelay(i));
    expect(itemDelay(0)).toBeCloseTo(0.06);
    expect(itemDelay(1)).toBeCloseTo(0.084);
    expect(itemDelay(40)).toBeCloseTo(itemDelay(12));
  });

  it("goes instant under reduced motion", () => {
    motion.reduced = true;
    const { result } = renderHook(() => useMotionConfig());
    const m = result.current;
    expect(m.reduced).toBe(true);
    expect(m.spring).toEqual({ duration: 0 });
    expect(m.pageEase).toEqual({ duration: 0 });
    expect(m.fade).toEqual({ duration: 0 });
    expect(m.itemDelay(8)).toBe(0);
    // Hidden and visible match, so nothing moves or fades in.
    expect(m.item.hidden).toEqual(m.item.visible);
  });

  it("returns a stable object between renders", () => {
    const { result, rerender } = renderHook(() => useMotionConfig());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("PageTransition", () => {
  // AnimatePresence here once mounted every page twice and opened the scan
  // stream twice. A re-render on the same route must not remount the page.
  it("mounts the page once per route", () => {
    const mounts = vi.fn();
    function Page() {
      useEffect(() => {
        mounts();
      }, []);
      return <p>page</p>;
    }
    const { rerender } = render(
      <PageTransition>
        <Page />
      </PageTransition>,
    );
    rerender(
      <PageTransition>
        <Page />
      </PageTransition>,
    );
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it("starts transparent and fades in", () => {
    const { container } = render(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe(
      "0",
    );
  });

  // The server can't know the motion preference, so the first render must
  // match it (opacity 0); a reduced-motion initial={false} broke hydration.
  it("renders the same first frame under reduced motion, then shows at once", async () => {
    motion.reduced = true;
    const { container } = render(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe("0");
    await waitFor(() => expect(wrapper.style.opacity).toBe("1"), {
      timeout: 100,
    });
  });

  it("fades over 600ms otherwise", async () => {
    const { container } = render(
      <PageTransition>
        <p>page</p>
      </PageTransition>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    await new Promise((r) => setTimeout(r, 100));
    expect(wrapper.style.opacity).not.toBe("1");
  });
});
