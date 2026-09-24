import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";
import { TrackSearchModal } from "@/src/components/review/TrackSearchModal";
import { PlaylistPreviewModal } from "@/src/components/scope/PlaylistPreviewModal";

// Before the shared Dialog, the cost and track-search modals had no dialog
// role, ignored Escape and left focus behind the backdrop. (/apply's confirm
// is now the page itself: tests/unit/apply-page.test.tsx.)

describe("CostPreviewModal", () => {
  function renderCost(onCancel = vi.fn()) {
    render(
      <CostPreviewModal
        open
        estimateUsd={{ low: 0.4, high: 0.55 }}
        message="About to classify 12 new tracks."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    return onCancel;
  }

  it("is a modal dialog named for the estimate", () => {
    renderCost();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/\$0\.40.*\$0\.55/);
  });

  it("confirms with Proceed by default", () => {
    renderCost();
    expect(screen.getByRole("button", { name: "Proceed" })).toBeInTheDocument();
  });

  it("cancels on Escape", async () => {
    const onCancel = renderCost();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // Nothing to classify priced as "$0.00 — $0.00": one fact, printed twice.
  it("names one price when the range has collapsed", () => {
    render(
      <CostPreviewModal
        open
        estimateUsd={{ low: 0, high: 0.001 }}
        message="Nothing new to classify."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // jsdom drops the sr-only span's trailing space; browsers keep it.
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      /^Estimated cost\s?\$0\.00$/,
    );
  });
});

describe("TrackSearchModal", () => {
  const lookup = {
    t1: { id: "t1", title: "Nights", artist_name: "Frank Ocean" },
    t2: { id: "t2", title: "Ivy", artist_name: "Frank Ocean" },
  };

  function renderSearch(onAdd = vi.fn(), onClose = vi.fn()) {
    render(
      <TrackSearchModal
        open
        categoryName="Late Night"
        trackLookup={lookup}
        alreadyInCategory={new Set(["t2"])}
        onClose={onClose}
        onAdd={onAdd}
      />,
    );
    return { onAdd, onClose };
  }

  it("is a modal dialog named for its category, with the search focused", async () => {
    renderSearch();
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      /Add examples to Late Night/,
    );
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: /Search/ })).toHaveFocus(),
    );
  });

  it("adds the picked tracks", async () => {
    const { onAdd, onClose } = renderSearch();
    const add = screen.getByRole("button", { name: /^Add/ });
    expect(add).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Nights/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Add 1 example" }),
    );
    expect(onAdd).toHaveBeenCalledWith(["t1"]);
    expect(onClose).toHaveBeenCalled();
  });

  // The tick marks songs already among the examples, not songs sorted into
  // the category.
  it("announces a song that is already an example as one", () => {
    renderSearch();
    expect(
      screen.getByRole("button", { name: /Ivy.*already an example/ }),
    ).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { onClose } = renderSearch();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PlaylistPreviewModal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts a one-track playlist as 1 track", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [{ id: "t1", title: "Nights", artist_name: "Frank Ocean" }],
        }),
      })),
    );
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="Late Night"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveAccessibleDescription("1 track"),
    );
  });
});
