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

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));
// jsdom has no canvas: the sleeve's JPEG is faked, the upload is not.
const jpeg = vi.hoisted(() => ({ fail: false }));
vi.mock("@/src/components/graphics/sleeve-to-jpeg", () => ({
  sleeveToJpeg: async () => {
    if (jpeg.fail) throw new Error("canvas");
    return "QUJD";
  },
}));

import ApplyPage from "@/app/apply/page";
import { APPLY_ARM_MS } from "@/src/components/apply/useArmed";
import {
  NavLockProvider,
  useNavLockState,
} from "@/src/components/design/NavLock";

const AT = "2026-09-01T00:00:00.000Z";
const SYNC_LINE =
  "Apply makes each playlist match exactly: tracks added by hand in Spotify are removed.";

function category(name: string, playlistId: string | null = null) {
  return {
    name,
    description: "",
    spotify_playlist_id: playlistId,
    created_at: AT,
    example_track_ids: [],
  };
}

function assigned(category_id: string) {
  return {
    matches: [{ category_id, score: 90 }],
    classified_at: AT,
    override: null,
  };
}

// Dusk holds t1 and t3, Rain holds t1 and t2: 3 distinct tracks, 4 placements.
function library(over: Record<string, unknown> = {}) {
  return {
    config: { prefix: "✨", confidence_threshold: 65, anthropic_model: "m" },
    categories: { c1: category("Dusk"), c2: category("Rain") },
    tracks: {
      t1: { artist_id: "a", title: "One", first_seen: AT },
      t2: { artist_id: "a", title: "Two", first_seen: AT },
      t3: { artist_id: "a", title: "Three", first_seen: AT },
    },
    assignments: {
      t1: {
        matches: [
          { category_id: "c1", score: 90 },
          { category_id: "c2", score: 80 },
        ],
        classified_at: AT,
        override: null,
      },
      t2: assigned("c2"),
      t3: assigned("c1"),
    },
    ...over,
  };
}

type Stream = {
  send: (event: string, data: unknown) => void;
  close: () => void;
};

type Answer = (res: Response) => void;

let cacheAnswers: Answer[] = [];
let coverAnswers: Answer[] = [];
let streams: Stream[] = [];
let postStatus = 200;
let fetchMock: ReturnType<typeof vi.fn>;

