import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";

// The confirm on /review saves more than a price: renames break /label the way
// deletions do, and a destructive confirm must not look like Proceed.

const base = {
  open: true as const,
  estimateUsd: { low: 0.1, high: 0.14 },
  message: "Claude proposes new categories.",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("CostPreviewModal on /review", () => {
  it("names each rename, old name to new", () => {
    render(
      <CostPreviewModal
        {...base}
        renaming={[{ id: "a", from: "Emo Rap Heartbreak", to: "Emo Rap" }]}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Renames 1 category/)).toBeInTheDocument();
    expect(
      within(dialog).getByText("Emo Rap Heartbreak → Emo Rap"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/definitions\.md/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/deletes/)).toBeNull();
  });

  it("explains definitions.md once when it both deletes and renames", () => {
    render(
      <CostPreviewModal
        {...base}
        removing={[{ id: "c", name: "Trance" }]}
        renaming={[{ id: "a", from: "Emo Rap Heartbreak", to: "Emo Rap" }]}
      />,
    );
    expect(screen.getAllByText(/definitions\.md/)).toHaveLength(1);
  });

  // /label throws on any category without a heading, a new one included.
  it("warns that /label needs a heading for a new category", () => {
    render(<CostPreviewModal {...base} adding={1} />);
    expect(
      within(screen.getByRole("dialog")).getByText(/definitions\.md/),
    ).toBeInTheDocument();
  });

  it("says nothing about definitions.md when no name changes", () => {
    render(<CostPreviewModal {...base} adding={0} />);
    expect(screen.queryByText(/definitions\.md/)).toBeNull();
  });

  it("prints the notes it is given", () => {
    render(
      <CostPreviewModal
        {...base}
        notes={["Placed tracks stay where they are."]}
      />,
    );
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Placed tracks stay where they are.",
      ),
    ).toBeInTheDocument();
  });

  // Enter on a destructive confirm should not be one keystroke from a wipe.
  it("draws a destructive confirm in rust and starts focus on Not yet", async () => {
    render(
      <CostPreviewModal
        {...base}
        confirmLabel="Wipe & re-propose"
        confirmVariant="danger"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Wipe & re-propose" }),
    ).toHaveAttribute("data-variant", "danger");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Not yet" })).toHaveFocus(),
    );
  });
});
