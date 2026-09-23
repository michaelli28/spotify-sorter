import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));

import { renderToString } from "react-dom/server";
import {
  ActionBar,
  ActionStripProvider,
  ActionStripSlot,
} from "@/src/components/design/ActionBar";

afterEach(() => {
  motion.reduced = false;
});

describe("ActionBar", () => {
  it("renders the back, status and action slots", () => {
    render(
      <ActionBar
        start={<a href="/scope">Sources</a>}
        status="2 deleted · 1 renamed"
        end={<button>Classify</button>}
      />,
    );
    expect(screen.getByRole("link", { name: "Sources" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Classify" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 deleted · 1 renamed",
    );
  });

  // A live region only announces changes if it existed before the change.
  it("keeps an empty live region in the page before there is news", () => {
    const { rerender } = render(<ActionBar end={<button>Scan</button>} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    rerender(
      <ActionBar
        end={<button>Scan</button>}
        status="Couldn't save the scope."
      />,
    );
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Couldn't save the scope.");
  });

  // The strip is sticky, not fixed: it takes its own room in the flow, so it
  // can never sit over the page's last rows and needs no spacer.
  it("sits in the page flow, so it can never cover content", () => {
    const { container } = render(<ActionBar end={<button>Scan</button>} />);
    expect(container.querySelector("[data-action-bar-spacer]")).toBeNull();
    const bar = container.querySelector("[data-action-bar]")!;
    const strip = bar.closest("[data-action-strip-slot]")!;
    expect(strip).not.toBeNull();
    expect(strip.className).toMatch(/(^|\s)sticky(\s|$)/);
    for (const el of [strip, bar])
      expect(el.className).not.toMatch(/(^|\s)fixed(\s|$)/);
  });

  it("announces the status politely", () => {
    render(<ActionBar status="Saving…" end={<button>Classify</button>} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("reads status first, then the primary", () => {
    render(<ActionBar status="Unsaved: 1 edited" end={<button>Classify</button>} />);
    const status = screen.getByRole("status");
    const primary = screen.getByRole("button", { name: "Classify" });
    expect(
      status.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("appears at once under reduced motion", async () => {
    motion.reduced = true;
    const { container } = render(<ActionBar end={<button>Scan</button>} />);
    const bar = container.querySelector("[data-action-bar]") as HTMLElement;
    await waitFor(() => expect(bar.style.opacity).toBe("1"), { timeout: 100 });
  });

  // A transform makes the bar the containing block of anything fixed inside
  // it, so a dialog opened from the strip would be pinned to the strip's box.
  it("fades in otherwise, without ever moving", async () => {
    const { container } = render(<ActionBar end={<button>Scan</button>} />);
    const bar = container.querySelector("[data-action-bar]") as HTMLElement;
    expect(bar.style.opacity).toBe("0");
    expect(bar.style.transform).not.toMatch(/translate/);
    await new Promise((r) => setTimeout(r, 350));
    expect(bar.style.transform).not.toMatch(/translate/);
  });

  // The Fit ruler once pushed Apply off a 390px screen: start gives way and
  // is capped at the room left, the primary never shrinks.
  it("lets start give way so the primary always fits", () => {
    render(
      <ActionBar
        start={<div data-testid="ruler" />}
        end={<button>Apply to Spotify</button>}
      />,
    );
    const start = screen.getByTestId("ruler").parentElement!;
    expect(start.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(start.className).not.toMatch(/shrink-0/);
    expect(start.className).toMatch(/\[&>\*\]:max-w-full/);
    const end = screen.getByRole("button", { name: "Apply to Spotify" })
      .parentElement!;
    expect(end.className).toMatch(/(^|\s)shrink-0(\s|$)/);
  });

  // One height whatever the controls, so scroll padding and sticky offsets
  // can read one token.
  it("is always the strip token's height", () => {
    const { container } = render(<ActionBar end={<button>Scan</button>} />);
    const bar = container.querySelector("[data-action-bar]")!;
    expect(bar.className).toMatch(/(^|\s)h-strip(\s|$)/);
  });
});

describe("ActionStripSlot", () => {
  function Layout({ children }: { children: ReactNode }) {
    return (
      <ActionStripProvider>
        <nav aria-label="Site">nav</nav>
        <ActionStripSlot />
        <main>{children}</main>
      </ActionStripProvider>
    );
  }

  // Pages render the bar wherever they like; it always lands under the nav.
  it("pins the page's bar directly under the site nav", async () => {
    const { container } = render(
      <Layout>
        <p>content</p>
        <ActionBar status="Unsaved: 1 edited" end={<button>Classify</button>} />
      </Layout>,
    );
    const slot = container.querySelector("[data-action-strip-slot]")!;
    await waitFor(() =>
      expect(slot).toContainElement(
        screen.getByRole("button", { name: "Classify" }),
      ),
    );
    expect(slot.previousElementSibling).toBe(
      screen.getByRole("navigation", { name: "Site" }),
    );
    expect(screen.getByRole("main")).not.toContainElement(
      screen.getByRole("status"),
    );
    expect(container.querySelectorAll("[data-action-strip-slot]")).toHaveLength(1);
  });

  it("stays empty on a page without a bar", () => {
    const { container } = render(
      <Layout>
        <p>content</p>
      </Layout>,
    );
    expect(container.querySelector("[data-action-strip-slot]")).toBeEmptyDOMElement();
  });

  it("empties when the page that owns the bar goes away", async () => {
    const { container, rerender } = render(
      <Layout>
        <ActionBar end={<button>Scan</button>} />
      </Layout>,
    );
    const slot = container.querySelector("[data-action-strip-slot]")!;
    await waitFor(() => expect(slot).not.toBeEmptyDOMElement());
    rerender(<Layout>{null}</Layout>);
    expect(slot).toBeEmptyDOMElement();
  });

  // The server has no slot element to portal into; printing the bar in place
  // there would hydrate against a different tree. It prints a hidden claim
  // instead, which globals.css reads to hold the strip's room from first paint.
  it("prints only a hidden claim for the bar on the server", () => {
    const html = renderToString(
      <Layout>
        <ActionBar end={<button>Classify</button>} />
      </Layout>,
    );
    expect(html).toContain("data-action-strip-slot");
    expect(html).not.toContain("Classify");
    expect(html).toMatch(/<span[^>]*data-action-strip-claim[^>]*hidden/);
  });

  it("drops the claim once the bar is in the slot", async () => {
    const { container } = render(
      <Layout>
        <ActionBar end={<button>Classify</button>} />
      </Layout>,
    );
    await waitFor(() =>
      expect(
        container.querySelector("[data-action-strip-slot] [data-action-bar]"),
      ).not.toBeNull(),
    );
    expect(container.querySelector("[data-action-strip-claim]")).toBeNull();
  });
});