// /api/cache and each cover upload wait for the test to answer them; each
// POST /api/spotify/apply gets an open SSE stream the test pushes events into.
function stubFetch() {
  cacheAnswers = [];
  coverAnswers = [];
  streams = [];
  postStatus = 200;
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/cache") {
      return new Promise<Response>((resolve) => cacheAnswers.push(resolve));
    }
    if (url === "/api/spotify/cover" && init?.method === "POST") {
      return new Promise<Response>((resolve) => coverAnswers.push(resolve));
    }
    if (url === "/api/spotify/apply" && init?.method === "POST") {
      if (postStatus !== 200) {
        return Promise.resolve(new Response("no", { status: postStatus }));
      }
      const enc = new TextEncoder();
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      streams.push({
        send: (event, data) =>
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          ),
        close: () => controller.close(),
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
}

async function answerCache(body: unknown, status = 200) {
  await act(async () => {
    cacheAnswers.at(-1)!(new Response(JSON.stringify(body), { status }));
  });
}

async function push(event: string, data: unknown) {
  await act(async () => {
    streams.at(-1)!.send(event, data);
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function hangUp() {
  await act(async () => {
    streams.at(-1)!.close();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function posts() {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url) === "/api/spotify/apply" &&
      (init as RequestInit | undefined)?.method === "POST",
  ).length;
}

/** The bodies of every cover upload so far, in order. */
function coverPosts(): Array<{ categoryId: string; jpegBase64: string }> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url) === "/api/spotify/cover")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

async function answerCover(body: unknown, status = 200) {
  await act(async () => {
    coverAnswers.shift()!(Response.json(body, { status }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

const DONE = {
  created: 2,
  updated: 0,
  tracks_added: 2,
  playlists: [
    {
      id: "pl-1",
      category_id: "c1",
      name: "✨ Dusk",
      track_count: 2,
      created: true,
    },
    {
      id: "pl-2",
      category_id: "c2",
      name: "✨ Rain",
      track_count: 2,
      created: true,
    },
  ],
};

async function applyDone() {
  await loaded();
  await userEvent.click(apply());
  await push("progress", { stage: "category", done: 2, total: 2 });
  await push("done", DONE);
}

function LockProbe() {
  const { locked } = useNavLockState();
  return <p data-testid="nav">{locked ? "locked" : "open"}</p>;
}

function renderPage() {
  return render(
    <NavLockProvider>
      <ApplyPage />
      <LockProbe />
    </NavLockProvider>,
  );
}

// Apply answers only once it has been ready APPLY_ARM_MS (a stray click from
// /classify lands on it otherwise). setTimeout is faked for this alone.
async function arm() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(APPLY_ARM_MS);
  });
}

async function loaded(body: unknown = library()) {
  renderPage();
  await answerCache(body);
  await arm();
}

/** The top strip's status line (the close has its own live region). */
function strip() {
  return document.querySelector<HTMLElement>(
    "[data-action-bar] [role=status]",
  )!;
}

function apply() {
  return screen.getByRole("button", { name: "Apply" });
}

// The press list's rows: the manifest before the write, the credits after.
function row(name: string) {
  const list = screen.getByRole("region", { name: "Playlists" });
  return within(list).getByText(name).closest("li")!;
}

/** The row's sleeve slot, which carries its print state. */
function sleeve(name: string) {
  return row(name).querySelector<HTMLElement>("[data-state]")!;
}

// The whole sentence, across the number spans inside it.
function sentence(text: string) {
  return screen.getByText(
    (_, el) => el?.tagName === "P" && el.textContent === text,
  );
}

beforeEach(() => {
  // Only setTimeout, and it keeps pace with real time: the stream, the pacer
  // and user-event behave as they do unfaked.
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout"],
    shouldAdvanceTime: true,
  });
  stubFetch();
  motion.reduced = false;
  jpeg.fail = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/apply before the write", () => {
  it("keeps Apply disabled until the library has loaded", async () => {
    renderPage();
    expect(apply()).toBeDisabled();
    await answerCache(library());
    expect(apply()).toBeEnabled();
  });

  it("never writes on load", async () => {
    await loaded();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posts()).toBe(0);
  });

  it("says what will be written, counting each track once", async () => {
    await loaded();
    expect(
      sentence("3 tracks into 2 new private playlists."),
    ).toBeInTheDocument();
  });

  // The sync line under it already says an existing playlist is matched
  // exactly, so "Nothing is added twice." would say it again.
  it("counts the playlists that already exist, once", async () => {
    await loaded(
      library({
        categories: { c1: category("Dusk", "pl-1"), c2: category("Rain") },
      }),
    );
    expect(
      sentence("3 tracks into 1 new private playlist and 1 you already have."),
    ).toBeInTheDocument();
    expect(screen.getByText(SYNC_LINE)).toBeInTheDocument();
  });

  it("groups thousands", async () => {
    const tracks: Record<string, unknown> = {};
    const assignments: Record<string, unknown> = {};
    for (let i = 0; i < 1200; i++) {
      tracks[`t${i}`] = { artist_id: "a", title: `T${i}`, first_seen: AT };
      assignments[`t${i}`] = assigned("c1");
    }
    await loaded(library({ tracks, assignments }));
    expect(
      sentence("1,200 tracks into 2 new private playlists."),
    ).toBeInTheDocument();
  });

  it("lists every playlist it will write, in the order it writes them", async () => {
    await loaded();
    const items = within(
      screen.getByRole("region", { name: "Playlists" }),
    ).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["01Dusk2", "02Rain2"]);
  });

  // Spec §3.4: Apply now also replaces each playlist's cover. A write the
  // confirmation must name — as an attempt: a token granted before covers
  // existed gets a 403, so it can't promise the cover lands.
  it("says each sleeve is sent as the cover, and what to do if Spotify refuses", async () => {
    await loaded();
    expect(
      screen.getByText(
        "Each playlist's sleeve is sent as its Spotify cover. If Spotify says no, Reconnect Spotify and apply again.",
      ),
    ).toBeInTheDocument();
  });

  // Spec §8.1: Apply now takes out songs added by hand. Said once, before
  // the only click that does it.
  it("says, once, that Apply makes each playlist match exactly", async () => {
    await loaded();
    expect(screen.getAllByText(SYNC_LINE)).toHaveLength(1);
  });

  // The manifest is home's press list: every sleeve as a proof, no links out
  // of a page whose one job is the confirmation.
  it("shows each playlist's sleeve as a proof, and no row leaves the page", async () => {
    await loaded();
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "proof");
    expect(sleeve("Rain")).toHaveAttribute("data-state", "proof");
    expect(
      within(screen.getByRole("region", { name: "Playlists" })).queryAllByRole(
        "link",
      ),
    ).toHaveLength(0);
  });

  it("offers a way back to tuning when every track is sorted", async () => {
    await loaded();
    expect(screen.getByRole("link", { name: "Tune the fit" })).toHaveAttribute(
      "href",
      "/classify",
    );
  });

  // /classify starts a paid run on load while tracks are unsorted.
  it("never links to /classify while tracks are unsorted", async () => {
    const lib = library();
    await loaded({
      ...lib,
      tracks: {
        ...lib.tracks,
        t4: { artist_id: "a", title: "Four", first_seen: AT },
      },
    });
    expect(screen.queryByRole("link", { name: "Tune the fit" })).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("has nothing to apply without categories, and no Apply button", async () => {
    await loaded(library({ categories: {} }));
    expect(
      screen.getByRole("heading", { name: "Nothing to apply yet." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Playlists" })).toBeNull();
    // /review with no categories starts a paid propose run on load.
    expect(screen.queryByRole("link", { name: /categor/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    // Home is a way out, not this page's action: no primary in the strip.
    expect(
      document.querySelector("[data-action-bar] [data-variant=primary]"),
    ).toBeNull();
  });

  it("says when the library can't be read, and reads it again on Try again", async () => {
    renderPage();
    await answerCache({ error: "boom" }, 500);
    expect(
      screen.getByRole("heading", { name: "Couldn't read your library." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(cacheAnswers).toHaveLength(2);
    await answerCache(library());
    expect(apply()).toBeEnabled();
    expect(posts()).toBe(0);
  });
});

describe("/apply while writing", () => {
  it("writes once on Apply and locks the nav until it ends", async () => {
    await loaded();
    expect(screen.getByTestId("nav")).toHaveTextContent("open");
    await userEvent.click(apply());
    expect(posts()).toBe(1);
    expect(
      screen.getByRole("heading", { name: "Placing tracks…" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.getByTestId("nav")).toHaveTextContent("locked");
    await push("done", {
      created: 2,
      updated: 0,
      tracks_added: 4,
      playlists: [],
    });
    expect(screen.getByTestId("nav")).toHaveTextContent("open");
  });

  it("writes once on a double click", async () => {
    await loaded();
    await userEvent.dblClick(apply());
    expect(posts()).toBe(1);
  });

  // /classify's "Apply to Spotify" sits where Apply lands: the second half of
  // its double click must not start the write.
  it("ignores the second click of a double click", async () => {
    await loaded();
    fireEvent.click(apply(), { detail: 2 });
    expect(posts()).toBe(0);
    expect(apply()).toBeInTheDocument();
  });

  it("ignores a click before Apply has been on screen long enough", async () => {
    renderPage();
    await answerCache(library());
    expect(apply()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(apply(), { detail: 1 });
    expect(posts()).toBe(0);
    await arm();
    expect(apply()).not.toHaveAttribute("aria-disabled");
    fireEvent.click(apply(), { detail: 1 });
    expect(posts()).toBe(1);
  });

  // A keyboard press has detail 0.
  it("writes on a keyboard press once armed", async () => {
    await loaded();
    apply().focus();
    await userEvent.keyboard("{Enter}");
    expect(posts()).toBe(1);
  });

  it("says Starting… with no fraction before the first playlist", async () => {
    await loaded();
    await userEvent.click(apply());
    expect(screen.getByRole("status")).toHaveTextContent(/^Starting…$/);
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "pending");
  });

  // Brief §4.4 C: event i prints sleeve i - 1, never ahead of Spotify.
  it("names the playlist being written and prints the ones already written", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2, name: "x" });
    expect(screen.getByRole("status")).toHaveTextContent("2 of 2 · Rain");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    await waitFor(() =>
      expect(sleeve("Dusk")).toHaveAttribute("data-state", "printed"),
    );
    expect(sleeve("Rain")).toHaveAttribute("data-state", "current");
    expect(sleeve("Rain")).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("img", { name: "Writing now" }),
    ).toBeInTheDocument();
  });

  // The browser uploads the covers after `done`: a closed tab gets none.
  it("asks to keep the page open until the covers are on", async () => {
    await loaded();
    await userEvent.click(apply());
    expect(
      screen.getByText(
        "Keep this page open: covers are sent after the last playlist.",
      ),
    ).toBeInTheDocument();
  });

  // The run's header mirrors the ready one line for line, so the list under
  // it doesn't move when Apply is pressed.
  it("keeps the match-exactly line while it writes", async () => {
    await loaded();
    await userEvent.click(apply());
    expect(screen.getAllByText(SYNC_LINE)).toHaveLength(1);
  });

  // Spec §7.1: a cover upload during the write races Apply's cache writes.
  it("uploads no cover while the write is running", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2 });
    await push("progress", { stage: "category", done: 2, total: 2 });
    expect(coverPosts()).toHaveLength(0);
  });

  it("moves focus to the new heading when the write starts", async () => {
    await loaded();
    await userEvent.click(apply());
    expect(
      screen.getByRole("heading", { name: "Placing tracks…" }),
    ).toHaveFocus();
  });

  // On a phone most of the print run is below the fold.
  it("keeps the row on the press in view until the owner scrolls", async () => {
    const scrolled: Element[] = [];
    const scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      await loaded();
      await userEvent.click(apply());
      await push("progress", { stage: "category", done: 0, total: 2 });
      expect(scrolled.at(-1)).toBe(row("Dusk"));
      fireEvent.wheel(window);
      await push("progress", { stage: "category", done: 1, total: 2 });
      expect(sleeve("Rain")).toHaveAttribute("data-state", "current");
      expect(scrolled).not.toContain(row("Rain"));
    } finally {
      // jsdom has none: leave it as found.
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });
});

describe("/apply when the write stops", () => {
  it("says how far it got, and Try again writes again", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2 });
    await push("error", { message: "Spotify returned 429." });
    expect(
      screen.getByRole("heading", { name: "1 of 2 printed." }),
    ).toHaveFocus();
    expect(screen.getByText("Spotify returned 429.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "What's written stays. Trying again picks up from there.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(sleeve("Dusk")).toHaveAttribute("data-state", "printed"),
    );
    expect(sleeve("Rain")).toHaveAttribute("data-state", "failed");
    expect(
      within(row("Rain")).getByRole("img", { name: "Stopped here" }),
    ).toBeInTheDocument();
    expect(coverPosts()).toHaveLength(0);
    expect(screen.getByTestId("nav")).toHaveTextContent("open");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(posts()).toBe(2);
  });

  it("says Couldn't start. when nothing was written", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("error", { message: "Not connected to Spotify." });
    expect(
      screen.getByRole("heading", { name: "Couldn't start." }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/What's written stays/)).toBeNull();
    // Still the manifest: Try again writes what it shows.
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "proof");
    expect(sleeve("Rain")).toHaveAttribute("data-state", "proof");
  });

  // "Couldn't start." sat over a ✕ on the first row, which says it did.
  it("counts from zero when the first playlist failed", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 0, total: 2 });
    await push("error", { message: "Spotify returned 500." });
    expect(
      screen.getByRole("heading", { name: "0 of 2 printed." }),
    ).toBeInTheDocument();
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "failed");
    expect(screen.queryByText(/What's written stays/)).toBeNull();
  });

  it("treats a refused request as an error, not a lost connection", async () => {
    await loaded();
    postStatus = 403;
    await userEvent.click(apply());
    expect(
      await screen.findByRole("heading", { name: "Couldn't start." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/HTTP 403/)).toBeInTheDocument();
  });

  // The server job keeps writing after a client disconnect; a second POST
  // joins it instead of starting over.
  it("calls a dropped stream a lost connection, and Rejoin joins the write", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2 });
    await hangUp();
    expect(
      screen.getByRole("heading", { name: "Lost the connection." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The write may still be running."),
    ).toBeInTheDocument();
    expect(screen.getByText(/^1 of 2 printed\.\s*$/)).toBeInTheDocument();
    expect(screen.getByText("Nothing is added twice.")).toBeInTheDocument();
    expect(screen.queryByText(/rate-limited/)).toBeNull();
    // "Reconnect" is the Spotify sign-in elsewhere on this page.
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Rejoin the write" }),
    );
    expect(posts()).toBe(2);
  });

  // Rejoining keeps what's printed until the job says otherwise.
  it("keeps the printed sleeves while Rejoin joins the write", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2 });
    await waitFor(() =>
      expect(sleeve("Dusk")).toHaveAttribute("data-state", "printed"),
    );
    await hangUp();
    await userEvent.click(
      screen.getByRole("button", { name: "Rejoin the write" }),
    );
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "printed");
    expect(screen.getByRole("status")).toHaveTextContent("2 of 2 · Rain");
  });

  // Try again is a new run from the first playlist.
  it("blanks the credits when Try again starts over", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2 });
    await push("error", { message: "Spotify returned 429." });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "pending");
    expect(screen.getByRole("status")).toHaveTextContent(/^Starting…$/);
  });
});

