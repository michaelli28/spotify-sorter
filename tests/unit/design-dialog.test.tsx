import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/src/components/design/Dialog";

// One frame for every modal. Before it, three of the four modals left keyboard
// focus behind the backdrop and ignored Escape (audit, primitives 1).

function Harness({
  onClose = () => {},
  withInitialFocus = false,
}: {
  onClose?: () => void;
  withInitialFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Late Night"
        description="12 tracks"
        initialFocus={withInitialFocus ? inputRef : undefined}
        actions={
          <>
            <button type="button">First action</button>
            <button type="button">Last action</button>
          </>
        }
      >
        <input ref={inputRef} aria-label="Search" />
      </Dialog>
    </>
  );
}

async function openHarness(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  return screen.getByRole("dialog");
}

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Hidden">
        body
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("body")).toBeNull();
  });

  it("is a modal dialog named by its title and described by its description", async () => {
    const dialog = await openHarness();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Late Night");
    expect(dialog).toHaveAccessibleDescription("12 tracks");
    expect(
      screen.getByRole("heading", { level: 2, name: "Late Night" }),
    ).toBeInTheDocument();
  });

  it("focuses the panel itself by default", async () => {
    const dialog = await openHarness();
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it("focuses initialFocus when given", async () => {
    await openHarness({ withInitialFocus: true });
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus(),
    );
  });

  it("keeps Tab inside the panel, wrapping both ways", async () => {
    const dialog = await openHarness();
    await waitFor(() => expect(dialog).toHaveFocus());

    await userEvent.tab();
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Last action" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last action" })).toHaveFocus();
  });

  it("closes on Escape, once", async () => {
    const onClose = vi.fn();
    await openHarness({ onClose });
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while closed", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open={false} onClose={onClose} title="Hidden">
        body
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click but not on a click inside the panel", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <p>Inside</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByText("Inside"));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts focus back on the control that opened it", async () => {
    await openHarness();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open" })).toHaveFocus(),
    );
  });

  // /apply opens its confirm on load, so there is no opener to hand focus back
  // to. Before this, the invisible exiting panel kept focus and clicks for
  // ~770ms: Escape → Tab → Enter still started the Spotify write.
  it("lets go of focus and clicks the moment it closes, while it fades out", async () => {
    const props = {
      onClose: () => {},
      title: "About to write to your Spotify account.",
      actions: <button type="button">Apply</button>,
    };
    const { rerender } = render(<Dialog open {...props} />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());
    screen.getByRole("button", { name: "Apply" }).focus();

    rerender(<Dialog open={false} {...props} />);

    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toContainElement(document.activeElement as HTMLElement);
    expect(dialog.closest("[inert]")).not.toBeNull();
  });

  // Exits are quicker than entrances; the overdamped spring took ~800ms.
  it("finishes leaving in the fade's time, not a spring's", async () => {
    const props = { onClose: () => {}, title: "T" };
    const { rerender } = render(<Dialog open {...props} />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog).toHaveStyle({ opacity: "1" }), {
      timeout: 2000,
    });
    rerender(<Dialog open={false} {...props} />);
    await waitFor(() => expect(dialog).not.toBeInTheDocument(), {
      timeout: 450,
    });
  });

  // The e2e test finds "Classify" behind an open cost modal; hiding the page
  // from the accessibility tree would make that button unfindable.
  it("leaves the rest of the page in the accessibility tree", async () => {
    await openHarness();
    const behind = screen.getByRole("button", { name: "Behind" });
    expect(behind).toBeInTheDocument();
    expect(behind.closest("[aria-hidden='true']")).toBeNull();
    expect(behind.closest("[inert]")).toBeNull();
  });
});
