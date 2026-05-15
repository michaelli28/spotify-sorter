import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/src/components/design/Button";

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
});
