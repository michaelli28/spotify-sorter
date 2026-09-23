import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import DiffPage from "@/app/diff/page";
import { estimateClassifyCost } from "@/src/lib/llm/cost";

type Reply = { status: number; body: unknown } | "hang";

// The page reads two routes; each call takes the next queued reply, and the
// last one repeats.
let queues: Record<string, Reply[]> = {};
let calls: string[] = [];

function stubFetch(replies: { cache: Reply[]; diff?: Reply[] }) {
  queues = {
    "/api/cache": replies.cache,
    "/api/spotify/diff": replies.diff ?? ["hang"],
  };
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    calls.push(url);
    const queue = queues[url];
    if (!queue) return Promise.reject(new Error(`unexpected fetch ${url}`));
    const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (reply === "hang") return new Promise<Response>(() => {});
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), { status: reply.status }),
    );
  });
}

const ok = (body: unknown): Reply => ({ status: 200, body });

// `unsorted` tracks get later first_seen stamps the higher their number, and
// are stored oldest first, so "newest first" is observable.
function library({
  sorted = 4,
  unsorted = 0,
  categories = 3,
  applied = 0,
  prefix = "✨",
}: {
  sorted?: number;
  unsorted?: number;
  categories?: number;
  /** How many categories already have a Spotify playlist. */
  applied?: number;
  prefix?: string;
} = {}) {
  const tracks: Record<string, unknown> = {};
  const artists: Record<string, unknown> = {};
  const assignments: Record<string, unknown> = {};
  for (let i = 0; i < sorted; i++) {
    tracks[`s${i}`] = {
      artist_id: `sa${i}`,
      title: `Old Song ${i}`,
      first_seen: "2026-01-01T00:00:00.000Z",
    };
    artists[`sa${i}`] = { name: `Old Artist ${i}`, genres: [] };
    assignments[`s${i}`] = {
      matches: [{ category_id: "c0", score: 80 }],
      classified_at: "2026-01-02T00:00:00.000Z",
      override: null,
    };
  }
  for (let i = 0; i < unsorted; i++) {
    tracks[`u${i}`] = {
      artist_id: `ua${i}`,
      title: `New Song ${i}`,
      first_seen: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
    };
    artists[`ua${i}`] = { name: `New Artist ${i}`, genres: [] };
  }
  const cats: Record<string, unknown> = {};
  for (let i = 0; i < categories; i++) {
    cats[`c${i}`] = {
      name: `Category ${i}`,
      description: "",
      spotify_playlist_id: i < applied ? `pl${i}` : null,
      created_at: "2026-01-01T00:00:00.000Z",
      example_track_ids: [],
    };
  }
  return {
    version: 2,
    auth: { has_token: true, expires_at: "2026-09-23T00:00:00.000Z" },
    config: { prefix, confidence_threshold: 60, anthropic_model: "haiku" },
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    artists,
    tracks,
    categories: cats,
    assignments,
    runs: [],
    playlist_snapshots: {},
    liked_songs_fingerprint: null,
  };
}

