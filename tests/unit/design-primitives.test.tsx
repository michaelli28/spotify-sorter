import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Field, Input } from "@/src/components/design/Input";
import { Card, surfaceClass } from "@/src/components/design/Card";
import { TrackRow } from "@/src/components/design/TrackRow";
import { PageShell } from "@/src/components/design/PageShell";
import { ProgressBand } from "@/src/components/design/ProgressBand";
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

  // Danger at rest, ink while focused: otherwise a focused invalid field looks
  // exactly like an unfocused one (its outline is off).
  it("still shows focus once a value was rejected", () => {
    render(<Input label="Key" error="Rejected." />);
    const field = screen.getByLabelText("Key");
    expect(field.className).toMatch(/focus:outline-none/);
    expect(field.className).toMatch(/(^|\s)border-danger(\s|$)/);
    expect(field.className).toMatch(/(^|\s)focus:border-ink(\s|$)/);
  });

  it("describes the field with its hint, then its error", () => {
    render(<Input label="Client ID" hint="32 characters" error="Too short." />);
    expect(screen.getByLabelText("Client ID")).toHaveAccessibleDescription(
      "32 characters Too short.",
    );
  });

  // Brief §5: every control a 44px target. The underline input measured 42.
  it("gives the underline input a 44px target", () => {
    render(<Input label="Filter" />);
    expect(screen.getByLabelText("Filter")).toHaveClass("min-h-11");
  });
});

describe("Field", () => {
  // Textareas and custom controls get the same label, hint and error wiring.
  it("labels and describes whatever control it wraps", () => {
    render(
      <Field label="Description" hint="One or two lines." error="Too long.">
        {(control) => <textarea {...control} />}
      </Field>,
    );
    const box = screen.getByRole("textbox", { name: "Description" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("One or two lines. Too long.");
    expect(screen.getByRole("alert")).toHaveTextContent("Too long.");
  });

  it("stays quiet with no error", () => {
    render(<Field label="Name">{(control) => <input {...control} />}</Field>);
    const box = screen.getByRole("textbox", { name: "Name" });
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
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

  // Liner notes: the art square sits before the title, and never names itself.
  it("prints a media slot for art before the title", () => {
    render(
      <ul>
        <TrackRow
          title="drive"
          artist="Current Blue"
          media={<svg aria-hidden="true" data-testid="art" />}
        />
      </ul>,
    );
    const art = screen.getByTestId("art");
    expect(screen.getByRole("listitem")).toContainElement(art);
    expect(
      art.compareDocumentPosition(screen.getByText("drive")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  // The title line is 22px; brief §5 asks 44. The link's ::after spans the
  // positioned row, so the whole row is the target, and a trailing control
  // sits above that overlay so it stays clickable.
  it("makes the whole row the link's target, trailing control above it", () => {
    render(
      <ul>
        <TrackRow
          title="Nights"
          artist="Frank Ocean"
          href="spotify:track:1"
          trailing={<button type="button">Move</button>}
        />
      </ul>,
    );
    expect(screen.getByRole("listitem")).toHaveClass("relative");
    expect(screen.getByRole("link", { name: "Nights" })).toHaveClass(
      "after:absolute",
      "after:inset-0",
    );
    expect(screen.getByRole("button", { name: "Move" }).parentElement).toHaveClass(
      "relative",
      "z-[1]",
    );
  });

  it("stays a plain row without an href", () => {
    render(
      <ul>
        <TrackRow title="Nights" artist="Frank Ocean" />
      </ul>,
    );
    expect(screen.getByRole("listitem")).not.toHaveClass("relative");
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

  // The ghost recipe is inline-flex with a gap: each flex child took its own
  // underline and the gap broke it, so arrow and label read as two links. One
  // child, the arrow an inline-block (an underline doesn't reach into one).
  it("underlines the back link in one piece", () => {
    render(
      <PageShell title="Apply failed." back={{ href: "/", label: "Home" }}>
        body
      </PageShell>,
    );
    const link = screen.getByRole("link", { name: "Home" });
    expect(link.children).toHaveLength(1);
    const arrow = link.querySelector("[aria-hidden]");
    expect(arrow).toHaveTextContent("←");
    expect(arrow).toHaveClass("inline-block");
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

// The strip's ink band while a run writes (classify, apply): one component.
describe("ProgressBand", () => {
  it("reports its value to assistive tech", () => {
    render(<ProgressBand value={3} total={12} label="Playlists written" />);
    const bar = screen.getByRole("progressbar", { name: "Playlists written" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "12");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
  });

  it("never reports more than the total", () => {
    render(<ProgressBand value={15} total={12} label="Sorting" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "12",
    );
  });

  it("is indeterminate while the total is unknown", () => {
    render(<ProgressBand value={0} total={0} label="Sorting" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).not.toHaveAttribute("aria-valuemax");
  });

  it("takes its width from the caller", () => {
    render(<ProgressBand value={1} total={2} label="Sorting" className="w-28" />);
    expect(screen.getByRole("progressbar")).toHaveClass("w-28");
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
