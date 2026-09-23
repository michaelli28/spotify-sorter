import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const nav = vi.hoisted(() => ({ pathname: "/scope" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { SiteNav } from "@/src/components/design/SiteNav";
import { NavLockProvider, useNavLock } from "@/src/components/design/NavLock";

type Status = {
  configured: boolean;
  connected: boolean;
  tracks: number;
  categories: number;
  unsorted: number;
  applied: number;
  version_mismatch: boolean;
};

const SORTED: Status = {
  configured: true,
  connected: true,
  tracks: 3172,
  categories: 41,
  unsorted: 0,
  applied: 0,
  version_mismatch: false,
};

type Pending = { url: string; resolve: (s: Status | null) => void };
let pending: Pending[] = [];

// Each call to /api/status waits until the test resolves it, so the test can
// look at the nav before, between and after responses.
function stubStatus() {
  pending = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    return new Promise<Response>((resolve) => {
      pending.push({
        url,
        resolve: (s) =>
          resolve(
            s
              ? new Response(JSON.stringify(s), { status: 200 })
              : new Response("boom", { status: 500 }),
          ),
      });
    });
  });
}

async function answer(s: Status | null, index = pending.length - 1) {
  await act(async () => {
    pending[index]!.resolve(s);
  });
}

const STEPS = ["Sources", "Categories", "Fit", "Apply"] as const;

// A link that goes somewhere. Locked items are links too (role="link",
// aria-disabled) but have no href.
function link(name: string) {
  const el = screen.queryByRole("link", { name });
  return el?.hasAttribute("href") ? el : null;
}

function Lock({ on, children }: { on: boolean; children?: ReactNode }) {
  useNavLock(on);
  return <>{children}</>;
}

beforeEach(() => {
  nav.pathname = "/scope";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SiteNav", () => {
  it.each(["/setup", "/label"])("is hidden on %s", (path) => {
    nav.pathname = path;
    const fetch = stubStatus();
    const { container } = render(<SiteNav />);
    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });

  // Spec §3.1: the home page gets the nav too; its own routes list drops
  // Categories and Labels.
  it("shows on the home page, gated like everywhere else", async () => {
    nav.pathname = "/";
    const fetch = stubStatus();
    render(<SiteNav />);
    expect(
      screen.getByRole("navigation", { name: "Site" }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/status", expect.anything());
    for (const name of STEPS) expect(link(name)).toBeNull();
    await answer({ ...SORTED, unsorted: 5 });
    expect(link("Categories")).not.toBeNull();
    expect(link("Fit")).toBeNull();
    const marked = document.querySelectorAll('[aria-current="page"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("SpotifySorter");
  });

  it("prints the record mark beside the wordmark without naming it", async () => {
    stubStatus();
    render(<SiteNav />);
    await answer(SORTED);
    const home = link("SpotifySorter")!;
    const mark = home.querySelector("svg");
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(home).toHaveAccessibleName("SpotifySorter");
  });

  it("shows the wordmark as a link home, never as a heading", async () => {
    stubStatus();
    render(<SiteNav />);
    await answer(SORTED);
    expect(link("SpotifySorter")).toHaveAttribute("href", "/");
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("keeps every step locked until the status for this page arrives", async () => {
    const fetch = stubStatus();
    render(<SiteNav />);
    expect(fetch).toHaveBeenCalledWith("/api/status", expect.anything());
    for (const name of STEPS) expect(link(name)).toBeNull();
    for (const name of STEPS)
      expect(screen.getByText(name).closest("[aria-disabled]")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    await answer(SORTED);
    for (const name of STEPS) expect(link(name)).not.toBeNull();
  });

  // /review with no categories starts a paid propose; /classify and /apply
  // with unsorted tracks start a paid run. Those must never be one click away.
  it.each<[string, Partial<Status>, Record<(typeof STEPS)[number], boolean>]>([
    [
      "not connected",
      { connected: false, categories: 0, unsorted: 0, tracks: 0 },
      { Sources: false, Categories: false, Fit: false, Apply: false },
    ],
    [
      "connected, no categories",
      { categories: 0, unsorted: 3172 },
      { Sources: true, Categories: false, Fit: false, Apply: false },
    ],
    [
      "categories, some tracks unsorted",
      { unsorted: 297 },
      { Sources: true, Categories: true, Fit: false, Apply: false },
    ],
    [
      "categories, everything sorted",
      {},
      { Sources: true, Categories: true, Fit: true, Apply: true },
    ],
    [
      "cache version mismatch",
      {
        connected: false,
        tracks: 0,
        categories: 0,
        unsorted: 0,
        version_mismatch: true,
      },
      { Sources: false, Categories: false, Fit: false, Apply: false },
    ],
  ])("gates the steps: %s", async (_, over, expected) => {
    nav.pathname = "/diff";
    stubStatus();
    render(<SiteNav />);
    await answer({ ...SORTED, ...over });
    for (const name of STEPS) {
      if (expected[name]) expect(link(name)).not.toBeNull();
      else expect(link(name)).toBeNull();
    }
  });

  it("links each step to its page", async () => {
    nav.pathname = "/review";
    stubStatus();
    render(<SiteNav />);
    await answer(SORTED);
    expect(link("Sources")).toHaveAttribute("href", "/scope");
    expect(link("Categories")).toHaveAttribute("href", "/review");
    expect(link("Fit")).toHaveAttribute("href", "/classify");
    expect(link("Apply")).toHaveAttribute("href", "/apply");
    expect(link("Labels")).toHaveAttribute("href", "/label");
  });

  // The nav now shows on / too, so Labels would appear before setup and on a
  // version mismatch, where /label has nothing to read. The old home offered
  // it only once categories existed.
  it.each<[string, Partial<Status>]>([
    ["no categories yet", { categories: 0, unsorted: 3172 }],
    [
      "a cache version mismatch",
      { connected: false, categories: 0, tracks: 0, version_mismatch: true },
    ],
  ])("locks Labels with %s", async (_, over) => {
    nav.pathname = "/";
    stubStatus();
    render(<SiteNav />);
    expect(link("Labels")).toBeNull();
    await answer({ ...SORTED, ...over });
    expect(link("Labels")).toBeNull();
    expect(screen.getByRole("link", { name: "Labels" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("opens Labels once categories exist", async () => {
    nav.pathname = "/";
    stubStatus();
    render(<SiteNav />);
    await answer({ ...SORTED, unsorted: 12 });
    expect(link("Labels")).toHaveAttribute("href", "/label");
  });

  it.each([
    ["/scope", "Sources"],
    ["/scan", "Sources"],
    ["/diff", "Sources"],
    ["/review", "Categories"],
    ["/classify", "Fit"],
    ["/apply", "Apply"],
  ])("marks %s as the %s step", async (path, current) => {
    nav.pathname = path;
    stubStatus();
    render(<SiteNav />);
    await answer(SORTED);
    const marked = document.querySelectorAll('[aria-current="page"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent(current);
  });

  it("marks the current step even while it is locked", async () => {
    nav.pathname = "/review";
    stubStatus();
    render(<SiteNav />);
    await answer({ ...SORTED, categories: 0, unsorted: 3172 });
    const current = document.querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent("Categories");
    expect(current).toHaveAttribute("aria-disabled", "true");
  });

  // A locked <button> named "Apply" would collide with the e2e locator for
  // the confirm button on /apply.
  it("never renders a button", async () => {
    nav.pathname = "/apply";
    stubStatus();
    render(<SiteNav />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    await answer({ ...SORTED, unsorted: 5 });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  // aria-disabled on a plain span is ignored by screen readers (ARIA 1.2
  // allows it on link, not generic), so a locked step read as bare text.
  it("announces a locked step as a link that is unavailable", async () => {
    stubStatus();
    render(<SiteNav />);
    await answer({ ...SORTED, categories: 0 });
    const fit = screen.getByRole("link", { name: "Fit" });
    expect(fit).toHaveAttribute("aria-disabled", "true");
    expect(fit).not.toHaveAttribute("href");
  });

  it("takes locked steps out of the tab order", async () => {
    stubStatus();
    render(<SiteNav />);
    await answer({ ...SORTED, categories: 0 });
    const locked = screen.getByText("Fit").closest("[aria-disabled]");
    expect(locked?.tagName).toBe("SPAN");
    expect(locked).not.toHaveAttribute("tabindex");
    expect(locked).not.toHaveAttribute("href");
  });

  // After a scan adds tracks, the status from the previous page is stale:
  // Fit would open a paid run. Nothing links until the new status arrives.
  it("refetches on every page change and relocks until it answers", async () => {
    const fetch = stubStatus();
    const { rerender } = render(<SiteNav />);
    await answer(SORTED);
    expect(link("Fit")).not.toBeNull();

    nav.pathname = "/diff";
    rerender(<SiteNav />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(link("Fit")).toBeNull();
    expect(link("Sources")).toBeNull();

    await answer({ ...SORTED, unsorted: 297 });
    expect(link("Sources")).not.toBeNull();
    expect(link("Fit")).toBeNull();
  });

  it("ignores an answer that arrives after the page changed", async () => {
    const fetch = stubStatus();
    const { rerender } = render(<SiteNav />);
    nav.pathname = "/diff";
    rerender(<SiteNav />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await answer({ ...SORTED, unsorted: 297 }, 1);
    await answer(SORTED, 0);
    expect(link("Fit")).toBeNull();
  });

  it("stays locked when the status request fails", async () => {
    stubStatus();
    render(<SiteNav />);
    await answer(null);
    for (const name of STEPS) expect(link(name)).toBeNull();
    expect(link("SpotifySorter")).not.toBeNull();
  });

  it("makes every item inert while a page holds the nav lock", async () => {
    const fetch = stubStatus();
    const { rerender } = render(
      <NavLockProvider>
        <SiteNav />
        <Lock on={false} />
      </NavLockProvider>,
    );
    await answer(SORTED);
    expect(link("Fit")).not.toBeNull();

    rerender(
      <NavLockProvider>
        <SiteNav />
        <Lock on />
      </NavLockProvider>,
    );
    for (const item of screen.getAllByRole("link"))
      expect(item).not.toHaveAttribute("href");
    expect(screen.getByText("SpotifySorter")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Labels")).toHaveAttribute("aria-disabled", "true");

    // The job may have changed the library, so releasing refetches first.
    rerender(
      <NavLockProvider>
        <SiteNav />
        <Lock on={false} />
      </NavLockProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(link("Fit")).toBeNull();
    expect(link("SpotifySorter")).not.toBeNull();
    await answer({ ...SORTED, unsorted: 12 });
    expect(link("Categories")).not.toBeNull();
    expect(link("Fit")).toBeNull();
  });
});
