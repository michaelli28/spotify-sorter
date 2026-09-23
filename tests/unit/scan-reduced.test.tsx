import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

// The OS asks for reduced motion (what useMotionConfig reads).
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => true,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/scan",
}));

import ScanPage from "@/app/scan/page";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  private listeners = new Map<string, Set<(e: Event) => void>>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener() {}
  close() {}
  emit(type: string, data: unknown) {
    const e = new MessageEvent(type, { data: JSON.stringify(data) });
    act(() => this.listeners.get(type)?.forEach((fn) => fn(e)));
  }
}
const playlists = (current: number, total = 105) =>
  FakeEventSource.last!.emit("progress", {
    stage: "playlists",
    current,
    total,
  });
// One animation frame, so framer has painted the latest motion values.
const frame = () => act(() => new Promise((r) => setTimeout(r, 50)));

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          scope: {
            included_playlist_ids: Array.from(
              { length: 105 },
              (_, i) => `p${i}`,
            ),
            include_liked_songs: true,
          },
          runs: [{}],
        }),
      ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderScan() {
  render(<ScanPage />);
  await act(async () => {});
}

describe("/scan with reduced motion", () => {
  it("steps the printed count straight to each figure", async () => {
    await renderScan();
    const printed = () =>
      screen
        .getByRole("heading", { level: 1 })
        .querySelector('[aria-hidden="true"]')?.textContent;
    playlists(38);
    // No "0 of 105" frame first.
    expect(printed()).toBe("38 of 105");
    playlists(50);
    await frame();
    expect(printed()).toBe("50 of 105");
  });

  it("steps the fill straight to playlists read ÷ in scope", async () => {
    await renderScan();
    playlists(42);
    await frame();
    // The fill's window sits (1 − 42/105) of its height down: 60%.
    const fill = document.querySelector<HTMLElement>("[data-crate-fill]")!;
    expect(fill.style.transform).toBe("translateY(60%)");
  });

  it("fades records in and out where they stand, with no travel", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderScan();
    playlists(1);
    act(() => vi.advanceTimersByTime(0));
    const record = document.querySelector<HTMLElement>("[data-record]")!;
    expect(record).not.toBeNull();
    expect(record.style.transform).toMatch(/^(none)?$/);
    vi.useRealTimers();
  });
});
