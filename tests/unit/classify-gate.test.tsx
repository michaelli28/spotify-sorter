import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ClassifyGate } from "@/src/components/shared/ClassifyGate";
import { estimateClassifyCost } from "@/src/lib/llm/cost";

afterEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});

describe("ClassifyGate", () => {
  it("names the run by how many tracks it sorts", () => {
    render(<ClassifyGate unsorted={1234} />);
    expect(
      screen.getByRole("button", { name: "Sort 1,234 tracks" }),
    ).toBeInTheDocument();
  });

  it("says track, not tracks, for one", () => {
    render(<ClassifyGate unsorted={1} />);
    expect(
      screen.getByRole("button", { name: "Sort 1 track" }),
    ).toBeInTheDocument();
  });

  it("takes a caller's label", () => {
    render(<ClassifyGate unsorted={12} label="Sort the new tracks" />);
    expect(
      screen.getByRole("button", { name: "Sort the new tracks" }),
    ).toBeInTheDocument();
  });

  // /classify spends money as soon as it loads.
  it("shows the price before anything is spent", async () => {
    render(<ClassifyGate unsorted={297} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Sort 297 tracks" }),
    );
    const { low, high } = estimateClassifyCost(297);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(
      new RegExp(`\\$${low.toFixed(2)}.*\\$${high.toFixed(2)}`),
    );
    expect(dialog).toHaveAccessibleDescription(/297 tracks/);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("closes on Not yet without going anywhere", async () => {
    render(<ClassifyGate unsorted={297} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Sort 297 tracks" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("opens /classify on Proceed", async () => {
    render(<ClassifyGate unsorted={297} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Sort 297 tracks" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/classify");
  });

  // The first compile of /classify can take seconds in dev. A live "Not yet"
  // in that window closed the price, but the paid run still started.
  it("puts the price away and cannot start twice once Proceed is pressed", async () => {
    render(<ClassifyGate unsorted={297} />);
    const trigger = screen.getByRole("button", { name: "Sort 297 tracks" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toBeDisabled();
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
