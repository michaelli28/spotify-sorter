import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/scan",
}));

import ScanPage from "@/app/scan/page";
import {
  NavLockProvider,
  useNavLockState,
} from "@/src/components/design/NavLock";

// jsdom has no EventSource. Every stream the page opens is recorded, so a test
// can count how many are open and speak for the server on each.
class FakeEventSource {
  static all: FakeEventSource[] = [];
  readyState = 0;
  private listeners = new Map<string, Set<(e: Event) => void>>();
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  close() {
    this.readyState = 2;
  }
  /** A server event; with no data, the browser's own connection error. */
  emit(type: string, data?: unknown) {
    const e =
      data === undefined
        ? new Event(type)
        : new MessageEvent(type, { data: JSON.stringify(data) });
    act(() => this.listeners.get(type)?.forEach((fn) => fn(e)));
  }
}
const openStreams = () => FakeEventSource.all.filter((s) => s.readyState !== 2);
const stream = () => FakeEventSource.all.at(-1)!;

type CacheBody = {
  scope: { included_playlist_ids: string[]; include_liked_songs: boolean };
  runs: unknown[];
};
const cacheBody = (over: Partial<CacheBody["scope"]> = {}, runs = [{}]) => ({
  scope: {
    included_playlist_ids: Array.from({ length: 105 }, (_, i) => `p${i}`),
    excluded_playlist_ids: [],
    include_liked_songs: true,
    ...over,
  },
  runs,
});

function stubCache(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status }),
    );
}

function LockProbe() {
  const { locked } = useNavLockState();
  return <output aria-label="nav lock">{locked ? "locked" : "open"}</output>;
}

async function renderScan() {
  render(
    <NavLockProvider>
      <LockProbe />
      <ScanPage />
    </NavLockProvider>,
  );
  // Let the mount-time GET /api/cache settle.
  await act(async () => {});
}

const heading = () => screen.getByRole("heading", { level: 1 });
const strip = () => document.querySelector<HTMLElement>("[data-action-bar]")!;
const stripStatus = () => within(strip()).getByRole("status");
const lock = () => screen.getByRole("status", { name: "nav lock" });

