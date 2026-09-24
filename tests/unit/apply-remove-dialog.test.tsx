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

// jsdom has no canvas: the sleeve's JPEG is faked, the upload is not.
vi.mock("@/src/components/graphics/sleeve-to-jpeg", () => ({
  sleeveToJpeg: async () => "QUJD",
}));

import ApplyPage from "@/app/apply/page";
import { APPLY_ARM_MS } from "@/src/components/apply/useArmed";
import {
  NavLockProvider,
  useNavLockState,
} from "@/src/components/design/NavLock";

// Spec §8.2: /apply's "Remove SpotifySorter playlists…". Every Spotify call
// here is a stubbed fetch; nothing has run against real Spotify.

const AT = "2026-09-01T00:00:00.000Z";
const MANAGED = "/api/spotify/managed-playlists";
const REMOVE = "/api/spotify/remove-playlists";

function category(name: string, playlistId: string | null) {
  return {
    name,
    description: "",
    spotify_playlist_id: playlistId,
    created_at: AT,
    example_track_ids: [],
  };
}

const assigned = (category_id: string) => ({
  matches: [{ category_id, score: 90 }],
  classified_at: AT,
  override: null,
});

// Dusk holds t1, Rain holds t2 and t3. `onSpotify`: both already applied.
function library(onSpotify: boolean, over: Record<string, unknown> = {}) {
  return {
    config: { prefix: "✨", confidence_threshold: 65, anthropic_model: "m" },
    categories: {
      c1: category("Dusk", onSpotify ? "pl-1" : null),
      c2: category("Rain", onSpotify ? "pl-2" : null),
    },
    tracks: {
      t1: { artist_id: "a", title: "One", first_seen: AT },
      t2: { artist_id: "a", title: "Two", first_seen: AT },
      t3: { artist_id: "a", title: "Three", first_seen: AT },
    },
    assignments: { t1: assigned("c1"), t2: assigned("c2"), t3: assigned("c2") },
    ...over,
  };
}

const RECORDED = [
  { id: "pl-1", name: "✨ Dusk", tracks: 1, source: "recorded" },
  { id: "pl-2", name: "✨ Rain", tracks: 2, source: "recorded" },
];
const PREFIX_ONLY = [
  { id: "old-1", name: "✨ Old faves", tracks: 40, source: "prefix" },
];
const ALL_IDS = ["pl-1", "pl-2", "old-1"];

type Answer = (res: Response) => void;

let caches: unknown[] = [];
let managedAnswers: Answer[] = [];
let removeAnswers: Answer[] = [];
let coverAnswers: Answer[] = [];
let streams: Array<{ send: (event: string, data: unknown) => void }> = [];
let fetchMock: ReturnType<typeof vi.fn>;

// /api/cache answers at once with the next queued library (the last one
// repeats). Spotify-facing routes wait for the test to answer them.
function stubFetch() {
  caches = [library(true)];
  managedAnswers = [];
  removeAnswers = [];
  coverAnswers = [];
  streams = [];
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/cache") {
      const body = caches.length > 1 ? caches.shift() : caches[0];
      return Promise.resolve(Response.json(body));
    }
    if (url === MANAGED && method === "GET") {
      return new Promise<Response>((resolve) => managedAnswers.push(resolve));
    }
    if (url === REMOVE && method === "POST") {
      return new Promise<Response>((resolve) => removeAnswers.push(resolve));
    }
    if (url === "/api/spotify/cover" && method === "POST") {
      return new Promise<Response>((resolve) => coverAnswers.push(resolve));
    }
    if (url === "/api/spotify/apply" && method === "POST") {
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
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch ${method} ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
}

const settle = () => new Promise((r) => setTimeout(r, 0));

async function answer(queue: Answer[], body: unknown, status = 200) {
  await act(async () => {
    queue.shift()!(Response.json(body, { status }));
    await settle();
  });
}

function calls(url: string, method = "GET") {
  return fetchMock.mock.calls.filter(
    ([u, init]) =>
      String(u) === url &&
      ((init as RequestInit | undefined)?.method ?? "GET") === method,
  );
}

function LockProbe() {
  const { locked } = useNavLockState();
  return <p data-testid="nav">{locked ? "locked" : "open"}</p>;
}

async function loaded() {
  render(
    <NavLockProvider>
      <ApplyPage />
      <LockProbe />
    </NavLockProvider>,
  );
  // The action shows once the library has landed; Apply arms after that.
  await screen.findByRole("button", {
    name: "Remove SpotifySorter playlists…",
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(APPLY_ARM_MS);
  });
}

// The whole sentence, across the number spans inside it.
function sentence(text: string) {
  return screen.getByText(
    (_, el) => el?.tagName === "P" && el.textContent === text,
  );
}

