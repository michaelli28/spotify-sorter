import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  NavLockProvider,
  useNavLockState,
} from "@/src/components/design/NavLock";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import ScopePage from "@/app/scope/page";

// Scan writes cache.scope and then reads exactly those sources. Every state
// that could lead to a wrong or empty scope being saved is pinned here.

const PLAYLISTS = [
  { id: "p1", name: "Late Night", track_count: 12, cover_url: null },
  { id: "p2", name: "Late Drives", track_count: 1, cover_url: null },
  { id: "p3", name: "Gym, reluctantly", track_count: 30, cover_url: null },
];

interface Reply {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
type Handler = (init?: RequestInit) => Promise<Reply>;

const reply = (body: unknown, status = 200): Promise<Reply> =>
  Promise.resolve({ ok: status < 400, status, json: async () => body });

const savedScope = (scope: {
  excluded_playlist_ids: string[];
  include_liked_songs: boolean;
}) => ({
  scope: { included_playlist_ids: [], ...scope },
  tracks: {},
});

function stubApi({
  playlists = () => reply({ playlists: PLAYLISTS }),
  cache = () =>
    reply(savedScope({ excluded_playlist_ids: [], include_liked_songs: true })),
  patch = () => reply({ ok: true }),
  tracks = () => reply({ tracks: [] }),
  status = () => reply({ connected: true }),
}: {
  playlists?: Handler;
  cache?: Handler;
  patch?: Handler;
  tracks?: Handler;
  status?: Handler;
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/spotify/playlists")) return playlists(init);
    if (url.startsWith("/api/spotify/playlist-tracks")) return tracks(init);
    if (url === "/api/cache" && init?.method === "PATCH") return patch(init);
    if (url === "/api/cache") return cache(init);
    if (url === "/api/status") return status(init);
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const patches = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");

function deferred() {
  let resolve: (r: Reply) => void = () => {};
  const promise = new Promise<Reply>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const scanButton = () => screen.getByRole("button", { name: "Scan" });
const box = (name: string) => screen.getByRole("checkbox", { name });

afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("/scope loading and failure", () => {
  it("offers no Scan until the playlists arrive", () => {
    stubApi({ playlists: () => new Promise(() => {}) });
    render(<ScopePage />);
    expect(
      screen.getByRole("heading", { name: /What should I read/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading your playlists…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan" })).toBeNull();
  });

  // The top strip holds its room from the first render (spec §7.4): a strip
  // that arrived with the playlists would push the whole page down.
  it("holds the top strip from the first render, saying it is loading", () => {
    stubApi({ playlists: () => new Promise(() => {}) });
    render(<ScopePage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your playlists…",
    );
  });

  // Before: a failed request looked like a library of one (Liked Songs) and
  // Scan would have saved an empty scope over the real one.
  it("shows an error instead of a one-source library when Spotify fails", async () => {
    stubApi({ playlists: () => reply({ error: "Spotify said 503" }, 500) });
    render(<ScopePage />);
    expect(
      await screen.findByText("Spotify didn't send your playlists."),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Spotify didn't send your playlists.",
    );
    expect(screen.getByText("Spotify said 503")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Reconnect Spotify" }),
    ).toHaveAttribute("href", "/api/auth/login");
    // Before: the strip went with Scan and the page jumped 92px up. Try again
    // takes Scan's place instead.
    expect(
      screen
        .getByRole("button", { name: "Try again" })
        .closest("[data-action-bar]"),
    ).not.toBeNull();
  });

  // Before: a rejected fetch left "Loading your library…" up for good.
  it("shows the same error when the request cannot reach the server", async () => {
    stubApi({
      playlists: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    render(<ScopePage />);
    expect(
      await screen.findByText("Spotify didn't send your playlists."),
    ).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  });

  // Before: "Try again" held the brass, though it can never work without a
  // stored Spotify token.
  it("points at Connect Spotify when Spotify isn't connected", async () => {
    stubApi({
      playlists: () =>
        reply({ error: "No Spotify auth in cache. User must connect." }, 500),
      status: () => reply({ connected: false }),
    });
    render(<ScopePage />);
    expect(
      await screen.findByText("Spotify isn't connected."),
    ).toBeInTheDocument();
    const connect = screen.getByRole("link", { name: "Connect Spotify" });
    expect(connect).toHaveAttribute("href", "/api/auth/login");
    expect(connect).toHaveAttribute("data-variant", "primary");
    // In the strip, where Scan would be: nothing jumps when the load ends.
    expect(connect.closest("[data-action-bar]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      screen.queryByText("No Spotify auth in cache. User must connect."),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Scan" })).toBeNull();
  });

  it("keeps Try again when Spotify is connected but failed", async () => {
    stubApi({ playlists: () => reply({ error: "Spotify said 503" }, 500) });
    render(<ScopePage />);
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reconnect Spotify" }),
    ).toHaveAttribute("data-variant", "ghost");
  });

  it("asks Spotify again on Try again", async () => {
    let calls = 0;
    stubApi({
      playlists: () =>
        ++calls === 1
          ? reply({ error: "Spotify said 503" }, 500)
          : reply({ playlists: PLAYLISTS }),
    });
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(
      await screen.findByRole("checkbox", { name: "Late Night" }),
    ).toBeChecked();
    expect(scanButton()).toBeEnabled();
    expect(
      screen.queryByText("Spotify didn't send your playlists."),
    ).toBeNull();
  });

  // Before: Try again unmounted as it was pressed, dropping focus to the body.
  it("keeps focus on Try again while it asks, and hands it to Scan", async () => {
    const asks = [deferred(), deferred(), deferred()];
    let calls = 0;
    stubApi({ playlists: () => asks[calls++]!.promise });
    const failed: Reply = {
      ok: false,
      status: 500,
      json: async () => ({ error: "Spotify said 503" }),
    };
    render(<ScopePage />);
    asks[0]!.resolve(failed);
    const retry = await screen.findByRole("button", { name: "Try again" });

    await userEvent.click(retry);
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your playlists…",
    );
    await userEvent.click(retry);
    expect(calls).toBe(2);

    asks[1]!.resolve(failed);
    await screen.findByText("Spotify didn't send your playlists.");
    expect(retry).toHaveFocus();
    expect(retry).not.toHaveAttribute("aria-disabled");

    await userEvent.click(retry);
    asks[2]!.resolve({
      ok: true,
      status: 200,
      json: async () => ({ playlists: PLAYLISTS }),
    });
    await waitFor(() => expect(scanButton()).toHaveFocus());
  });

  it("reads Liked Songs alone when you have made no playlists", async () => {
    stubApi({ playlists: () => reply({ playlists: [] }) });
    render(<ScopePage />);
    expect(
      await screen.findByText("No other playlists to read."),
    ).toBeInTheDocument();
    expect(box("Liked Songs")).toBeChecked();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(scanButton()).toBeEnabled();
    // "1 of 1 source" would only restate the one checked row above it.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await userEvent.click(box("Liked Songs"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pick at least one source.",
    );
  });
});

describe("/scope saved choices", () => {
  // Before: the page always started all-selected, so an untouched Scan
  // quietly re-added every source you had left out last time.
  it("restores the sources left out last time", async () => {
    stubApi({
      cache: () =>
        reply(
          savedScope({
            excluded_playlist_ids: ["p2"],
            include_liked_songs: false,
          }),
        ),
    });
    render(<ScopePage />);
    expect(
      await screen.findByRole("checkbox", { name: "Late Drives" }),
    ).not.toBeChecked();
    expect(box("Late Night")).toBeChecked();
    expect(box("Liked Songs")).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("2 of 4 sources");
  });

  it("selects everything when the saved choice can't be read", async () => {
    stubApi({ cache: () => reply({ error: "cache_version_mismatch" }, 409) });
    render(<ScopePage />);
    expect(
      await screen.findByRole("checkbox", { name: "Late Drives" }),
    ).toBeChecked();
    expect(box("Liked Songs")).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("4 of 4 sources");
  });
});

describe("/scope Scan", () => {
  it("saves the choice, then opens /scan", async () => {
    const fetchMock = stubApi();
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Late Drives" }),
    );
    await userEvent.click(scanButton());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/scan"));
    const [[, init]] = patches(fetchMock);
    expect(JSON.parse(String(init?.body))).toEqual({
      scope: {
        included_playlist_ids: ["p1", "p3"],
        excluded_playlist_ids: ["p2"],
        include_liked_songs: true,
      },
    });
  });

  // Before: it opened /scan even when the save failed, so the scan read the
  // old scope.
  it("stays put and says so when the save fails", async () => {
    stubApi({ patch: () => reply({ error: "boom" }, 500) });
    render(<ScopePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't save your choice. Nothing was read.",
      ),
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(scanButton()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("sends one save and opens /scan once, however often it is pressed", async () => {
    const save = deferred();
    const fetchMock = stubApi({ patch: () => save.promise });
    render(<ScopePage />);
    const scan = await screen.findByRole("button", { name: "Scan" });
    await userEvent.click(scan);
    await userEvent.click(scan);
    expect(scan).toHaveAttribute("aria-disabled", "true");
    expect(scan).toHaveAccessibleName("Scan");
    save.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(patches(fetchMock)).toHaveLength(1);
  });

  it("does not open /scan once the page has been left mid-save", async () => {
    const save = deferred();
    stubApi({ patch: () => save.promise });
    const { unmount } = render(<ScopePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    unmount();
    save.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(router.push).not.toHaveBeenCalled();
  });

  // Before: the body was built at the click, but rows, bulk buttons and the
  // preview toggle stayed live, so the screen could show a choice the scan
  // would not read (even "Pick at least one source." while it read everything).
  it("holds the choice still while Scan saves it", async () => {
    const save = deferred();
    const fetchMock = stubApi({ patch: () => save.promise });
    render(<ScopePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));

    await userEvent.click(box("Late Drives"));
    expect(box("Late Drives")).toBeChecked();
    expect(box("Late Drives")).toBeDisabled();
    expect(box("Liked Songs")).toBeDisabled();
    const deselect = screen.getByRole("button", { name: "Deselect all" });
    expect(deselect).toBeDisabled();
    await userEvent.click(deselect);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview Late Night, 12 tracks" }),
    );
    const dialog = await screen.findByRole("dialog");
    const leaveOut = within(dialog).getByRole("button", { name: "Leave out" });
    expect(leaveOut).toBeDisabled();
    await userEvent.click(leaveOut);

    expect(box("Late Night")).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("4 of 4 sources");
    save.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/scan"));
    const [[, init]] = patches(fetchMock);
    expect(JSON.parse(String(init?.body)).scope).toMatchObject({
      excluded_playlist_ids: [],
      include_liked_songs: true,
    });
  });

  // Spec §5: NavLock on every async operation. Leaving mid-save is already
  // harmless (see above); the lock says so before the click, not after.
  it("locks the site nav while Scan saves, and frees it if the save fails", async () => {
    const save = deferred();
    stubApi({ patch: () => save.promise });
    function Lock() {
      return (
        <p data-testid="lock">{useNavLockState().locked ? "on" : "off"}</p>
      );
    }
    render(
      <NavLockProvider>
        <ScopePage />
        <Lock />
      </NavLockProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    expect(screen.getByTestId("lock")).toHaveTextContent("on");
    save.resolve({ ok: false, status: 500, json: async () => ({}) });
    await screen.findByText("Couldn't save your choice. Nothing was read.");
    // The lock lets go in an effect cleanup, which can land after the line.
    await waitFor(() =>
      expect(screen.getByTestId("lock")).toHaveTextContent("off"),
    );
  });

  // Before: the count sat unchanged through the save, so the disabled rows
  // gave no reason for ignoring a click.
  it("says it is saving while Scan saves", async () => {
    const save = deferred();
    stubApi({ patch: () => save.promise });
    render(<ScopePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saving 4 of 4 sources…",
    );
    save.resolve({ ok: false, status: 500, json: async () => ({}) });
    await screen.findByText("Couldn't save your choice. Nothing was read.");
  });

  it("frees the choice again when the save fails", async () => {
    stubApi({ patch: () => reply({ error: "boom" }, 500) });
    render(<ScopePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    await screen.findByText("Couldn't save your choice. Nothing was read.");
    expect(box("Late Drives")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deselect all" })).toBeEnabled();
  });

  // Before: the failure line stayed up after edits, hiding the live count.
  it("drops the save failure once the choice changes", async () => {
    stubApi({ patch: () => reply({ error: "boom" }, 500) });
    render(<ScopePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scan" }));
    await screen.findByText("Couldn't save your choice. Nothing was read.");
    await userEvent.click(box("Late Drives"));
    expect(screen.getByRole("status")).toHaveTextContent("3 of 4 sources");

    await userEvent.click(scanButton());
    await screen.findByText("Couldn't save your choice. Nothing was read.");
    await userEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pick at least one source.",
    );
  });

  // Scan sits in the top strip, before the list, and every row is two Tab
  // stops: from the last row it is about 220 presses back at 105 playlists.
  it("offers one stop back to Scan from the end of the list", async () => {
    stubApi();
    render(<ScopePage />);
    const back = await screen.findByRole("button", { name: "Back to Scan" });
    const lastRow = screen.getByRole("button", {
      name: "Preview Gym, reluctantly, 30 tracks",
    });
    expect(
      lastRow.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(back);
    expect(scanButton()).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    // Nothing to go back to while Scan can't be pressed.
    expect(screen.queryByRole("button", { name: "Back to Scan" })).toBeNull();
  });

  it("cannot scan nothing", async () => {
    stubApi();
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Deselect all" }),
    );
    expect(scanButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pick at least one source.",
    );
  });

  it("counts what it will read as you change it", async () => {
    stubApi();
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Late Night" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("3 of 4 sources");
  });
});

describe("/scope filter and bulk choices", () => {
  it("names the bulk buttons for what they touch while filtering", async () => {
    stubApi();
    render(<ScopePage />);
    expect(
      await screen.findByRole("button", { name: "Select all" }),
    ).toBeDisabled();
    await userEvent.type(screen.getByRole("searchbox"), "late");
    expect(
      screen.getByRole("button", { name: "Deselect these 2" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Deselect all" })).toBeNull();
  });

  // Unfiltered, the bulk buttons change Liked Songs too. Before: on a phone
  // they sat under it and read as acting on the playlists below only.
  it("puts the bulk buttons before Liked Songs, which they also change", async () => {
    stubApi();
    render(<ScopePage />);
    const deselect = await screen.findByRole("button", {
      name: "Deselect all",
    });
    expect(
      deselect.compareDocumentPosition(box("Liked Songs")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(deselect);
    expect(box("Liked Songs")).not.toBeChecked();
  });

  // Before: "Deselect all" with a filter typed also cleared every hidden
  // source, and Liked Songs.
  it("leaves hidden sources alone when acting on a filtered list", async () => {
    stubApi();
    render(<ScopePage />);
    await userEvent.type(await screen.findByRole("searchbox"), "late");
    await userEvent.click(
      screen.getByRole("button", { name: "Deselect these 2" }),
    );
    expect(box("Late Night")).not.toBeChecked();
    expect(box("Late Drives")).not.toBeChecked();
    expect(box("Liked Songs")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(box("Gym, reluctantly")).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("2 of 4 sources");
  });

  it("says one, not these 1, for a single match", async () => {
    stubApi();
    render(<ScopePage />);
    await userEvent.type(await screen.findByRole("searchbox"), "gym");
    expect(
      screen.getByRole("button", { name: "Deselect this one" }),
    ).toBeEnabled();
  });

  // Before: "Nothing matches “liked”." sat right under the Liked Songs row.
  it("says no playlists match, not nothing, under the Liked Songs row", async () => {
    stubApi();
    render(<ScopePage />);
    await userEvent.type(await screen.findByRole("searchbox"), "liked");
    expect(box("Liked Songs")).toBeInTheDocument();
    expect(screen.getByText("No playlists match “liked”.")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it("clears the filter with its Clear button or Escape", async () => {
    stubApi();
    render(<ScopePage />);
    const search = await screen.findByRole("searchbox");
    expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();
    await userEvent.type(search, "zzz");
    expect(screen.getByText("No playlists match “zzz”.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(search).toHaveValue("");
    expect(box("Late Night")).toBeInTheDocument();
    await userEvent.type(search, "gym{Escape}");
    expect(search).toHaveValue("");
    expect(box("Late Drives")).toBeInTheDocument();
  });
});

describe("/scope rows and preview", () => {
  // Before: framer's whileTap gave every card wrapper a stray tab stop.
  it("gives each row exactly two stops: its checkbox and its preview", async () => {
    stubApi();
    render(<ScopePage />);
    const row = (
      await screen.findByRole("checkbox", { name: "Late Night" })
    ).closest("li");
    expect(within(row!).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(row!).getAllByRole("button")).toHaveLength(1);
    expect(
      row!.querySelectorAll('[tabindex]:not([tabindex="-1"])'),
    ).toHaveLength(0);
  });

  it("stamps the box while a source is in, and lifts the stamp when it is left out", async () => {
    stubApi();
    render(<ScopePage />);
    const row = (
      await screen.findByRole("checkbox", { name: "Late Night" })
    ).closest("li")!;
    const stamp = row.querySelector("[data-stamp]");
    expect(stamp).toHaveAttribute("data-stamp", "in");
    await userEvent.click(box("Late Night"));
    expect(stamp).toHaveAttribute("data-stamp", "out");
    await userEvent.click(box("Late Night"));
    expect(stamp).toHaveAttribute("data-stamp", "in");
  });

  // Brief §3 Scope: the playlist's real image, falling back to a plain sleeve.
  // The art is decoration: the box is still named by the playlist alone.
  it("prints each playlist's own cover, and a plain sleeve when it has none or it fails", async () => {
    const art = "https://i.scdn.co/image/ab67616d0000b273aaaa";
    stubApi({
      playlists: () =>
        reply({
          playlists: [
            { id: "p0", name: "Covered", track_count: 3, cover_url: art },
            ...PLAYLISTS,
          ],
        }),
    });
    render(<ScopePage />);
    const covered = (
      await screen.findByRole("checkbox", { name: "Covered" })
    ).closest("li")!;
    const img = covered.querySelector("img");
    expect(img).toHaveAttribute("src", art);
    expect(img).toHaveAttribute("alt", "");

    const bare = box("Late Night").closest("li")!;
    expect(bare.querySelector("img")).toBeNull();
    expect(
      within(bare).getByRole("img", { name: "No cover art", hidden: true }),
    ).toBeInTheDocument();

    fireEvent.error(img!);
    expect(covered.querySelector("img")).toBeNull();
    expect(
      within(covered).getByRole("img", { name: "No cover art", hidden: true }),
    ).toBeInTheDocument();
    expect(box("Covered")).toBeInTheDocument();
  });

  it("opens the preview from a row's track count", async () => {
    stubApi({
      tracks: () =>
        reply({
          tracks: [{ id: "t1", title: "Nights", artist_name: "Frank Ocean" }],
        }),
    });
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Preview Late Night, 12 tracks",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Late Night" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Nights")).toBeInTheDocument();
  });

  it("says track, not tracks, for a one-track playlist", async () => {
    stubApi();
    render(<ScopePage />);
    expect(
      await screen.findByRole("button", {
        name: "Preview Late Drives, 1 track",
      }),
    ).toBeInTheDocument();
  });

  // The row prints Spotify's total, which counts local files and episodes;
  // the preview lists only what a scan can read. Before: "12 tracks" on the
  // row and "1 track" on the tag, with nothing tying the two together.
  it("tells the preview's count from the row's when Spotify sends fewer", async () => {
    stubApi({
      tracks: () =>
        reply({
          tracks: [{ id: "t1", title: "Nights", artist_name: "Frank Ocean" }],
        }),
    });
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Preview Late Night, 12 tracks",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Late Night" });
    expect(
      await within(dialog).findByText("1 of 12 tracks"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Preview Late Drives, 1 track" }),
    );
    const same = await screen.findByRole("dialog", { name: "Late Drives" });
    expect(await within(same).findByText("1 track")).toBeInTheDocument();
  });

  it("leaves a playlist out from inside its preview", async () => {
    stubApi();
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Preview Late Night, 12 tracks",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Leave out" }),
    );
    expect(box("Late Night")).not.toBeChecked();
    expect(
      within(dialog).getByRole("button", { name: "Include" }),
    ).toBeInTheDocument();
  });

  it("previews Liked Songs, and includes it from there", async () => {
    stubApi({
      cache: () =>
        reply(
          savedScope({ excluded_playlist_ids: [], include_liked_songs: false }),
        ),
    });
    render(<ScopePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Preview Liked Songs" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Liked Songs" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Include" }),
    );
    expect(box("Liked Songs")).toBeChecked();
  });
});
