import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import DiffPage from "@/app/diff/page";
import { estimateClassifyCost } from "@/src/lib/llm/cost";

type Reply = { status: number; body: unknown } | "hang";

// The page reads three routes; each call takes the next queued reply, and the
// last one repeats. Keyed by path: the list route carries a ?limit.
let queues: Record<string, Reply[]> = {};
let calls: string[] = [];

function stubFetch(replies: {
  cache: Reply[];
  /** Defaults to what the real route answers for the first cache reply. */
  unsorted?: Reply[];
  diff?: Reply[];
}) {
  const first = replies.cache[0];
  queues = {
    "/api/cache": replies.cache,
    "/api/library/unsorted": replies.unsorted ?? [
      first !== "hang" && first?.status === 200
        ? arrivals(first.body as Library)
        : "hang",
    ],
    "/api/spotify/diff": replies.diff ?? ["hang"],
  };
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    calls.push(url);
    const queue = queues[new URL(url, "http://app").pathname];
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
  artIds = false,
}: {
  sorted?: number;
  unsorted?: number;
  categories?: number;
  /** How many categories already have a Spotify playlist. */
  applied?: number;
  prefix?: string;
  /** Real-length track ids (22 base-62 characters), as the art route wants. */
  artIds?: boolean;
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
    tracks[artIds ? `u${i}`.padEnd(22, "x") : `u${i}`] = {
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

type Library = ReturnType<typeof library>;

// What GET /api/library/unsorted answers: every unsorted track counted, the
// labelling sample left off the list, newest scan first.
function arrivals(lib: Library, blind: string[] = []): Reply {
  const tracks = lib.tracks as Record<
    string,
    { artist_id: string; title: string; first_seen: string }
  >;
  const artists = lib.artists as Record<string, { name: string }>;
  const seen = (id: string) => Date.parse(tracks[id]!.first_seen);
  const ids = Object.keys(tracks)
    .filter((id) => !(id in lib.assignments))
    .sort((a, b) => seen(b) - seen(a));
  return ok({
    total: ids.length,
    tracks: ids
      .filter((id) => !blind.includes(id))
      .map((id) => ({
        id,
        title: tracks[id]!.title,
        artist: artists[tracks[id]!.artist_id]?.name ?? "",
      })),
  });
}

const listCalls = () =>
  calls.filter((u) => u.startsWith("/api/library/unsorted"));
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

    // The list is its own request, so it can land after the sentence.
    const list = await screen.findByRole("list", {
      name: "11 new tracks to sort.",
    });
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
    expect(await screen.findAllByText(/^New Song/)).toHaveLength(3);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  // Spec: the sentence is "N new tracks to sort", counted by the list route,
  // which also counts the songs it leaves off the list.
  it("says how many new tracks wait, counting the ones it can't list", async () => {
    const lib = library({ unsorted: 297 });
    stubFetch({ cache: [ok(lib)], unsorted: [arrivals(lib, ["u296"])] });
    render(<DiffPage />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "297 new tracks to sort.",
      }),
    ).toBeInTheDocument();
    // The top strip fades in, so wait out its fade.
    const sort = screen.getByRole("button", { name: "Sort 297 tracks" });
    await waitFor(() => expect(sort).toBeVisible());
    expect(await screen.findByText("and 289 more")).toBeInTheDocument();
  });

  it("says track, not tracks, for one", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 1 }))] });
    render(<DiffPage />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "1 new track to sort.",
      }),
    ).toBeInTheDocument();
  });

  // Blind labelling: the list route drops the sample's songs. The cache the
  // page also reads still has them; they must not come back from it.
  it("never lists a song the list route left out", async () => {
    const lib = library({ unsorted: 11 });
    stubFetch({ cache: [ok(lib)], unsorted: [arrivals(lib, ["u10", "u7"])] });
    render(<DiffPage />);
    const list = await screen.findByRole("list", {
      name: "11 new tracks to sort.",
    });
    expect(
      within(list)
        .getAllByText(/^New Song/)
        .map((el) => el.textContent),
    ).toEqual([9, 8, 6, 5, 4, 3, 2, 1].map((i) => `New Song ${i}`));
    expect(screen.queryByText("New Song 10")).toBeNull();
    expect(screen.queryByText("New Song 7")).toBeNull();
    expect(screen.getByText("and 3 more")).toBeInTheDocument();
  });

  it("shows each arrival's cover and links its title to Spotify", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 2, artIds: true }))] });
    const { container } = render(<DiffPage />);
    const title = await screen.findByRole("link", { name: "New Song 1" });
    const id = "u1".padEnd(22, "x");
    expect(title).toHaveAttribute("href", `spotify:track:${id}`);
    // next/image writes the resolved URL into src; the path is what matters.
    const art = [...container.querySelectorAll("img")].map(
      (img) => new URL(img.src).pathname,
    );
    expect(art).toContain(`/api/art/${id}`);
  });

  it("asks for the list only when tracks are waiting", async () => {
    stubFetch({ cache: [ok(library())] });
    render(<DiffPage />);
    await screen.findByRole("heading", { name: "Nothing new to sort." });
    expect(listCalls()).toEqual([]);
  });

  // The list is a sample of what waits; the way forward comes from the cache
  // alone. A broken labelling sample fails the list route on purpose
  // (src/lib/labeling/blind.ts), and must not take the page down with it.
  it("keeps the way forward when the list can't be read, and lists again on Try again", async () => {
    const lib = library({ unsorted: 3 });
    stubFetch({
      cache: [ok(lib)],
      unsorted: [{ status: 500, body: { error: "boom" } }, arrivals(lib)],
    });
    render(<DiffPage />);

    expect(
      await screen.findByText("Couldn’t list the new tracks."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "3 new tracks to sort." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort 3 tracks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit categories" }),
    ).toHaveAttribute("href", "/review");
    expect(
      screen.getByRole("link", { name: "Change sources" }),
    ).toHaveAttribute("href", "/scope");
    expect(screen.queryByText(/New Song/)).toBeNull();
    expect(screen.queryByText(/HTTP|500/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    const list = await screen.findByRole("list", {
      name: "3 new tracks to sort.",
    });
    expect(within(list).getAllByText(/^New Song/)).toHaveLength(3);
    expect(screen.queryByText("Couldn’t list the new tracks.")).toBeNull();
    expect(listCalls()).toHaveLength(2);
    // Only the list is read again.
    expect(calls.filter((u) => u === "/api/cache")).toHaveLength(1);
    // Try again unmounts itself; focus waits with the list, not on <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(list);
  });

  it("treats a list from another version as a list it can't read", async () => {
    stubFetch({
      cache: [ok(library({ unsorted: 3 }))],
      unsorted: [{ status: 409, body: { error: "cache_version_mismatch" } }],
    });
    render(<DiffPage />);
    expect(
      await screen.findByText("Couldn’t list the new tracks."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort 3 tracks" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/another version/)).toBeNull();
  });

  it("shows the way forward before the list arrives", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 3 }))], unsorted: ["hang"] });
    render(<DiffPage />);
    expect(
      await screen.findByRole("heading", { name: "3 new tracks to sort." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort 3 tracks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit categories" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Change sources" }),
    ).toBeInTheDocument();
  });

  // Spotify's removed-tracks answer takes ~40s and can grow the note or empty
  // it. Nothing may sit below it, or every control would move under the
  // pointer long after the page settled.
  describe("the removed-tracks note comes after every control", () => {
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const controls = () => [
      ...screen.queryAllByRole("link"),
      ...screen.queryAllByRole("button"),
    ];

    it("with tracks waiting: after the ways on and the list", async () => {
      stubFetch({ cache: [ok(library({ unsorted: 3 }))] });
      render(<DiffPage />);
      const list = await screen.findByRole("list", {
        name: "3 new tracks to sort.",
      });
      const note = screen.getByText("Checking Spotify for removed tracks…");
      const edit = screen.getByRole("link", { name: "Edit categories" });
      const change = screen.getByRole("link", { name: "Change sources" });
      // Reading order: the ways on, then the list, then the footnote.
      expect(follows(edit, change)).toBe(true);
      expect(follows(change, list)).toBe(true);
      expect(follows(list, note)).toBe(true);
      expect(controls().length).toBeGreaterThan(5);
      for (const c of controls()) expect(follows(c, note)).toBe(true);
    });

    it("with nothing waiting: after the ways on", async () => {
      stubFetch({ cache: [ok(library())] });
      render(<DiffPage />);
      await screen.findByRole("heading", { name: "Nothing new to sort." });
      const note = screen.getByText("Checking Spotify for removed tracks…");
      expect(controls().length).toBe(3);
      for (const c of controls()) expect(follows(c, note)).toBe(true);
    });
  });

  // The strip fades in when it mounts. A new one per load state blinked out
  // and back in the moment the library landed.
  it("keeps one top strip from loading through ready", async () => {
    stubFetch({ cache: [ok(library({ unsorted: 3 }))] });
    const { container } = render(<DiffPage />);
    const strip = container.querySelector("[data-action-bar]");
    expect(strip).not.toBeNull();
    await screen.findByRole("button", { name: "Sort 3 tracks" });
    expect(container.querySelector("[data-action-bar]")).toBe(strip);
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
        name: "Couldn’t read your library.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HTTP|500/)).toBeNull();
    expect(diffCalls()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    const heading = await screen.findByRole("heading", {
      name: "Nothing new to sort.",
    });
    expect(calls.filter((u) => u === "/api/cache")).toHaveLength(2);
    // Try again goes away with the failure; focus lands on the new sentence
    // instead of dropping to <body>.
    await waitFor(() => expect(heading).toHaveFocus());
  });

  // The strip keeps its primary while it reads again, disabled, instead of
  // blinking out and back in.
  it("holds Try again, disabled, while it reads the library again", async () => {
    stubFetch({ cache: [{ status: 500, body: { error: "boom" } }, "hang"] });
    render(<DiffPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
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
        name: "Couldn’t read your library.",
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
        "2 tracks are no longer in your sources. Apply won't take them out of your 🎧 playlists.",
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