beforeEach(() => {
  FakeEventSource.all = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("/scan while reading", () => {
  it("opens one scan stream on arrival, with nothing to press", async () => {
    stubCache(cacheBody());
    await renderScan();
    expect(FakeEventSource.all).toHaveLength(1);
    expect(stream().url).toBe("/api/spotify/scan");
    expect(heading()).toHaveTextContent("Reading your library…");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });

  it("lists what it reads and never shows a made-up count", async () => {
    stubCache(cacheBody());
    await renderScan();
    const list = screen.getByRole("list");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Playlists", "Liked Songs", "Artist genres"]);

    stream().emit("progress", { stage: "playlists", current: 0, total: 106 });
    expect(list).not.toHaveTextContent(/\d/);
    expect(screen.queryByRole("progressbar")).toBeNull();

    stream().emit("progress", { stage: "playlists", current: 38, total: 105 });
    expect(screen.getByText("38 of 105")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Playlists" });
    expect(bar).toHaveAttribute("aria-valuenow", "38");
    expect(bar).toHaveAttribute("aria-valuemax", "105");
    // The title carries the playlists count, so the row doesn't print it again.
    expect(list).not.toHaveTextContent(/\d/);
  });

  it("marks the step being read by weight, not only by colour", async () => {
    stubCache(cacheBody());
    await renderScan();
    const list = within(screen.getByRole("list"));
    const label = (name: string) =>
      list.getByText(name).closest("li")!.firstElementChild!;
    expect(label("Playlists")).toHaveClass("font-semibold");
    expect(label("Liked Songs")).not.toHaveClass("font-semibold");
    stream().emit("progress", { stage: "playlists", current: 105, total: 105 });
    expect(label("Playlists")).not.toHaveClass("font-semibold");
    expect(label("Liked Songs")).toHaveClass("font-semibold");
  });

  it("marks the stage being read as the current step", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("progress", { stage: "playlists", current: 105, total: 105 });
    const list = within(screen.getByRole("list"));
    expect(list.getByText("Liked Songs").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(list.getByText("Playlists").closest("li")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("leaves Liked Songs out when it isn't a source", async () => {
    stubCache(cacheBody({ include_liked_songs: false }));
    await renderScan();
    const list = within(screen.getByRole("list"));
    expect(list.queryByText("Liked Songs")).toBeNull();
    expect(list.getByText("Playlists")).toBeInTheDocument();
  });

  it("holds the site nav while it reads", async () => {
    stubCache(cacheBody());
    await renderScan();
    expect(lock()).toHaveTextContent("locked");
    stream().emit("done", { unique_tracks: 3172, unique_artists: 1476 });
    expect(lock()).toHaveTextContent("open");
  });

  it("closes its stream when you leave the page", async () => {
    stubCache(cacheBody());
    const { unmount } = render(<ScanPage />);
    await act(async () => {});
    unmount();
    expect(openStreams()).toEqual([]);
  });

  // StrictMode runs every effect twice in development: a second open stream
  // would be a second full library read.
  it("keeps one stream open under StrictMode", async () => {
    stubCache(cacheBody());
    render(
      <StrictMode>
        <ScanPage />
      </StrictMode>,
    );
    await act(async () => {});
    expect(openStreams()).toHaveLength(1);
    expect(stream().url).toBe("/api/spotify/scan");
  });
});

// Every page in the flow has the top strip: scope and diff either side of
// this one, so the title never jumps by the strip's height between them.
describe("/scan's top strip", () => {
  it("prints the strip from the first render, with nothing to press", () => {
    stubCache(cacheBody());
    render(<ScanPage />);
    expect(strip()).not.toBeNull();
    expect(within(strip()).queryByRole("button")).toBeNull();
    expect(within(strip()).queryByRole("link")).toBeNull();
  });

  it("says which source it is reading, and moves on with the scan", async () => {
    stubCache(cacheBody());
    await renderScan();
    expect(stripStatus()).toHaveTextContent("Reading playlists…");
    stream().emit("progress", { stage: "playlists", current: 105, total: 105 });
    expect(stripStatus()).toHaveTextContent("Reading Liked Songs…");
    stream().emit("progress", { stage: "liked", current: 1, total: 1 });
    stream().emit("progress", { stage: "artists", current: 0, total: 40 });
    expect(stripStatus()).toHaveTextContent("Reading artist genres…");
    stream().emit("done", { unique_tracks: 3172, unique_artists: 1476 });
    expect(stripStatus()).toBeEmptyDOMElement();
  });

  it("keeps the playlists count in the title, not in the strip too", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("progress", { stage: "playlists", current: 38, total: 105 });
    expect(stripStatus()).not.toHaveTextContent(/\d/);
  });

  it("clears the reading line when the scan fails", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("error", { message: "Spotify artists 429: slow down" });
    expect(stripStatus()).toBeEmptyDOMElement();
  });
});

describe("/scan's crate", () => {
  const playlists = (current: number, total = 105) =>
    stream().emit("progress", { stage: "playlists", current, total });
  const records = () => document.querySelectorAll("[data-record]").length;
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("titles the page with the playlists read, the true figure for assistive tech", async () => {
    stubCache(cacheBody());
    await renderScan();
    playlists(0);
    expect(heading()).toHaveTextContent("Reading your library…");
    playlists(38);
    expect(heading()).toHaveAccessibleName("38 of 105 playlists read");
  });

  it("ticks the printed count up to the true figure", async () => {
    stubCache(cacheBody());
    await renderScan();
    playlists(38);
    const printed = () =>
      heading().querySelector('[aria-hidden="true"]')?.textContent;
    // 800ms of EASE_OUT from 0: never the final figure straight away...
    expect(printed()).not.toBe("38 of 105");
    // ...but there once it settles.
    await act(() => new Promise((r) => setTimeout(r, 1000)));
    expect(printed()).toBe("38 of 105");
  });

  it("says playlist, not playlists, for a scope of one", async () => {
    stubCache(cacheBody({ included_playlist_ids: ["p0"] }));
    await renderScan();
    playlists(1, 1);
    expect(heading()).toHaveAccessibleName("1 of 1 playlist read");
  });

  it("never takes a record back out", async () => {
    stubCache(cacheBody());
    await renderScan();
    playlists(38);
    playlists(20);
    expect(
      screen.getByRole("progressbar", { name: "Playlists" }),
    ).toHaveAttribute("aria-valuenow", "38");
    expect(heading()).toHaveAccessibleName("38 of 105 playlists read");
  });

  it("drops a record for each playlist read, one per 180ms at most", async () => {
    vi.useFakeTimers();
    stubCache(cacheBody());
    await renderScan();
    playlists(0);
    wait(0);
    expect(records()).toBe(0);
    playlists(1);
    wait(0);
    expect(records()).toBe(1);
    playlists(2);
    playlists(3);
    wait(179);
    expect(records()).toBe(1);
    // Both playlists go in with one record, so the crate never lags the scan.
    wait(1);
    expect(records()).toBe(2);
    wait(1000);
    expect(records()).toBe(2);
  });

  // Nothing is saved until the scan finishes, and an emptied crate would read
  // as "your library is empty": the failure shows no crate at all.
  it("puts the crate away when the scan fails", async () => {
    vi.useFakeTimers();
    stubCache(cacheBody());
    await renderScan();
    playlists(38);
    wait(0);
    expect(records()).toBe(1);
    expect(document.querySelector("[data-crate-fill]")).not.toBeNull();
    stream().emit("error", { message: "Spotify artists 429: slow down" });
    wait(1000);
    expect(records()).toBe(0);
    expect(document.querySelector("[data-crate-fill]")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("brings the crate back, empty, when you scan again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubCache(cacheBody());
    await renderScan();
    playlists(38);
    wait(0);
    stream().emit("error", { message: "Spotify artists 429: slow down" });
    await userEvent.click(screen.getByRole("button", { name: "Scan again" }));
    wait(1000);
    expect(document.querySelector("[data-crate-fill]")).not.toBeNull();
    expect(records()).toBe(0);
  });
});

describe("/scan when the read is done", () => {
  it("names the result in the title", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("done", { unique_tracks: 3172, unique_artists: 1476 });
    expect(heading()).toHaveTextContent("3,172 tracks from 1,476 artists.");
    expect(openStreams()).toEqual([]);
  });

  // No new tracks: the server never reads artist genres. A row left unticked
  // under a finished title would read as unfinished work.
  it("drops a step the scan didn't need", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("progress", { stage: "playlists", current: 105, total: 105 });
    stream().emit("progress", { stage: "liked", current: 1, total: 1 });
    stream().emit("done", { unique_tracks: 3172, unique_artists: 1476 });
    expect(
      within(screen.getByRole("list"))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Playlists", "Liked Songs"]);
  });

  // push left /scan in history: Back from /diff re-ran the whole scan.
  it("moves on to /diff after a re-run, replacing /scan in history", async () => {
    vi.useFakeTimers();
    stubCache(cacheBody());
    await renderScan();
    stream().emit("done", { unique_tracks: 3172, unique_artists: 1476 });
    act(() => vi.advanceTimersByTime(899));
    expect(router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/diff");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("moves on to /review after a first run", async () => {
    vi.useFakeTimers();
    stubCache(cacheBody({}, []));
    await renderScan();
    stream().emit("done", { unique_tracks: 40, unique_artists: 30 });
    act(() => vi.advanceTimersByTime(900));
    expect(router.replace).toHaveBeenCalledWith("/review");
  });

  // /diff already sends a first run or a library with no categories on to
  // /review, so it is the safe place to land when the summary is unknown.
  it("still moves on when the library summary can't be read", async () => {
    vi.useFakeTimers();
    stubCache({ error: "cache_version_mismatch" }, 409);
    await renderScan();
    stream().emit("done", { unique_tracks: 3172, unique_artists: 1476 });
    act(() => vi.advanceTimersByTime(900));
    expect(router.replace).toHaveBeenCalledWith("/diff");
  });
});

describe("/scan when the read fails", () => {
  it("says Spotify slowed us down and offers to scan again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubCache(cacheBody());
    await renderScan();
    const raw =
      'Spotify 429 on https://api.spotify.com/v1/playlists/abc/tracks?offset=0&limit=100: {"error":{"status":429}}';
    stream().emit("error", { message: raw });

    expect(heading()).toHaveTextContent("Spotify asked us to slow down.");
    const alert = screen.getByRole("alert");
    // The alert is what gets announced, so it carries the reason too.
    expect(alert).toHaveTextContent("Spotify asked us to slow down.");
    expect(alert).toHaveTextContent("Give it a minute.");
    // The retry is the strip's primary, as on every other page that fails.
    expect(
      within(strip()).getByRole("button", { name: "Scan again" }),
    ).toBeInTheDocument();
    expect(within(alert).queryByRole("button")).toBeNull();
    expect(
      within(alert).getByRole("link", { name: "Change sources" }),
    ).toHaveAttribute("href", "/scope");
    expect(screen.queryByText(raw)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(lock()).toHaveTextContent("open");
    expect(openStreams()).toEqual([]);

    act(() => vi.advanceTimersByTime(5000));
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("scans again in place, with one stream open at a time", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("error", { message: "Spotify artists 429: slow down" });
    await userEvent.click(screen.getByRole("button", { name: "Scan again" }));

    expect(FakeEventSource.all).toHaveLength(2);
    expect(openStreams()).toEqual([stream()]);
    expect(stream().url).toBe("/api/spotify/scan");
    expect(heading()).toHaveTextContent("Reading your library…");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(lock()).toHaveTextContent("locked");
    // The new run starts from nothing, not from the failed run's counts.
    expect(screen.getByRole("list")).not.toHaveTextContent(/\d/);
    // Scan again leaves with the failure: focus lands on the new title, not <body>.
    expect(heading()).toHaveFocus();
  });

  it("sends a signed-out user to reconnect, and nowhere else", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("error", {
      message: "No Spotify auth in cache. User must connect.",
    });
    expect(heading()).toHaveTextContent("Spotify signed you out.");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Spotify signed you out.");
    expect(
      within(strip()).getByRole("link", { name: "Reconnect Spotify" }),
    ).toHaveAttribute("href", "/api/auth/login");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
  });

  // /scope won't let you scan nothing, so an empty library means the chosen
  // sources hold no tracks: scanning them again would fail the same way.
  it("offers only a change of sources when they hold no tracks", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("error", { message: "EMPTY_LIBRARY" });
    expect(heading()).toHaveTextContent("Nothing to read.");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The sources you picked hold no tracks.");
    expect(
      within(strip()).getByRole("link", { name: "Change sources" }),
    ).toHaveAttribute("href", "/scope");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/EMPTY_LIBRARY/)).toBeNull();
  });

  it("keeps the server's own words behind Details for anything else", async () => {
    stubCache(cacheBody());
    await renderScan();
    const raw = "Spotify 500 on https://api.spotify.com/v1/me/tracks: upstream";
    stream().emit("error", { message: raw });
    expect(heading()).toHaveTextContent("The scan stopped.");
    const alert = screen.getByRole("alert");
    expect(
      within(strip()).getByRole("button", { name: "Scan again" }),
    ).toBeInTheDocument();
    expect(
      within(alert).getByRole("link", { name: "Change sources" }),
    ).toBeInTheDocument();
    const details = within(alert).getByRole("group");
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("Details")).toBeInTheDocument();
    expect(within(details).getByText(raw)).toBeInTheDocument();
  });

  // EventSource reconnects by itself after a dropped connection, and a
  // reconnect here is a second full library read.
  it("treats a dropped connection as a stopped scan and never reconnects", async () => {
    stubCache(cacheBody());
    await renderScan();
    stream().emit("error");
    expect(heading()).toHaveTextContent("The scan stopped.");
    expect(openStreams()).toEqual([]);
    expect(FakeEventSource.all).toHaveLength(1);
    expect(screen.queryByRole("group")).toBeNull();
  });
});
