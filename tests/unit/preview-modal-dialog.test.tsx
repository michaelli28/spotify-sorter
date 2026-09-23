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

describe("PlaylistPreviewModal staleness", () => {
  it("never shows one playlist's tracks under another's name", async () => {
    // Switching playlists while the modal stays open must not leave the
    // previous list on screen under the new title, even for one frame.
    let release: ((v: unknown) => void) | null = null;
    const pending = new Promise((r) => {
      release = r;
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("p2")) {
        await pending;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tracks: [{ id: "t2", title: "Beta", artist_name: "Artist Two" }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [{ id: "t1", title: "Alpha", artist_name: "Artist One" }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="First"
        onClose={vi.fn()}
      />,
    );
    await screen.findByText("Alpha");

    rerender(
      <PlaylistPreviewModal
        open
        playlistId="p2"
        title="Second"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();

    release!(null);
    await screen.findByText("Beta");
  });
});
