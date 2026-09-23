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
