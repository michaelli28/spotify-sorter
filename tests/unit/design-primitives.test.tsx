import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Input } from "@/src/components/design/Input";
import { Card, surfaceClass } from "@/src/components/design/Card";
import { TrackRow } from "@/src/components/design/TrackRow";
import { PageShell } from "@/src/components/design/PageShell";
import { ProgressBar } from "@/src/components/scan/ProgressBar";
import { ThinkingIndicator } from "@/src/components/shared/ThinkingIndicator";

afterEach(() => {
  vi.useRealTimers();
});

describe("Input", () => {
  it("links a rejected value's message to the field", () => {
    render(<Input label="Anthropic API Key" error="That key was rejected." />);
    const field = screen.getByLabelText("Anthropic API Key");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("That key was rejected.");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That key was rejected.",
    );
  });

  it("stays quiet with no error", () => {
    render(<Input label="Client ID" />);
    expect(screen.getByLabelText("Client ID")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a caller's aria-describedby alongside the error", () => {
    render(
      <>
        <p id="hint">Starts with sk-ant-</p>
        <Input label="Key" aria-describedby="hint" error="Rejected." />
      </>,
    );
    expect(screen.getByLabelText("Key")).toHaveAccessibleDescription(
      "Starts with sk-ant- Rejected.",
    );
  });

  // Rust at rest, brass while focused: otherwise a focused invalid field looks
  // exactly like an unfocused one (its outline is off).
  it("still shows focus once a value was rejected", () => {
    render(<Input label="Key" error="Rejected." />);
    const field = screen.getByLabelText("Key");
    expect(field.className).toMatch(/focus:outline-none/);
    expect(field.className).toMatch(/focus:border-\[var\(--color-accent\)\]/);
  });
});

describe("Card", () => {
  // Hover feedback promises a click; a static card must not make it.
  it("only brightens on hover when interactive", () => {
    expect(surfaceClass(false)).not.toMatch(/hover:/);
    expect(surfaceClass(true)).toMatch(/hover:/);
    render(<Card data-testid="static">x</Card>);
    expect(screen.getByTestId("static").className).not.toMatch(/hover:/);
  });

  it("does not leak the interactive flag onto the DOM", () => {
    render(
      <Card interactive data-testid="card">
        x
      </Card>,
    );
    expect(screen.getByTestId("card")).not.toHaveAttribute("interactive");
  });
});

describe("TrackRow", () => {
  it("prints index, title and artist", () => {
    render(
      <ol>
        <TrackRow index={7} title="Nights" artist="Frank Ocean" />
      </ol>,
    );
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("7");
    expect(row).toHaveTextContent("Nights");
    expect(row).toHaveTextContent("Frank Ocean");
  });

  it("links the title when given an href", () => {
    render(
      <ul>
        <TrackRow title="Nights" artist="Frank Ocean" href="spotify:track:1" />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Nights" })).toHaveAttribute(
      "href",
      "spotify:track:1",
    );
  });

  it("renders trailing content", () => {
    render(
      <ul>
        <TrackRow
          title="Nights"
          artist="Frank Ocean"
          trailing={<button type="button">Move</button>}
        />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
  });
});

describe("PageShell", () => {
  it("sets the title as the page heading", () => {
    render(<PageShell title="Tune the fit.">body</PageShell>);
    expect(
      screen.getByRole("heading", { level: 1, name: "Tune the fit." }),
    ).toBeInTheDocument();
  });

  it("renders a back link named by its label, arrow hidden", () => {
    render(
      <PageShell title="Apply failed." back={{ href: "/", label: "Home" }}>
        body
      </PageShell>,
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  // SiteNav sits above <main>; a full-viewport main made every short page
  // scroll by the nav's height.
  it("leaves the page's height to its content", () => {
    render(<PageShell title="Your library is unchanged.">body</PageShell>);
    expect(screen.getByRole("main")).not.toHaveClass("min-h-screen");
  });

  it("renders no header when there is nothing to put in it", () => {
    render(<PageShell>body</PageShell>);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("ProgressBar", () => {
  it("reports its value to assistive tech", () => {
    render(<ProgressBar value={3} total={12} label="Scan progress" />);
    const bar = screen.getByRole("progressbar", { name: "Scan progress" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "12");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
  });

  it("never reports more than the total", () => {
    render(<ProgressBar value={15} total={12} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "12",
    );
  });

  it("is indeterminate while the total is unknown", () => {
    render(<ProgressBar value={0} total={0} />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
  });
});

describe("ThinkingIndicator", () => {
  it("counts elapsed time and tokens", () => {
    vi.useFakeTimers();
    render(<ThinkingIndicator message="Proposing" outputTokens={1200} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/3s elapsed/)).toHaveTextContent(
      "1,200 tokens generated",
    );
  });

  // An endless sweep reads as progress it cannot measure; the brief bans it.
  it("draws no progress-like bar", () => {
    render(<ThinkingIndicator message="Proposing" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(document.querySelector(".h-px")).toBeNull();
  });
});
