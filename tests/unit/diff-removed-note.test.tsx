import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));

import { RemovedNote } from "@/src/components/diff/RemovedNote";

type Diff = {
  added: string[];
  removed: string[];
  removed_examples: string[];
  existing_category_count: number;
  is_first_run: boolean;
};

const ids = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `r${from + i}`);

function diff(removed: number, examples: string[], added = 0): Diff {
  return {
    added: ids(added, 1000),
    removed: ids(removed),
    removed_examples: examples,
    existing_category_count: 41,
    is_first_run: false,
  };
}

const EXAMPLES = ["Without Me", "Heat Waves", "Pink + White", "Ivy", "Nights"];

// Each call takes the next reply; the last one repeats. "hang" never answers.
function stubDiff(...replies: Array<Diff | number | "hang">) {
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    urls.push(String(input));
    const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
    if (reply === "hang") return new Promise<Response>(() => {});
    return Promise.resolve(
      typeof reply === "number"
        ? new Response("boom", { status: reply })
        : new Response(JSON.stringify(reply), { status: 200 }),
    );
  });
  return urls;
}

// The inline style an element is inserted with, before any animation frame:
// what a reader sees for the first frame.
function firstFrameOf(container: HTMLElement, text: string) {
  const frames: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records)
      for (const node of r.addedNodes)
        if (node instanceof HTMLElement && node.textContent === text)
          frames.push(node.getAttribute("style") ?? "");
  });
  observer.observe(container, { childList: true, subtree: true });
  return { frames, stop: () => observer.disconnect() };
}

afterEach(() => {
  vi.restoreAllMocks();
  motion.reduced = false;
});

describe("RemovedNote", () => {
  it("says it is checking while Spotify is read", async () => {
    stubDiff("hang");
    render(<RemovedNote prefix="✨" applied={false} />);
    expect(
      screen.getByText("Checking Spotify for removed tracks…"),
    ).toBeInTheDocument();
  });

  // `added` is ~always empty after a scan (the scan already saved the new
  // tracks), so the note never reports it.
  it("goes quiet when nothing was removed, whatever it says was added", async () => {
    stubDiff(diff(0, [], 297));
    const { container } = render(<RemovedNote prefix="✨" applied={false} />);
    await waitFor(() =>
      expect(
        screen.queryByText("Checking Spotify for removed tracks…"),
      ).toBeNull(),
    );
    expect(container).toHaveTextContent(/^$/);
  });

  // Before the first Apply there are no ✨ playlists to keep anything.
  it("counts removed tracks and says nothing about playlists that don't exist yet", async () => {
    stubDiff(diff(12, EXAMPLES));
    render(<RemovedNote prefix="✨" applied={false} />);
    expect(
      await screen.findByText("12 tracks are no longer in your sources."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/playlists/)).toBeNull();
  });

  // apply.ts only creates playlists and adds to them. It can't promise a
  // removed track is in one (unsorted, or under the threshold), only that
  // Apply won't take it out.
  it("says Apply never takes tracks out once the playlists exist", async () => {
    stubDiff(diff(12, EXAMPLES));
    render(<RemovedNote prefix="✨" applied />);
    expect(
      await screen.findByText(
        "12 tracks are no longer in your sources. Apply never takes tracks out of your ✨ playlists.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/keep/)).toBeNull();
  });

  // The route names at most 5; the old banner showed 3 and said "+2 more"
  // when 9 more were gone.
  it("counts the removed tracks it doesn't name", async () => {
    stubDiff(diff(12, EXAMPLES));
    render(<RemovedNote prefix="✨" applied={false} />);
    const first = await screen.findByText("Without Me");
    expect(first.closest("p")).toHaveTextContent(
      /^Without Me, Heat Waves, Pink \+ White, Ivy, Nights and 7 more\.$/,
    );
  });

  // Titles carry their own commas; set in the title weight, each one reads as
  // a song and the separators read as the list. The note stays in ink-2.
  it("sets each removed title apart from the commas between them", async () => {
    stubDiff(diff(2, ["my ex's best friend (with blackbear)", "Ivy"]));
    render(<RemovedNote prefix="✨" applied={false} />);
    const title = await screen.findByText(
      "my ex's best friend (with blackbear)",
    );
    expect(title).toHaveClass("font-semibold");
    expect(screen.getByText("Ivy")).toHaveClass("font-semibold");
    expect(title.closest("p")).toHaveTextContent(
      /^my ex's best friend \(with blackbear\), Ivy\.$/,
    );
  });

  it("says no more when it names every removed track", async () => {
    stubDiff(diff(2, ["Without Me", "Ivy"]));
    render(<RemovedNote prefix="✨" applied={false} />);
    const first = await screen.findByText("Without Me");
    expect(first.closest("p")).toHaveTextContent(/^Without Me, Ivy\.$/);
  });

  it("says track, not tracks, for one", async () => {
    stubDiff(diff(1, ["Ivy"]));
    render(<RemovedNote prefix="✨" applied={false} />);
    expect(
      await screen.findByText("1 track is no longer in your sources."),
    ).toBeInTheDocument();
  });

  it("names the prefix the playlists actually use", async () => {
    stubDiff(diff(3, ["Ivy"]));
    render(<RemovedNote prefix="🎧" applied />);
    expect(
      await screen.findByText(
        /Apply never takes tracks out of your 🎧 playlists\./,
      ),
    ).toBeInTheDocument();
  });

  it("offers to try again when Spotify can't be read, and re-reads only the diff", async () => {
    const urls = stubDiff(500, diff(2, ["Without Me", "Ivy"]));
    render(<RemovedNote prefix="✨" applied={false} />);

    expect(
      await screen.findByText("Couldn’t check Spotify for removed tracks."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HTTP|500/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(/^2 tracks are no longer in your sources/),
    ).toBeInTheDocument();
    expect(urls).toEqual(["/api/spotify/diff", "/api/spotify/diff"]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
    );
  });

  // Try again unmounts itself; focus must land somewhere a keyboard user
  // can carry on from, not fall back to <body>.
  it("keeps keyboard focus in the note after Try again", async () => {
    stubDiff(500, "hang");
    render(<RemovedNote prefix="✨" applied={false} />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    retry.focus();
    await userEvent.keyboard("{Enter}");

    const checking = await screen.findByText(
      "Checking Spotify for removed tracks…",
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
    );
    expect(checking.closest("[aria-live='polite']")).toHaveFocus();
  });

  // Nothing moves under reduced motion, not even for one frame.
  it("swaps its line in at rest under reduced motion", async () => {
    motion.reduced = true;
    stubDiff(500, "hang");
    const { container } = render(<RemovedNote prefix="✨" applied={false} />);
    const retry = await screen.findByRole("button", { name: "Try again" });

    const watch = firstFrameOf(
      container,
      "Checking Spotify for removed tracks…",
    );
    await userEvent.click(retry);
    await screen.findByText("Checking Spotify for removed tracks…");
    watch.stop();
    expect(watch.frames).toHaveLength(1);
    expect(watch.frames[0]).not.toMatch(/opacity:\s*0[;\s]|translate/);
  });

  it("is a polite live region, so the late answer is announced", () => {
    stubDiff("hang");
    render(<RemovedNote prefix="✨" applied={false} />);
    expect(
      screen
        .getByText("Checking Spotify for removed tracks…")
        .closest("[aria-live='polite']"),
    ).not.toBeNull();
  });
});
