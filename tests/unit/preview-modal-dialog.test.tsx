import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaylistPreviewModal } from "@/src/components/scope/PlaylistPreviewModal";

// The preview is the only modal a keyboard user meets on /scope. Without
// Escape and dialog semantics they are stuck: focus never enters the panel, so
// Tab walks the page behind the backdrop with nothing visible to return to.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubTracks() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tracks: [{ id: "t1", title: "Alpha", artist_name: "Artist One" }],
      }),
    })),
  );
}

function open(onClose = vi.fn()) {
  stubTracks();
  render(
    <PlaylistPreviewModal
      open
      playlistId="p1"
      title="Late Night"
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("PlaylistPreviewModal", () => {
  it("closes on Escape", async () => {
    const onClose = open();
    await screen.findByText("Alpha");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is announced as a modal dialog labelled by its title", async () => {
    open();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The accessible name has to come from the visible title, not a guess.
    expect(dialog).toHaveAccessibleName(/Late Night/);
  });

  it("moves focus into the panel so Tab cannot escape behind the backdrop", async () => {
    open();
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it("does not close on Escape when it is not open", async () => {
    const onClose = vi.fn();
    stubTracks();
    render(
      <PlaylistPreviewModal
        open={false}
        playlistId="p1"
        title="Late Night"
        onClose={onClose}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
