import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/classify",
}));
// Counts and fades jump instead of springing, so assertions don't race them.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => true,
}));

import ClassifyPage from "@/app/classify/page";
import {
  NavLockProvider,
  useNavLockState,
} from "@/src/components/design/NavLock";

// ---- fixtures ---------------------------------------------------------------

const AT = "2026-09-01T00:00:00.000Z";
const SAD = {
  matches: [
    { category_id: "emo", score: 87 },
    { category_id: "bedroom", score: 70 },
    { category_id: "drive", score: 66 },
  ],
  classified_at: AT,
  override: null,
};

function library(extra: { unsorted?: boolean; categories?: boolean } = {}) {
  const withCategories = extra.categories ?? true;
  return {
    version: 2,
    auth: { has_token: true, expires_at: AT },
    config: {
      prefix: "🌙",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    categories: withCategories
      ? {
          emo: cat("Emo Rap Heartbreak"),
          bedroom: cat("Bedroom Pop Intimacy"),
          drive: cat("Late Night Drive"),
          rust: cat("Rust Belt Folk"),
        }
      : {},
    artists: {
      x: { name: "XXXTENTACION", genres: [] },
      c: { name: "Current Blue", genres: [] },
    },
    tracks: {
      t1: { artist_id: "x", title: "SAD!", first_seen: AT },
      t2: { artist_id: "c", title: "drive", first_seen: AT },
      t3: { artist_id: "x", title: "Revenge", first_seen: AT },
      ...(extra.unsorted
        ? { t4: { artist_id: "c", title: "new one", first_seen: AT } }
        : {}),
    },
    assignments: {
      t1: SAD,
      t2: {
        matches: [{ category_id: "bedroom", score: 90 }],
        classified_at: AT,
        override: null,
      },
      t3: {
        matches: [
          { category_id: "emo", score: 72 },
          { category_id: "drive", score: 40 },
        ],
        classified_at: AT,
        override: null,
      },
    },
    runs: [],
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    playlist_snapshots: {},
    liked_songs_fingerprint: null,
  };
}

function cat(name: string) {
  return {
    name,
    description: "",
    spotify_playlist_id: null,
    created_at: AT,
    example_track_ids: [],
  };
}

// The fixture plus `playlists` more playlists after it and `songs` more songs
// in Emo Rap Heartbreak, after SAD! and Revenge.
function crowded(playlists: number, songs: number) {
  const base = library();
  const extra = Array.from({ length: songs }, (_, i) => `e${i}`);
  return {
    ...base,
    categories: {
      ...base.categories,
      ...Object.fromEntries(
        Array.from({ length: playlists }, (_, i) => [
          `p${i}`,
          cat(`Extra ${i}`),
        ]),
      ),
    },
    tracks: {
      ...base.tracks,
      ...Object.fromEntries(
        extra.map((id, i) => [
          id,
          { artist_id: "c", title: `Emo ${i}`, first_seen: AT },
        ]),
      ),
    },
    assignments: {
      ...base.assignments,
      ...Object.fromEntries(
        extra.map((id) => [
          id,
          {
            matches: [{ category_id: "emo", score: 99 }],
            classified_at: AT,
            override: null,
          },
        ]),
      ),
    },
  };
}

// ---- fakes ------------------------------------------------------------------

class FakeEventSource {
  static opened: FakeEventSource[] = [];
  closed = false;
  private listeners = new Map<string, Array<(e: Event) => void>>();
  constructor(public url: string) {
    FakeEventSource.opened.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  close() {
    this.closed = true;
  }
  /** A server-sent event, or a bare connection error when data is omitted. */
  emit(type: string, data?: unknown) {
    const event =
      data === undefined
        ? new Event(type)
        : new MessageEvent(type, { data: JSON.stringify(data) });
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

type Reply = { status: number; body: unknown };
let cacheReplies: Reply[] = [];
let patchReplies: Reply[] = [];
const patches: unknown[] = [];

function serve(...replies: Reply[]) {
  cacheReplies = replies;
}
const ok = (body: unknown): Reply => ({ status: 200, body });

let wide = true;

beforeEach(() => {
  FakeEventSource.opened = [];
  cacheReplies = [];
  patchReplies = [];
  patches.length = 0;
  wide = true;
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("min-width") ? wide : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/cache" && method === "GET") {
        const reply =
          cacheReplies.length > 1 ? cacheReplies.shift()! : cacheReplies[0]!;
        return new Response(JSON.stringify(reply.body), {
          status: reply.status,
        });
      }
      if (url === "/api/cache" && method === "PATCH") {
        patches.push(JSON.parse(String(init?.body)));
        const reply = patchReplies.shift() ?? ok({ ok: true });
        return new Response(JSON.stringify(reply.body), {
          status: reply.status,
        });
      }
      throw new Error(`unexpected ${method} ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockReset();
});

function LockProbe() {
  const { locked } = useNavLockState();
  return <span data-testid="nav-lock">{locked ? "locked" : "open"}</span>;
}

function renderPage() {
  return render(
    <NavLockProvider>
      <LockProbe />
      <ClassifyPage />
    </NavLockProvider>,
  );
}

const ready = () => screen.findByRole("heading", { name: "Tune the fit." });
// The action bar's line; dnd-kit keeps its own status region for drags.
const barStatus = () =>
  within(document.querySelector<HTMLElement>("[data-action-bar]")!).getByRole(
    "status",
  );
// Index rows are named "<playlist>, <n> tracks", unlike the Move dialog's.
const row = (playlist: string) =>
  screen.getByRole("button", { name: new RegExp(`^${playlist}, \\d`) });
const song = (name: string) => screen.getByRole("button", { name });
// Every PATCH the page sent, in order, including ones a test answers itself.
const sentPatches = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "PATCH")
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);
const UNSAVED = "Confidence isn't saved until Apply to Spotify.";

// ---- loading and the paid run -----------------------------------------------

describe("/classify — the paid run", () => {
  it("reads the library first and opens no run when every track is sorted", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    expect(FakeEventSource.opened).toHaveLength(0);
    // Nothing ran on this visit, so there is no run to report.
    expect(barStatus()).toBeEmptyDOMElement();
  });

  it("opens the classify stream exactly once when some tracks are unsorted", async () => {
    serve(ok(library({ unsorted: true })));
    renderPage();
    await screen.findByRole("heading", {
      name: "Listening through your library…",
    });
    expect(FakeEventSource.opened.map((e) => e.url)).toEqual([
      "/api/llm/classify",
    ]);
  });

  it("offers no way out and nothing to apply while it runs", async () => {
    serve(ok(library({ unsorted: true })));
    renderPage();
    await screen.findByRole("heading", {
      name: "Listening through your library…",
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId("nav-lock")).toHaveTextContent("locked"),
    );
  });

  it("shows progress, and no count until the first batch reports", async () => {
    serve(ok(library({ unsorted: true })));
    renderPage();
    const bar = await screen.findByRole("progressbar");
    expect(screen.queryByText(/ \/ /)).toBeNull();
    act(() =>
      FakeEventSource.opened[0]!.emit("progress", { done: 3, total: 40 }),
    );
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "40");
    expect(screen.getByText("3 of 40")).toBeInTheDocument();
  });

  it("shows the playlists once the run is done, with what it cost", async () => {
    const after = library();
    after.runs = [
      {
        run_id: "r1",
        type: "classify",
        started_at: AT,
        completed_at: AT,
        tracks_classified: 297,
        tracks_total: 300,
        cost_usd: 0.1712,
        summary: "",
        skipped: ["a", "b"],
      },
    ] as never;
    serve(ok(library({ unsorted: true })), ok(after));
    renderPage();
    await screen.findByRole("progressbar");
    act(() => FakeEventSource.opened[0]!.emit("done", {}));
    await ready();
    expect(FakeEventSource.opened[0]!.closed).toBe(true);
    expect(barStatus()).toHaveTextContent(
      "Sorted 297 tracks for $0.17 · 2 couldn't be placed",
    );
    await waitFor(() =>
      expect(screen.getByTestId("nav-lock")).toHaveTextContent("open"),
    );
  });

  it("stops with a way back, not a retry, when the run fails", async () => {
    serve(ok(library({ unsorted: true })));
    renderPage();
    await screen.findByRole("progressbar");
    act(() =>
      FakeEventSource.opened[0]!.emit("error", {
        message: "Anthropic returned 529 — overloaded.",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Sorting stopped." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Anthropic returned 529 — overloaded."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to categories" }),
    ).toHaveAttribute("href", "/review");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(FakeEventSource.opened).toHaveLength(1);
    expect(FakeEventSource.opened[0]!.closed).toBe(true);
    expect(screen.getByTestId("nav-lock")).toHaveTextContent("open");
  });

  it("says so when the library can't be read after the run", async () => {
    serve(ok(library({ unsorted: true })), { status: 500, body: {} });
    renderPage();
    await screen.findByRole("progressbar");
    act(() => FakeEventSource.opened[0]!.emit("done", {}));
    expect(
      await screen.findByRole("heading", {
        name: "Couldn't read your library.",
      }),
    ).toBeInTheDocument();
    // Categories were there a moment ago, so /review opens without proposing.
    expect(
      screen.getByRole("link", { name: "Back to categories" }),
    ).toHaveAttribute("href", "/review");
  });

  // The server keeps a run going after the browser drops off, so "stopped"
  // would be false.
  it("says the connection dropped, not that the run stopped, when the stream is lost", async () => {
    serve(ok(library({ unsorted: true })));
    renderPage();
    await screen.findByRole("progressbar");
    act(() => FakeEventSource.opened[0]!.emit("error"));
    expect(
      await screen.findByRole("heading", { name: "Lost the connection." }),
    ).toBeInTheDocument();
    expect(FakeEventSource.opened[0]!.closed).toBe(true);
    expect(
      screen.getByRole("link", { name: "Back to categories" }),
    ).toBeInTheDocument();
  });
});

describe("/classify — nothing to tune", () => {
  // /review with no categories starts a paid proposal on load.
  it("never links to categories when there are none, and runs nothing", async () => {
    serve(ok(library({ categories: false, unsorted: true })));
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "No categories yet." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(document.querySelector('a[href="/review"]')).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply/ })).toBeNull();
    expect(FakeEventSource.opened).toHaveLength(0);
  });

  it("shows an error, not a crash, when the library can't be read", async () => {
    serve({ status: 500, body: { error: "boom" } });
    renderPage();
    expect(
      await screen.findByRole("heading", {
        name: "Couldn't read your library.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    // Categories may be empty for all we know: /review could start a proposal.
    expect(document.querySelector('a[href="/review"]')).toBeNull();
    expect(FakeEventSource.opened).toHaveLength(0);
  });
});

// ---- tuning -----------------------------------------------------------------

describe("/classify — tuning the fit", () => {
  // The nav's Categories step sits just above the title, so the page has no
  // back link of its own.
  it("has no back link of its own and exactly one Apply to Spotify", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    expect(screen.queryByRole("link", { name: "Categories" })).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /Apply to Spotify/ }),
    ).toHaveLength(1);
  });

  it("lists every playlist in library order with its track count", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    const index = screen.getByRole("list", { name: "Playlists" });
    expect(
      within(index)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual([
      "Emo Rap Heartbreak, 2 tracks",
      "Bedroom Pop Intimacy, 2 tracks",
      "Late Night Drive, 1 track",
      "Rust Belt Folk, 0 tracks",
    ]);
  });

  it("uses a keyboard-operable slider that re-counts the playlists", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    const slider = screen.getByRole("slider", { name: "Confidence" });
    expect(slider).toHaveAttribute("type", "range");
    expect(slider).toHaveValue("65");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(row("Bedroom Pop Intimacy")).toHaveAccessibleName(
      "Bedroom Pop Intimacy, 1 track",
    );
    expect(row("Late Night Drive")).toHaveAccessibleName(
      "Late Night Drive, 0 tracks",
    );
  });

  it("shows the first playlist's tracks, and another's when picked", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    expect(row("Emo Rap Heartbreak")).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { level: 2, name: "Emo Rap Heartbreak" }),
    ).toBeInTheDocument();
    const songs = screen.getByRole("list", { name: "Emo Rap Heartbreak" });
    expect(within(songs).getAllByRole("listitem")).toHaveLength(2);

    await userEvent.click(row("Bedroom Pop Intimacy"));
    expect(row("Bedroom Pop Intimacy")).toHaveAttribute("aria-pressed", "true");
    expect(row("Emo Rap Heartbreak")).toHaveAttribute("aria-pressed", "false");
    expect(
      within(
        screen.getByRole("list", { name: "Bedroom Pop Intimacy" }),
      ).getByRole("button", { name: "Move drive by Current Blue" }),
    ).toBeInTheDocument();
  });

  it("shows 100 tracks at a time", async () => {
    const big = library();
    for (let i = 0; i < 150; i++) {
      big.tracks[`b${i}` as "t1"] = {
        artist_id: "c",
        title: `Song ${i}`,
        first_seen: AT,
      };
      big.assignments[`b${i}` as "t2"] = {
        matches: [{ category_id: "rust", score: 99 }],
        classified_at: AT,
        override: null,
      };
    }
    serve(ok(big));
    renderPage();
    await ready();
    await userEvent.click(row("Rust Belt Folk"));
    const songs = screen.getByRole("list", { name: "Rust Belt Folk" });
    expect(within(songs).getAllByRole("listitem")).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(within(songs).getAllByRole("listitem")).toHaveLength(150);
    expect(
      screen.queryByRole("button", { name: /^Show \d+ more$/ }),
    ).toBeNull();
  });

  // /apply creates a playlist for every category, empty ones included.
  it("says when a playlist would go to Spotify empty", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    await userEvent.click(row("Rust Belt Folk"));
    expect(screen.getByText("Nothing lands here at 65.")).toBeInTheDocument();
    expect(
      screen.getByText("Spotify will get an empty playlist."),
    ).toBeInTheDocument();
  });

  // Blind-labelling study: the model's per-song scores stay hidden.
  it("never prints a per-song score", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    const text = document.body.textContent ?? "";
    for (const score of ["87", "70", "66", "72", "90", "40"]) {
      expect(text).not.toContain(score);
    }
  });

  it("opens each playlist in place on a phone, one at a time", async () => {
    wide = false;
    serve(ok(library()));
    renderPage();
    await ready();
    const emo = screen.getByRole("button", { name: /^Emo Rap Heartbreak/ });
    expect(emo).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();

    await userEvent.click(emo);
    expect(emo).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Move SAD! by XXXTENTACION" }),
    ).toBeInTheDocument();

    const bedroom = screen.getByRole("button", {
      name: /^Bedroom Pop Intimacy/,
    });
    await userEvent.click(bedroom);
    expect(emo).toHaveAttribute("aria-expanded", "false");
    expect(bedroom).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(bedroom);
    expect(bedroom).toHaveAttribute("aria-expanded", "false");
  });
});

// ---- keyboard ---------------------------------------------------------------

// Each list is one Tab stop; the arrow keys move inside it. Before, every row
// was a stop and Apply to Spotify sat ~150 Tabs down the page.
describe("/classify — the keyboard", () => {
  it("reaches Apply to Spotify in four Tabs, however long the lists", async () => {
    serve(ok(crowded(30, 40)));
    renderPage();
    await ready();
    for (const stop of [
      row("Emo Rap Heartbreak"),
      song("Move SAD! by XXXTENTACION"),
      screen.getByRole("slider", { name: "Confidence" }),
      screen.getByRole("button", { name: "Apply to Spotify" }),
    ]) {
      await userEvent.tab();
      expect(stop).toHaveFocus();
    }
  });

  it("moves through the playlists with the arrow keys, Home and End", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    act(() => row("Emo Rap Heartbreak").focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(row("Bedroom Pop Intimacy")).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(row("Rust Belt Folk")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(row("Rust Belt Folk")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(row("Emo Rap Heartbreak")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(row("Bedroom Pop Intimacy")).toHaveAttribute("aria-pressed", "true");
    // Tab leaves the list; Shift+Tab comes back to the row you left.
    await userEvent.tab();
    expect(song("Move SAD! by XXXTENTACION")).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(row("Bedroom Pop Intimacy")).toHaveFocus();
  });

  it("moves through the songs with the arrow keys, and opens Move on Enter", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    act(() => song("Move SAD! by XXXTENTACION").focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(song("Move Revenge by XXXTENTACION")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(song("Move SAD! by XXXTENTACION")).toHaveFocus();
    await userEvent.keyboard("{End}{Enter}");
    expect(
      screen.getByRole("dialog", { name: "Move ‘Revenge’ to…" }),
    ).toBeInTheDocument();
  });

  // On a phone the open playlist's songs sit inside the index.
  it("keeps the arrow keys inside the open playlist on a phone", async () => {
    wide = false;
    serve(ok(library()));
    renderPage();
    await ready();
    act(() => row("Emo Rap Heartbreak").focus());
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(row("Bedroom Pop Intimacy")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await userEvent.tab();
    expect(song("Move SAD! by XXXTENTACION")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(song("Move drive by Current Blue")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(song("Move drive by Current Blue")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("slider", { name: "Confidence" })).toHaveFocus();
  });
});

// ---- moving a song ----------------------------------------------------------

async function moveSadTo(playlist: string) {
  await userEvent.click(
    screen.getByRole("button", { name: "Move SAD! by XXXTENTACION" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Move ‘SAD!’ to…" });
  await userEvent.click(within(dialog).getByRole("button", { name: playlist }));
}

async function moveRevengeTo(playlist: string) {
  await userEvent.click(song("Move Revenge by XXXTENTACION"));
  const dialog = screen.getByRole("dialog", { name: "Move ‘Revenge’ to…" });
  await userEvent.click(within(dialog).getByRole("button", { name: playlist }));
}

describe("/classify — moving a song", () => {
  it("offers every other playlist, in library order", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    await userEvent.click(
      screen.getByRole("button", { name: "Move SAD! by XXXTENTACION" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Move ‘SAD!’ to…" });
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent)
        .filter((t) => t !== "Cancel"),
    ).toEqual(["Bedroom Pop Intimacy", "Late Night Drive", "Rust Belt Folk"]);

    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: "Filter playlists" }),
      "dri",
    );
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent)
        .filter((t) => t !== "Cancel"),
    ).toEqual(["Late Night Drive"]);
  });

  it("saves the move, re-counts, and says what happened", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    await moveSadTo("Rust Belt Folk");

    expect(patches).toHaveLength(1);
    const body = patches[0] as {
      assignments: Record<string, { override: { category_id: string } }>;
    };
    expect(Object.keys(body)).toEqual(["assignments"]);
    expect(body.assignments.t1).toMatchObject({
      matches: SAD.matches,
      classified_at: AT,
      override: { category_id: "rust" },
    });
    expect(barStatus()).toHaveTextContent(
      "‘SAD!’ → Rust Belt Folk. Also left 2 other playlists.",
    );
    expect(row("Emo Rap Heartbreak")).toHaveAccessibleName(
      "Emo Rap Heartbreak, 1 track",
    );
    expect(row("Rust Belt Folk")).toHaveAccessibleName(
      "Rust Belt Folk, 1 track",
    );
    expect(row("Late Night Drive")).toHaveAccessibleName(
      "Late Night Drive, 0 tracks",
    );
  });

  it("undoes a move by saving the song's whole previous assignment", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    await moveSadTo("Rust Belt Folk");
    await userEvent.click(
      within(barStatus()).getByRole("button", { name: "Undo" }),
    );

    expect(patches).toHaveLength(2);
    expect(patches[1]).toEqual({ assignments: { t1: SAD } });
    await waitFor(() =>
      expect(row("Late Night Drive")).toHaveAccessibleName(
        "Late Night Drive, 1 track",
      ),
    );
    expect(row("Rust Belt Folk")).toHaveAccessibleName(
      "Rust Belt Folk, 0 tracks",
    );
    expect(barStatus()).toHaveTextContent("‘SAD!’ is back.");
    expect(within(barStatus()).queryByRole("button")).toBeNull();
  });

  // The moved row has left the list, so focus can't return to it.
  it("puts focus on Undo after a move from the dialog", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    await moveSadTo("Rust Belt Folk");
    await waitFor(() =>
      expect(
        within(barStatus()).getByRole("button", { name: "Undo" }),
      ).toHaveFocus(),
    );
  });

  it("keeps the move and says so when Undo can't be saved", async () => {
    serve(ok(library()));
    patchReplies = [ok({ ok: true }), { status: 500, body: {} }];
    renderPage();
    await ready();
    await moveSadTo("Rust Belt Folk");
    await userEvent.click(
      within(barStatus()).getByRole("button", { name: "Undo" }),
    );
    await waitFor(() =>
      expect(barStatus()).toHaveTextContent("Couldn't undo that move."),
    );
    expect(row("Rust Belt Folk")).toHaveAccessibleName(
      "Rust Belt Folk, 1 track",
    );
  });

  // Undo removes itself, so focus goes to the song it brought back.
  it("puts focus on the song Undo brought back", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    await moveSadTo("Rust Belt Folk");
    const undo = within(barStatus()).getByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(song("Move SAD! by XXXTENTACION")).toHaveFocus(),
    );
  });

  it("puts focus on the song when its move can't be saved", async () => {
    serve(ok(library()));
    patchReplies = [{ status: 500, body: { error: "disk full" } }];
    renderPage();
    await ready();
    await moveSadTo("Rust Belt Folk");
    await waitFor(() =>
      expect(barStatus()).toHaveTextContent("Couldn't save that move."),
    );
    await waitFor(() =>
      expect(song("Move SAD! by XXXTENTACION")).toHaveFocus(),
    );
  });

  // Enter on an empty filter used to move the song to the first playlist.
  it("moves nothing on Enter until a filter narrows the list", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    await userEvent.click(song("Move SAD! by XXXTENTACION"));
    const dialog = screen.getByRole("dialog", { name: "Move ‘SAD!’ to…" });
    const filter = within(dialog).getByRole("searchbox", {
      name: "Filter playlists",
    });
    await waitFor(() => expect(filter).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    expect(sentPatches()).toHaveLength(0);
    expect(dialog).toBeInTheDocument();

    await userEvent.keyboard("dri");
    expect(
      within(dialog).getByRole("button", { name: "Late Night Drive" }),
    ).toHaveAttribute("data-enter-target");
    await userEvent.keyboard("{Enter}");
    expect(sentPatches()).toEqual([
      {
        assignments: {
          t1: expect.objectContaining({
            override: expect.objectContaining({ category_id: "drive" }),
          }),
        },
      },
    ]);
  });

  // PATCH /api/cache rewrites the whole file, so two saves in flight can
  // overwrite each other on disk.
  it("saves one change at a time, in the order they were made", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    let finishMove: (r: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (finishMove = resolve)),
    );
    await moveSadTo("Rust Belt Folk");
    await userEvent.click(
      within(barStatus()).getByRole("button", { name: "Undo" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply to Spotify" }),
    );
    expect(sentPatches()).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => finishMove(new Response("{}", { status: 200 })));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/apply"));
    expect(sentPatches()).toEqual([
      {
        assignments: {
          t1: expect.objectContaining({
            override: expect.objectContaining({ category_id: "rust" }),
          }),
        },
      },
      { assignments: { t1: SAD } },
      { config: { confidence_threshold: 65 } },
    ]);
  });

  it("puts the song back and says so when the move can't be saved", async () => {
    serve(ok(library()));
    patchReplies = [{ status: 500, body: { error: "disk full" } }];
    renderPage();
    await ready();
    await moveSadTo("Rust Belt Folk");
    await waitFor(() =>
      expect(barStatus()).toHaveTextContent("Couldn't save that move."),
    );
    expect(row("Rust Belt Folk")).toHaveAccessibleName(
      "Rust Belt Folk, 0 tracks",
    );
    expect(row("Emo Rap Heartbreak")).toHaveAccessibleName(
      "Emo Rap Heartbreak, 2 tracks",
    );
  });
});

// ---- Apply to Spotify -------------------------------------------------------

describe("/classify — Apply to Spotify", () => {
  // /apply reads the saved setting; leaving any other way drops the slider.
  it("says the slider isn't saved until Apply to Spotify", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    const slider = screen.getByRole("slider", { name: "Confidence" });
    fireEvent.change(slider, { target: { value: "80" } });
    expect(barStatus()).toHaveTextContent(UNSAVED);
    fireEvent.change(slider, { target: { value: "65" } });
    expect(barStatus()).toBeEmptyDOMElement();
  });

  it("shows a newer move over the note, and the note again when the slider moves", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    const slider = screen.getByRole("slider", { name: "Confidence" });
    await moveSadTo("Rust Belt Folk");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(barStatus()).toHaveTextContent(UNSAVED);

    await moveRevengeTo("Late Night Drive");
    expect(barStatus()).toHaveTextContent("‘Revenge’ → Late Night Drive.");
    fireEvent.change(slider, { target: { value: "81" } });
    expect(barStatus()).toHaveTextContent(UNSAVED);
  });

  // It used to also write prefix "✨" and a model name over the /setup choices.
  it("saves only the confidence setting, then opens /apply", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    fireEvent.change(screen.getByRole("slider", { name: "Confidence" }), {
      target: { value: "80" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Apply to Spotify" }),
    );
    expect(patches).toEqual([{ config: { confidence_threshold: 80 } }]);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/apply"));
  });

  // /apply reads the setting from the cache: moving on after a failed save
  // would build playlists from the old value.
  it("stays put and says so when the setting can't be saved", async () => {
    serve(ok(library()));
    patchReplies = [{ status: 500, body: { error: "disk full" } }];
    renderPage();
    await ready();
    const apply = screen.getByRole("button", { name: "Apply to Spotify" });
    await userEvent.click(apply);
    await waitFor(() =>
      expect(barStatus()).toHaveTextContent(
        "Couldn't save the setting. Try again.",
      ),
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(apply).toBeEnabled();
  });

  it("can't be pressed twice while the setting saves", async () => {
    serve(ok(library()));
    renderPage();
    await ready();
    let answer: (r: Response) => void = () => {};
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    const apply = screen.getByRole("button", { name: "Apply to Spotify" });
    await userEvent.click(apply);
    expect(apply).toBeDisabled();
    expect(apply).toHaveAttribute("aria-busy", "true");
    await act(async () => answer(new Response("{}", { status: 200 })));
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
