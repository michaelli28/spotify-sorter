import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));

import { ActionBar } from "@/src/components/design/ActionBar";

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

  // The bar is fixed, so without this the page's last rows sit under it.
  it("reserves its own height in the page flow", () => {
    const { container } = render(<ActionBar end={<button>Scan</button>} />);
    const spacer = container.querySelector("[data-action-bar-spacer]");
    const bar = container.querySelector("[data-action-bar]");
    expect(spacer).toHaveAttribute("aria-hidden", "true");
    expect(bar).not.toBeNull();
    const heights = (el: Element) =>
      el.className
        .split(/\s+/)
        .filter((c) => /(^|:)h-/.test(c))
        .sort();
    expect(heights(spacer!).length).toBeGreaterThan(0);
    expect(heights(spacer!)).toEqual(heights(bar!));
  });

  it("appears at once under reduced motion", async () => {
    motion.reduced = true;
    const { container } = render(<ActionBar end={<button>Scan</button>} />);
    const bar = container.querySelector("[data-action-bar]") as HTMLElement;
    await waitFor(() => expect(bar.style.opacity).toBe("1"), { timeout: 100 });
  });

  it("rises in otherwise", async () => {
    const { container } = render(<ActionBar end={<button>Scan</button>} />);
    const bar = container.querySelector("[data-action-bar]") as HTMLElement;
    expect(bar.style.opacity).toBe("0");
    expect(bar.style.transform).toMatch(/translateY/);
  });
});