const opener = () =>
  screen.getByRole("button", { name: "Remove SpotifySorter playlists…" });
const dialog = () =>
  screen.getByRole("dialog", { name: "Remove SpotifySorter playlists" });
const inDialog = () => within(dialog());
const nav = () => screen.getByTestId("nav").textContent;

async function listed(playlists: unknown[] = [...RECORDED, ...PREFIX_ONLY]) {
  await loaded();
  await userEvent.click(opener());
  await answer(managedAnswers, { playlists });
}

async function removing() {
  await listed();
  await userEvent.click(
    inDialog().getByRole("button", { name: "Remove 3 playlists" }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout"],
    shouldAdvanceTime: true,
  });
  stubFetch();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/apply: the way to remove SpotifySorter playlists", () => {
  it("is a quiet danger action that calls nothing until it's clicked", async () => {
    await loaded();
    expect(opener()).toHaveAttribute("data-variant", "danger");
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([
      "/api/cache",
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is there with no categories too: it also catches playlists left behind", async () => {
    caches = [library(false, { categories: {} })];
    await loaded();
    expect(
      screen.getByRole("heading", { name: "Nothing to apply yet." }),
    ).toBeInTheDocument();
    expect(opener()).toBeInTheDocument();
  });

  it("isn't offered while Apply writes", async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      screen.queryByRole("button", { name: "Remove SpotifySorter playlists…" }),
    ).toBeNull();
  });
});