describe("/apply when the write is done", () => {
  it("prints the credits and ends with Open Spotify and Home", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("done", DONE);
    expect(
      screen.getByRole("heading", { name: "2 playlists on Spotify." }),
    ).toHaveFocus();
    // The close counts them already.
    expect(screen.getByText("All new")).toBeInTheDocument();
    expect(screen.getByText("2 tracks placed.")).toBeInTheDocument();
    // The manifest's rows are now the credits, each opening its playlist.
    expect(screen.getByRole("link", { name: /Dusk/ })).toHaveAttribute(
      "href",
      "spotify:playlist:pl-1",
    );
    expect(screen.getByRole("link", { name: /Rain/ })).toHaveAttribute(
      "href",
      "spotify:playlist:pl-2",
    );
    expect(screen.getByRole("link", { name: "Open Spotify" })).toHaveAttribute(
      "href",
      "spotify:",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByText(/select the ✨ playlists → right-click → Add to Folder/),
    ).toBeInTheDocument();
    await waitFor(() => expect(posts()).toBe(1));
  });

  // Pacing: at most one sleeve per 30ms once the writes have landed.
  it("rolls the sleeves in after a done that skipped the progress", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("done", DONE);
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "pending");
    await waitFor(() =>
      expect(sleeve("Rain")).not.toHaveAttribute("data-state", "pending"),
    );
  });

  it("prints every sleeve at once under reduced motion", async () => {
    motion.reduced = true;
    await loaded();
    await userEvent.click(apply());
    await push("done", DONE);
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "printed");
    expect(sleeve("Rain")).toHaveAttribute("data-state", "printed");
    expect(
      screen.getByRole("heading", { name: "2 playlists on Spotify." }).style
        .opacity,
    ).not.toBe("0");
  });

  // Spec §7.1: after done, one at a time, with the sleeve as the JPEG.
  it("uploads each written playlist's cover after the write, one at a time", async () => {
    await applyDone();
    expect(coverPosts()).toEqual([{ categoryId: "c1", jpegBase64: "QUJD" }]);
    expect(screen.getByTestId("nav")).toHaveTextContent("locked");
    expect(strip()).toHaveTextContent("Adding covers: 0 of 2");
    await answerCover({ ok: true });
    expect(coverPosts()).toHaveLength(2);
    expect(coverPosts()[1]).toEqual({ categoryId: "c2", jpegBase64: "QUJD" });
    expect(screen.getByTestId("nav")).toHaveTextContent("locked");
    await answerCover({ ok: true });
    expect(strip()).toHaveTextContent(/^Every cover added\.$/);
    expect(screen.getByTestId("nav")).toHaveTextContent("open");
    expect(posts()).toBe(1);
  });

  // Like the nav: leaving mid-upload would drop the covers still to come.
  it("locks the way home until the covers are done", async () => {
    await applyDone();
    expect(screen.getByText("Home").closest("[inert]")).not.toBeNull();
    await answerCover({ ok: true });
    await answerCover({ ok: true });
    expect(screen.getByText("Home").closest("[inert]")).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  // Registration is the cover: in register only once Spotify took it.
  it("locks a sleeve into register when its cover lands", async () => {
    await applyDone();
    await waitFor(() =>
      expect(sleeve("Rain")).toHaveAttribute("data-state", "printed"),
    );
    await answerCover({ ok: true });
    expect(sleeve("Dusk")).toHaveAttribute("data-state", "registered");
    expect(sleeve("Rain")).toHaveAttribute("data-state", "printed");
  });

  // Spec §7.2: retrying can't add a scope the token lacks.
  it("asks for a reconnect, with no Retry, when the token lacks the cover scope", async () => {
    await applyDone();
    await answerCover({ error: "missing_scope" }, 403);
    expect(coverPosts()).toHaveLength(1);
    expect(
      screen.getByText("Reconnect Spotify to add covers, then apply again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect" })).toHaveAttribute(
      "href",
      "/api/auth/login",
    );
    expect(screen.queryByRole("button", { name: "Retry covers" })).toBeNull();
    // A cover failure never fails the Apply.
    expect(
      screen.getByRole("heading", { name: "2 playlists on Spotify." }),
    ).toBeInTheDocument();
    // The notice says it, announced; the strip doesn't say it again.
    expect(strip()).toBeEmptyDOMElement();
    expect(
      screen
        .getAllByRole("status")
        .some((el) =>
          el.textContent?.startsWith("Reconnect Spotify to add covers"),
        ),
    ).toBe(true);
    expect(screen.getByTestId("nav")).toHaveTextContent("open");
    await waitFor(() =>
      expect(sleeve("Dusk")).toHaveAttribute("data-state", "printed"),
    );
  });

  it("treats a revoked token like a missing scope", async () => {
    await applyDone();
    await answerCover({ error: "reconnect" }, 401);
    expect(coverPosts()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Reconnect" })).toBeInTheDocument();
  });

  it("counts other failures and retries only those", async () => {
    await applyDone();
    await answerCover({ ok: true });
    await answerCover({ error: "upload_failed" }, 502);
    expect(screen.getByText("1 cover didn't upload.")).toBeInTheDocument();
    expect(strip()).toHaveTextContent("1 of 2 covers added.");
    // The one that didn't go on is named; the one that did is not. Sleeves
    // print paced (up to 30ms apart), so wait for Rain's rather than assume it.
    expect(
      await within(row("Rain")).findByRole("img", { name: "No cover" }),
    ).toBeInTheDocument();
    expect(within(row("Dusk")).queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open Spotify" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry covers" }));
    expect(coverPosts()).toHaveLength(3);
    expect(coverPosts()[2]).toEqual({ categoryId: "c2", jpegBase64: "QUJD" });
    await answerCover({ ok: true });
    expect(screen.queryByText(/didn't upload/)).toBeNull();
    expect(strip()).toHaveTextContent("Every cover added.");
    expect(posts()).toBe(1);
  });

  // Retry covers used to unmount the moment it was pressed, dropping keyboard
  // focus on <body>.
  it("keeps keyboard focus through a retry", async () => {
    await applyDone();
    await answerCover({ ok: true });
    await answerCover({ error: "upload_failed" }, 502);
    const retry = screen.getByRole("button", { name: "Retry covers" });
    retry.focus();
    await userEvent.keyboard("{Enter}");
    expect(coverPosts()).toHaveLength(3);
    expect(screen.getByText("Retrying covers…")).toBeInTheDocument();
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute("aria-disabled", "true");
    // Still failing: the same button, ready again, still focused.
    await answerCover({ error: "upload_failed" }, 502);
    expect(screen.getByText("1 cover didn't upload.")).toBeInTheDocument();
    expect(retry).toHaveFocus();
    expect(retry).not.toHaveAttribute("aria-disabled");
    // Cleared: the button goes, and focus goes to the close, not <body>.
    await userEvent.keyboard("{Enter}");
    await answerCover({ ok: true });
    expect(screen.queryByRole("button", { name: "Retry covers" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "2 playlists on Spotify." }),
    ).toHaveFocus();
  });

  it("counts a sleeve that won't render as a cover that didn't upload", async () => {
    jpeg.fail = true;
    await applyDone();
    await waitFor(() =>
      expect(screen.getByText("2 covers didn't upload.")).toBeInTheDocument(),
    );
    expect(coverPosts()).toHaveLength(0);
  });
});
