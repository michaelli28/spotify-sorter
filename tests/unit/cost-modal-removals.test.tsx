import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";

// The confirm button carries a price, but the same click also deletes any
// category removed in the editor — and that breaks the labelling page until
// definitions.md matches. Deleting things is not something to discover after.

afterEach(cleanup);

const base = {
  open: true as const,
  estimateUsd: { low: 0, high: 0 },
  message: "All tracks are already classified.",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("CostPreviewModal", () => {
  it("names the categories a save would delete", () => {
    render(
      <CostPreviewModal
        {...base}
        removing={[
          { id: "c1", name: "Dream Pop" },
          { id: "c2", name: "Trance" },
        ]}
      />,
    );
    expect(screen.getByText(/deletes 2 categories/)).toBeTruthy();
    expect(screen.getByText(/Dream Pop, Trance/)).toBeTruthy();
    expect(screen.getByText(/definitions\.md/)).toBeTruthy();
  });

  it("says nothing about deletions when none are pending", () => {
    render(<CostPreviewModal {...base} removing={[]} />);
    expect(screen.queryByText(/deletes/)).toBeNull();
  });
});