const diffCalls = () => calls.filter((u) => u === "/api/spotify/diff");

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("/diff", () => {
  it("shows the way forward as soon as the library is read, without waiting for Spotify", async () => {
    stubFetch({ cache: [ok(library())], diff: ["hang"] });
    render(<DiffPage />);

    expect(
      await screen.findByRole("heading", { name: "Nothing new to sort." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tune the fit" })).toHaveAttribute(
      "href",
      "/classify",
    );
    expect(
      screen.getByRole("link", { name: "Edit categories" }),
    ).toHaveAttribute("href", "/review");
    expect(
      screen.getByRole("link", { name: "Change sources" }),
    ).toHaveAttribute("href", "/scope");
    // The removed-tracks check is still out; it doesn't hold anything up.
    expect(
      screen.getByText("Checking Spotify for removed tracks…"),
    ).toBeInTheDocument();
  });

  // /api/spotify/diff compares against a cache the scan already updated, so
  // it can't know what is new; "unchanged" was shown after every re-scan.
  it("makes no claim about what changed since the last run", async () => {
    stubFetch({ cache: [ok(library())], diff: ["hang"] });
    render(<DiffPage />);
    await screen.findByRole("heading", { name: "Nothing new to sort." });
    expect(screen.queryByText(/since (the )?last run/i)).toBeNull();
    expect(screen.queryByText(/unchanged/i)).toBeNull();
  });

  // /classify starts a paid run on load for every track without a category.
  it("only reaches /classify past the price while tracks are unsorted", async () => {
    // Enough tracks that the range doesn't round to one price.
    stubFetch({ cache: [ok(library({ unsorted: 297 }))] });
    render(<DiffPage />);

    const sort = await screen.findByRole("button", { name: "Sort 297 tracks" });
    expect(screen.queryByRole("link", { name: "Tune the fit" })).toBeNull();
    expect(
      screen
        .queryAllByRole("link")
        .filter((a) => a.getAttribute("href") === "/classify"),
    ).toEqual([]);

    await userEvent.click(sort);
    const { low, high } = estimateClassifyCost(297);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      new RegExp(`\\$${low.toFixed(2)}.*\\$${high.toFixed(2)}`),
    );
    expect(router.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/classify");
  });

  it("keeps the quiet ways out while tracks are unsorted", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 3 }))] });
    render(<DiffPage />);
    await screen.findByRole("button", { name: "Sort 3 tracks" });
    expect(
      screen.getByRole("link", { name: "Edit categories" }),
    ).toHaveAttribute("href", "/review");
    expect(
      screen.getByRole("link", { name: "Change sources" }),
    ).toHaveAttribute("href", "/scope");
  });

  it("lists the newest unsorted tracks first, and counts the ones it leaves out", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 11 }))] });
    render(<DiffPage />);
    await screen.findByRole("button", { name: "Sort 11 tracks" });

    const list = screen.getByRole("list", { name: "Waiting to be sorted." });
    const rows = within(list).getAllByRole("listitem");
    expect(
      rows.map((r) => within(r).getByText(/^New Song/).textContent),
    ).toEqual([10, 9, 8, 7, 6, 5, 4, 3].map((i) => `New Song ${i}`));
    expect(within(rows[0]!).getByText("New Artist 10")).toBeInTheDocument();
    expect(screen.getByText("and 3 more")).toBeInTheDocument();
    // Sorted tracks aren't waiting for anything.
    expect(screen.queryByText(/^Old Song/)).toBeNull();
  });

  it("says no more when every waiting track is listed", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 3 }))] });
    render(<DiffPage />);
    await screen.findByRole("button", { name: "Sort 3 tracks" });
    expect(screen.getAllByText(/^New Song/)).toHaveLength(3);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it("names the heading after the waiting tracks, not their count", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 297 }))] });
    render(<DiffPage />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Waiting to be sorted.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort 297 tracks" }),
    ).toBeVisible();
  });

  it("does not ask Spotify anything before the library is read", async () => {
    stubFetch({ cache: ["hang"] });
    render(<DiffPage />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(diffCalls()).toEqual([]);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  // The real router updates its own state on replace(); calling it while
  // this page renders made React log "Cannot update a component while
  // rendering a different component".
  it("sends a library with no categories to /review from an effect, and asks Spotify nothing", async () => {
    let bumpRouter: () => void = () => {};
    function RouterState() {
      const [, set] = useState(0);
      bumpRouter = () => set((n) => n + 1);
      return null;
    }
    router.replace.mockImplementation(() => bumpRouter());
    const consoleError = vi.spyOn(console, "error");
    stubFetch({
      cache: [ok(library({ categories: 0, sorted: 0, unsorted: 5 }))],
    });

    render(
      <>
        <RouterState />
        <DiffPage />
      </>,
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/review"));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(diffCalls()).toEqual([]);
  });

  it("says so when the library can't be read, and reads it again on Try again", async () => {
    stubFetch({
      cache: [{ status: 500, body: { error: "boom" } }, ok(library())],
    });
    render(<DiffPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Couldn't read your library.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HTTP|500/)).toBeNull();
    expect(diffCalls()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Nothing new to sort." }),
    ).toBeInTheDocument();
    expect(calls.filter((u) => u === "/api/cache")).toHaveLength(2);
  });

  // A cache written by another version can't be read by retrying; the nav
  // locks every step, so the page has to say why and offer the way out.
  it("names a library from another version and offers Home, not a retry that can't work", async () => {
    stubFetch({
      cache: [{ status: 409, body: { error: "cache_version_mismatch" } }],
    });
    render(<DiffPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Couldn't read your library.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your library file is from another version of SpotifySorter.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(diffCalls()).toEqual([]);
  });

  const REMOVED = {
    added: [],
    removed: ["r0", "r1"],
    removed_examples: ["Without Me", "Ivy"],
    existing_category_count: 3,
    is_first_run: false,
  };

  // No category has a Spotify playlist until the first Apply.
  it("mentions the playlists only once Apply has made them", async () => {
    stubFetch({ cache: [ok(library())], diff: [ok(REMOVED)] });
    render(<DiffPage />);
    expect(
      await screen.findByText("2 tracks are no longer in your sources."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/playlists/)).toBeNull();
  });

  it("says Apply keeps what it placed once any playlist exists", async () => {
    stubFetch({
      cache: [ok(library({ applied: 1, prefix: "🎧" }))],
      diff: [ok(REMOVED)],
    });
    render(<DiffPage />);
    expect(
      await screen.findByText(
        "2 tracks are no longer in your sources. Apply never takes tracks out of your 🎧 playlists.",
      ),
    ).toBeInTheDocument();
  });

  // In dev, StrictMode mounts the page twice. An aborted fetch doesn't stop
  // the route, so a second request is a second ~40s read of every playlist.
  it("reads Spotify once per visit, even when React mounts the page twice", async () => {
    stubFetch({ cache: [ok(library())], diff: ["hang"] });
    render(
      <StrictMode>
        <DiffPage />
      </StrictMode>,
    );
    // React applies updates queued inside one act() only when it ends, so
    // wait for the page first, then for the note's deferred request.
    await screen.findByRole("heading", { name: "Nothing new to sort." });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(diffCalls()).toHaveLength(1);
  });
});
