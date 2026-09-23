import { describe, it, expect, vi } from "vitest";
import type { FormEvent } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Button,
  ButtonLink,
  buttonClass,
} from "@/src/components/design/Button";

describe("Button", () => {
  it("renders text content", () => {
    render(<Button>Connect Spotify</Button>);
    expect(
      screen.getByRole("button", { name: "Connect Spotify" }),
    ).toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    let clicks = 0;
    render(
      <Button
        onClick={() => {
          clicks++;
        }}
      >
        Tap
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(clicks).toBe(1);
  });

  it("respects disabled state", () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("exposes a primary and ghost variant", () => {
    render(
      <>
        <Button variant="primary">P</Button>
        <Button variant="ghost">G</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "P" })).toHaveAttribute(
      "data-variant",
      "primary",
    );
    expect(screen.getByRole("button", { name: "G" })).toHaveAttribute(
      "data-variant",
      "ghost",
    );
  });

  it("exposes a danger variant for destructive actions", () => {
    render(<Button variant="danger">Wipe</Button>);
    expect(screen.getByRole("button", { name: "Wipe" })).toHaveAttribute(
      "data-variant",
      "danger",
    );
  });

  it("exposes quiet, icon and danger-confirm variants", () => {
    render(
      <>
        <Button variant="quiet">Q</Button>
        <Button variant="icon" aria-label="Next category (smaller)">
          ›
        </Button>
        <Button variant="danger-confirm">Wipe & re-propose</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Q" })).toHaveAttribute(
      "data-variant",
      "quiet",
    );
    expect(
      screen.getByRole("button", { name: "Next category (smaller)" }),
    ).toHaveAttribute("data-variant", "icon");
    expect(
      screen.getByRole("button", { name: "Wipe & re-propose" }),
    ).toHaveAttribute("data-variant", "danger-confirm");
  });

  // ghost keeps its name for the pages already using it; it is the brief's
  // quiet .is-2, for lower-stakes routes.
  it("sets ghost as the quiet button in ink-2", () => {
    const classes = (v: Parameters<typeof buttonClass>[0]) =>
      buttonClass(v).split(/\s+/);
    expect(classes({ variant: "ghost" })).toContain("text-ink-2");
    expect(classes({ variant: "quiet" })).toContain("text-ink");
    expect(classes({ variant: "quiet" })).not.toContain("text-ink-2");
  });

  // The signature: the ink keyline is printed 4px out of register and only
  // pulls in when the button can actually be pressed.
  it("pulls the primary's keyline into register on hover and focus only", () => {
    const primary = buttonClass({ variant: "primary" }).split(/\s+/);
    expect(primary).toContain("after:translate-1");
    expect(primary).toContain("not-disabled:hover:after:translate-0");
    expect(primary).toContain("focus-visible:after:translate-0");
    expect(primary).toContain("whitespace-nowrap");
  });

  // A bare <button> inside a <form> submits it; the setup form wraps several.
  it("does not submit a surrounding form unless asked to", async () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Back</Button>
        <Button type="submit">Continue</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("uses the shared recipe, so a button and a link of one variant match", () => {
    render(
      <Button variant="ghost" size="sm">
        B
      </Button>,
    );
    expect(screen.getByRole("button", { name: "B" }).className).toBe(
      buttonClass({ variant: "ghost", size: "sm" }),
    );
  });

  it("gives sm and md different recipes", () => {
    expect(buttonClass({ size: "sm" })).not.toBe(buttonClass({ size: "md" }));
  });

  // "Checking…" on a faded primary measured ~2:1, and that label is the only
  // visible sign work is running: busy locks the button without the fade.
  it("locks a busy button without fading its label", () => {
    render(
      <>
        <Button busy>Checking…</Button>
        <Button disabled>Off</Button>
      </>,
    );
    const busy = screen.getByRole("button", { name: "Checking…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Off" })).not.toHaveAttribute(
      "aria-busy",
    );
    const primary = buttonClass({ variant: "primary" }).split(/\s+/);
    expect(primary).toContain("not-aria-busy:disabled:opacity-50");
    expect(primary).not.toContain("disabled:opacity-50");
  });

  // A locked Back beside a faded Save read as live: every variant fades.
  it.each(["quiet", "ghost", "danger"] as const)(
    "fades a disabled %s button like the printed ones, and gives it a 44px target",
    (variant) => {
      const classes = buttonClass({ variant }).split(/\s+/);
      expect(classes).toContain("not-aria-busy:disabled:opacity-50");
      expect(classes).toContain("min-h-11");
      expect(classes).toContain("min-w-11");
    },
  );

  // /label prints in navy only; it used to borrow danger-confirm's recipe.
  it("has an ink variant: a printed button in navy, keyline snapping into register", () => {
    render(<Button variant="ink">Save</Button>);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("data-variant", "ink");
    const classes = save.className.split(/\s+/);
    expect(classes).toContain("after:translate-1");
    expect(classes).toContain("after:border-ink");
    expect(classes).toContain("after:transition-none");
    expect(classes).toContain("text-ink");
    expect(classes.some((c) => c.includes("danger"))).toBe(false);
  });
});

describe("ButtonLink", () => {
  it("is a link, not a button inside a link", () => {
    render(
      <ButtonLink href="/scope" variant="ghost" size="sm">
        Sources
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Sources" });
    expect(link).toHaveAttribute("href", "/scope");
    expect(link).toHaveAttribute("data-variant", "ghost");
    expect(link.className).toBe(buttonClass({ variant: "ghost", size: "sm" }));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("appends a caller className to the recipe", () => {
    render(
      <ButtonLink href="/" className="mt-4">
        Home
      </ButtonLink>,
    );
    expect(screen.getByRole("link", { name: "Home" }).className).toBe(
      buttonClass({ className: "mt-4" }),
    );
  });
});