describe("/apply: the remove price tag", () => {
  it("reads the list once on open, with focus on Not yet and the nav held", async () => {
    await loaded();
    await userEvent.click(opener());
    expect(
      inDialog().getByText("Reading your Spotify playlists…"),
    ).toBeInTheDocument();
    expect(inDialog().getByRole("button", { name: "Not yet" })).toHaveFocus();
    expect(
      inDialog().getByRole("button", { name: "Remove playlists" }),
    ).toBeDisabled();
    expect(calls(MANAGED)).toHaveLength(1);
    expect(nav()).toBe("locked");
  });

  // The ones only named like SpotifySorter's are the ones the owner may not
  // expect to lose: they print first, above the long list, never scrolled away.
  it("lists every playlist by name, the prefix-only ones above the ones made here", async () => {
    await listed();
    const [also, made] = inDialog().getAllByRole("list");
    expect(also).toHaveAccessibleName("Named ✨ …");
    expect(
      within(also!)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Old faves"]);
    expect(made).toHaveAccessibleName("Made by SpotifySorter");
    expect(
      within(made!)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Dusk", "Rain"]);
    expect(inDialog().getByRole("button", { name: "Not yet" })).toHaveFocus();
    expect(nav()).toBe("open");
  });

  // Alone, "Made by SpotifySorter" would only repeat the dialog's title.
  it("prints one plain list when every playlist was made here", async () => {
    await listed(RECORDED);
    const [list, ...rest] = inDialog().getAllByRole("list");
    expect(rest).toHaveLength(0);
    expect(
      within(list!)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Dusk", "Rain"]);
    expect(inDialog().queryByRole("heading", { level: 3 })).toBeNull();
    expect(inDialog().queryByText(/^Named/)).toBeNull();
  });

  it("still says why the others are listed when none were made here", async () => {
    await listed(PREFIX_ONLY);
    expect(inDialog().queryByText("Made by SpotifySorter")).toBeNull();
    expect(
      inDialog().getByRole("list", { name: "Named ✨ …" }),
    ).toBeInTheDocument();
  });

  it("counts every playlist in its danger confirm", async () => {
    await listed();
    const confirm = inDialog().getByRole("button", {
      name: "Remove 3 playlists",
    });
    expect(confirm).toHaveAttribute("data-variant", "danger-confirm");
    expect(confirm).toBeEnabled();
  });

  it("says one playlist, not playlists", async () => {
    await listed(PREFIX_ONLY);
    expect(
      inDialog().getByRole("button", { name: "Remove 1 playlist" }),
    ).toBeInTheDocument();
  });

  it("states the 90-day restore as text that can be selected", async () => {
    await listed();
    expect(dialog()).toHaveAccessibleDescription(
      "Spotify keeps removed playlists for 90 days: restore them at spotify.com/account/recover-playlists.",
    );
    const url = inDialog().getByText("spotify.com/account/recover-playlists");
    expect(url.closest("a")).toBeNull();
  });

  it("says when there are none, with nothing to remove", async () => {
    await listed([]);
    expect(
      inDialog().getByText("No SpotifySorter playlists on Spotify."),
    ).toBeInTheDocument();
    expect(inDialog().queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(inDialog().getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("offers Retry when the list can't be read", async () => {
    await loaded();
    await userEvent.click(opener());
    await answer(managedAnswers, { error: "upstream" }, 502);
    expect(
      inDialog().getByText("Couldn't read your Spotify playlists."),
    ).toBeInTheDocument();
    expect(inDialog().queryByRole("button", { name: /^Remove/ })).toBeNull();
    await userEvent.click(inDialog().getByRole("button", { name: "Retry" }));
    expect(calls(MANAGED)).toHaveLength(2);
    await answer(managedAnswers, { playlists: RECORDED });
    expect(
      inDialog().getByRole("button", { name: "Remove 2 playlists" }),
    ).toBeInTheDocument();
  });

  it("says Apply is still writing when the server refuses the read for that", async () => {
    await loaded();
    await userEvent.click(opener());
    await answer(managedAnswers, { error: "apply_running" }, 409);
    expect(
      inDialog().getByText(
        "Apply is still writing to Spotify. Try again once it's done.",
      ),
    ).toBeInTheDocument();
    expect(inDialog().queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(inDialog().getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.click(inDialog().getByRole("button", { name: "Retry" }));
    expect(calls(MANAGED)).toHaveLength(2);
  });

  it.each([
    [403, "missing_scope"],
    [401, "reconnect"],
  ])(
    "asks for a reconnect, with no Retry, when the read answers %i %s",
    async (status, error) => {
      await loaded();
      await userEvent.click(opener());
      await answer(managedAnswers, { error }, status);
      expect(
        inDialog().getByText("Spotify needs you to reconnect first."),
      ).toBeInTheDocument();
      expect(
        inDialog().getByRole("link", { name: "Reconnect Spotify" }),
      ).toHaveAttribute("href", "/api/auth/login");
      expect(inDialog().queryByRole("button", { name: "Retry" })).toBeNull();
    },
  );

  it("closes on Not yet without removing anything", async () => {
    await listed();
    await userEvent.click(inDialog().getByRole("button", { name: "Not yet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls(REMOVE, "POST")).toHaveLength(0);
    expect(opener()).toHaveFocus();
  });

  it("ignores a list that arrives after it was closed", async () => {
    await loaded();
    await userEvent.click(opener());
    await userEvent.click(inDialog().getByRole("button", { name: "Not yet" }));
    await answer(managedAnswers, { playlists: RECORDED });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(nav()).toBe("open");
  });
});

describe("/apply: removing", () => {
  it("removes exactly what it listed, and holds on until Spotify answers", async () => {
    await removing();
    expect(calls(REMOVE, "POST")).toHaveLength(1);
    const [, init] = calls(REMOVE, "POST")[0]!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      ids: ALL_IDS,
    });
    expect(nav()).toBe("locked");
    const confirm = inDialog().getByRole("button", { name: "Removing…" });
    expect(confirm).toHaveAttribute("aria-busy", "true");
    // Mid-request nothing dismisses it: not Escape, the backdrop or Not yet.
    await userEvent.keyboard("{Escape}");
    fireEvent.click(screen.getByTestId("dialog-backdrop"));
    const notYet = inDialog().getByRole("button", { name: "Not yet" });
    expect(notYet).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(notYet);
    expect(dialog()).toBeInTheDocument();
    // A second press can't send it twice.
    await userEvent.click(confirm);
    expect(calls(REMOVE, "POST")).toHaveLength(1);
  });

  it("says how many went, then the page shows nothing on Spotify", async () => {
    caches = [library(true), library(false)];
    await loaded();
    expect(
      sentence("3 tracks into 2 playlists you already have."),
    ).toBeInTheDocument();
    await userEvent.click(opener());
    await answer(managedAnswers, { playlists: [...RECORDED, ...PREFIX_ONLY] });
    await userEvent.click(
      inDialog().getByRole("button", { name: "Remove 3 playlists" }),
    );
    await answer(removeAnswers, { removed: ALL_IDS, failed: [] });
    expect(inDialog().getByText("3 playlists removed.")).toBeInTheDocument();
    expect(inDialog().queryByRole("list")).toBeNull();
    expect(inDialog().getByRole("button", { name: "Close" })).toHaveFocus();
    expect(nav()).toBe("open");
    // The page read the library again: nothing is on Spotify now.
    expect(calls("/api/cache")).toHaveLength(2);
    await userEvent.click(inDialog().getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      sentence("3 tracks into 2 new private playlists."),
    ).toBeInTheDocument();
    expect(opener()).toHaveFocus();
  });

  it.each([
    [403, "missing_scope"],
    [401, "reconnect"],
  ])(
    "asks for a reconnect, with no Retry, when the removal answers %i %s",
    async (status, error) => {
      await removing();
      await answer(removeAnswers, { error }, status);
      expect(
        inDialog().getByText("Spotify needs you to reconnect first."),
      ).toBeInTheDocument();
      expect(
        inDialog().getByRole("link", { name: "Reconnect Spotify" }),
      ).toHaveAttribute("href", "/api/auth/login");
      expect(inDialog().queryByRole("button", { name: "Retry" })).toBeNull();
      expect(calls("/api/cache")).toHaveLength(1);
      expect(nav()).toBe("open");
    },
  );

  // Some may be gone already, so Retry reads the list again before anything
  // else is removed.
  it("offers Retry after a failed removal, which reads the list again", async () => {
    await removing();
    await answer(removeAnswers, { error: "remove_failed" }, 502);
    expect(inDialog().getByText("Couldn't remove them.")).toBeInTheDocument();
    expect(inDialog().getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.click(inDialog().getByRole("button", { name: "Retry" }));
    expect(calls(MANAGED)).toHaveLength(2);
    expect(calls(REMOVE, "POST")).toHaveLength(1);
    await answer(managedAnswers, { playlists: PREFIX_ONLY });
    expect(
      inDialog().getByRole("button", { name: "Remove 1 playlist" }),
    ).toBeInTheDocument();
  });

  it("names what failed when only some went", async () => {
    await removing();
    await answer(removeAnswers, {
      removed: ["pl-1", "old-1"],
      failed: [{ id: "pl-2", reason: "http_500" }],
    });
    expect(inDialog().getByText("2 playlists removed.")).toBeInTheDocument();
    expect(inDialog().getByText("Couldn't remove Rain.")).toBeInTheDocument();
    expect(inDialog().getByRole("button", { name: "Retry" })).toBeEnabled();
    // Some went: the page reads the library again.
    expect(calls("/api/cache")).toHaveLength(2);
  });

  it("counts, rather than names, a long list of failures", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `o-${i}`,
      name: `✨ Orphan ${i}`,
      tracks: 1,
      source: "prefix",
    }));
    await listed(many);
    await userEvent.click(
      inDialog().getByRole("button", { name: "Remove 5 playlists" }),
    );
    await answer(removeAnswers, {
      removed: [],
      failed: many.map(({ id }) => ({ id, reason: "spotify_500" })),
    });
    expect(
      inDialog().getByText("Couldn't remove 5 playlists."),
    ).toBeInTheDocument();
    expect(inDialog().queryByText(/Orphan/)).toBeNull();
    expect(inDialog().getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  // Apply's end-of-run write would restore the ids a removal clears.
  it("says Apply is still writing when the server refuses the removal for that", async () => {
    await removing();
    await answer(removeAnswers, { error: "apply_running" }, 409);
    expect(
      inDialog().getByText(
        "Apply is still writing to Spotify. Try again once it's done.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(inDialog().getByRole("button", { name: "Retry" }));
    expect(calls(MANAGED)).toHaveLength(2);
    expect(calls(REMOVE, "POST")).toHaveLength(1);
  });

  it("says only what failed when none went", async () => {
    await removing();
    await answer(removeAnswers, {
      removed: [],
      failed: [
        { id: "pl-1", reason: "x" },
        { id: "pl-2", reason: "x" },
        { id: "old-1", reason: "x" },
      ],
    });
    expect(
      inDialog().getByText("Couldn't remove Dusk, Rain, and Old faves."),
    ).toBeInTheDocument();
    expect(inDialog().queryByText(/removed\./)).toBeNull();
    expect(calls("/api/cache")).toHaveLength(1);
  });
});

describe("/apply: removing after an Apply", () => {
  const DONE = {
    created: 0,
    updated: 2,
    tracks_added: 3,
    playlists: [
      {
        id: "pl-1",
        category_id: "c1",
        name: "✨ Dusk",
        track_count: 1,
        created: false,
      },
      {
        id: "pl-2",
        category_id: "c2",
        name: "✨ Rain",
        track_count: 2,
        created: false,
      },
    ],
  };

  it("waits for the covers, then takes the credits back to the manifest", async () => {
    caches = [library(true), library(false)];
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await act(async () => {
      streams.at(-1)!.send("done", DONE);
      await settle();
    });
    // Covers upload after the write and write the cache too: not now.
    expect(
      screen.queryByRole("button", { name: "Remove SpotifySorter playlists…" }),
    ).toBeNull();
    await answer(coverAnswers, { ok: true });
    await answer(coverAnswers, { ok: true });
    await userEvent.click(opener());
    await answer(managedAnswers, { playlists: RECORDED });
    await userEvent.click(
      inDialog().getByRole("button", { name: "Remove 2 playlists" }),
    );
    await answer(removeAnswers, { removed: ["pl-1", "pl-2"], failed: [] });
    expect(inDialog().getByText("2 playlists removed.")).toBeInTheDocument();
    await userEvent.click(inDialog().getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByRole("heading", { name: "What Apply writes" }),
    ).toBeInTheDocument();
    expect(
      sentence("3 tracks into 2 new private playlists."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(opener()).toHaveFocus();
  });
});
