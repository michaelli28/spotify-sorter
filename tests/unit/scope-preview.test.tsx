import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaylistPreviewModal } from "@/src/components/scope/PlaylistPreviewModal";

afterEach(() => vi.unstubAllGlobals());

const TRACKS = {
  tracks: [{ id: "t1", title: "Nights", artist_name: "Frank Ocean" }],
};

function stubFetch(...replies: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn(async () => {
    const next = replies.length > 1 ? replies.shift()! : replies[0]!;
    return {
      ok: next.status < 400,
      status: next.status,
      json: async () => next.body,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PlaylistPreviewModal on /scope", () => {
  // A playlist of local files: Spotify counts 3, a scan reads none. Before:
  // "This playlist is empty." under a row that said 3 tracks.
  it("says a scan can't read it, not that it's empty, when Spotify counts more", async () => {
    stubFetch({ status: 200, body: { tracks: [] } });
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="Tapes"
        total={3}
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("A scan can't read any of its tracks."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 3 tracks")).toBeInTheDocument();
    expect(screen.queryByText("This playlist is empty.")).toBeNull();
  });

  it("says empty, with a plain count, when nothing is missing", async () => {
    stubFetch({ status: 200, body: { tracks: [] } });
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="New"
        total={0}
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("This playlist is empty."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 tracks")).toBeInTheDocument();
  });

  // Before: "Couldn't load tracks: HTTP 500" with Close as the only way on.
  it("offers Try again when Spotify fails, and asks again", async () => {
    const fetchMock = stubFetch(
      { status: 500, body: { error: "Spotify said 503" } },
      { status: 200, body: TRACKS },
    );
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="Late Night"
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("Spotify didn't send this playlist."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nights")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Spotify didn't send this playlist.")).toBeNull();
  });

  it("leaves out a selected playlist from the preview", async () => {
    stubFetch({ status: 200, body: TRACKS });
    const onToggle = vi.fn();
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="Late Night"
        selected
        onToggle={onToggle}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Leave out" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("includes a left-out playlist from the preview", () => {
    stubFetch({ status: 200, body: TRACKS });
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="Late Night"
        selected={false}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Include" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave out" })).toBeNull();
  });

  it("keeps the toggle visible but unusable while the choice is held", async () => {
    stubFetch({ status: 200, body: TRACKS });
    const onToggle = vi.fn();
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="Late Night"
        selected
        onToggle={onToggle}
        toggleDisabled
        onClose={vi.fn()}
      />,
    );
    const leaveOut = screen.getByRole("button", { name: "Leave out" });
    expect(leaveOut).toBeDisabled();
    await userEvent.click(leaveOut);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("offers no toggle when the caller gives it nothing to toggle", () => {
    stubFetch({ status: 200, body: TRACKS });
    render(
      <PlaylistPreviewModal
        open
        playlistId="p1"
        title="Late Night"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Include|Leave out/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
