import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApplyPage from "@/app/apply/page";
import {
  NavLockProvider,
  useNavLockState,
} from "@/src/components/design/NavLock";

const AT = "2026-09-01T00:00:00.000Z";

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
let streams: Stream[] = [];
let postStatus = 200;
let fetchMock: ReturnType<typeof vi.fn>;

// /api/cache waits for the test to answer it; each POST /api/spotify/apply
// gets an open SSE stream the test pushes events into.
function stubFetch() {
  cacheAnswers = [];
  streams = [];
  postStatus = 200;
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/cache") {
      return new Promise<Response>((resolve) => cacheAnswers.push(resolve));
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

async function loaded(body: unknown = library()) {
  renderPage();
  await answerCache(body);
}

function apply() {
  return screen.getByRole("button", { name: "Apply" });
}

function row(name: string) {
  const list = screen.getByRole("list", { name: "Playlists" });
  return within(list).getByText(name).closest("li")!;
}

// The whole sentence, across the number spans inside it.
function sentence(text: string) {
  return screen.getByText(
    (_, el) => el?.tagName === "P" && el.textContent === text,
  );
}

beforeEach(stubFetch);
afterEach(() => vi.unstubAllGlobals());

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

  it("says existing playlists are topped up, never doubled", async () => {
    await loaded(
      library({
        categories: { c1: category("Dusk", "pl-1"), c2: category("Rain") },
      }),
    );
    expect(
      sentence(
        "3 tracks into 1 new private playlist and 1 you already have. Nothing is added twice.",
      ),
    ).toBeInTheDocument();
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
      screen.getByRole("list", { name: "Playlists" }),
    ).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["01Dusk2", "02Rain2"]);
  });

  it("offers a way back to tuning when every track is sorted", async () => {
    await loaded();
    expect(
      screen.getByRole("link", { name: "Tune the fit" }),
    ).toHaveAttribute("href", "/classify");
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
    expect(screen.queryByRole("list", { name: "Playlists" })).toBeNull();
    // /review with no categories starts a paid propose run on load.
    expect(screen.queryByRole("link", { name: /categor/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
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

  it("says Starting… with no fraction before the first playlist", async () => {
    await loaded();
    await userEvent.click(apply());
    expect(screen.getByRole("status")).toHaveTextContent(/^Starting…$/);
    expect(row("Dusk")).toHaveAttribute("data-state", "pending");
  });

  it("names the playlist being written and inks the ones already written", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2, name: "x" });
    expect(screen.getByRole("status")).toHaveTextContent("2 of 2 · Rain");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(row("Dusk")).toHaveAttribute("data-state", "written");
    expect(row("Rain")).toHaveAttribute("data-state", "current");
    expect(row("Rain")).toHaveAttribute("aria-current", "step");
  });

  it("moves focus to the new heading when the write starts", async () => {
    await loaded();
    await userEvent.click(apply());
    expect(
      screen.getByRole("heading", { name: "Placing tracks…" }),
    ).toHaveFocus();
  });
});

describe("/apply when the write stops", () => {
  it("says how far it got, and Try again writes again", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("progress", { stage: "category", done: 1, total: 2 });
    await push("error", { message: "Spotify returned 429." });
    expect(
      screen.getByRole("heading", { name: "Stopped at 1 of 2." }),
    ).toHaveFocus();
    expect(screen.getByText("Spotify returned 429.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "What's written stays. Trying again picks up from there.",
      ),
    ).toBeInTheDocument();
    expect(row("Dusk")).toHaveAttribute("data-state", "written");
    expect(row("Rain")).toHaveAttribute("data-state", "failed");
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
  it("calls a dropped stream a lost connection, and Reconnect joins the write", async () => {
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
    expect(screen.queryByText(/rate-limited/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(posts()).toBe(2);
  });
});

describe("/apply when the write is done", () => {
  it("prints the credits and ends with Open Spotify and Home", async () => {
    await loaded();
    await userEvent.click(apply());
    await push("done", {
      created: 2,
      updated: 0,
      tracks_added: 2,
      playlists: [
        { id: "pl-1", name: "✨ Dusk", track_count: 2, created: true },
        { id: "pl-2", name: "✨ Rain", track_count: 2, created: true },
      ],
    });
    expect(
      screen.getByRole("heading", { name: "2 new playlists" }),
    ).toHaveFocus();
    expect(screen.getByText("2 tracks placed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dusk" })).toHaveAttribute(
      "href",
      "spotify:playlist:pl-1",
    );
    expect(screen.getByRole("link", { name: "Open Spotify" })).toHaveAttribute(
      "href",
      "spotify:",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("list", { name: "Playlists" })).toBeNull();
    await waitFor(() => expect(posts()).toBe(1));
  });
});
