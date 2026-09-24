import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/review",
}));

import ReviewPage from "@/app/review/page";
import { estimateClassifyCost } from "@/src/lib/llm/cost";
import { estimateRescoreCost } from "@/src/lib/categories/rescore-cost";
import {
  NavLockProvider,
  useNavLockState,
} from "@/src/components/design/NavLock";

// jsdom has no EventSource. Every stream the page opens is recorded, so a
// test can count them and speak for the server on each.
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
  emit(type: string, data?: unknown) {
    const e =
      data === undefined
        ? new Event(type)
        : new MessageEvent(type, { data: JSON.stringify(data) });
    act(() => this.listeners.get(type)?.forEach((fn) => fn(e)));
  }
}
const stream = () => FakeEventSource.all.at(-1)!;
const openStreams = () => FakeEventSource.all.filter((s) => s.readyState !== 2);

// ---- a small library ------------------------------------------------------
const AT = "2026-09-01T00:00:00.000Z";
// Library-sized, so a price can't round to $0.00.
const TRACK_IDS = Array.from({ length: 3000 }, (_, i) => `t${i + 1}`);
const TRACKS = Object.fromEntries(
  TRACK_IDS.map((id, i) => [
    id,
    { title: `Song ${i + 1}`, artist_id: i % 2 ? "a2" : "a1" },
  ]),
);
const ARTISTS = {
  a1: { name: "Mac Miller", genres: [] },
  a2: { name: "Frank Ocean", genres: [] },
};
const category = (name: string, description: string, examples: string[]) => ({
  name,
  description,
  spotify_playlist_id: null,
  created_at: AT,
  example_track_ids: examples,
});
const CATEGORIES = {
  c1: category("Emo Rap", "Heartbreak over 808s.", ["t1"]),
  c2: category("Dream Pop", "Reverb and haze.", ["t2", "t3"]),
  c3: category("Trance", "Euphoric builds.", ["t4"]),
};
const placed = (ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      {
        matches: [{ category_id: "c1", score: 80 }],
        classified_at: AT,
        override: null,
      },
    ]),
  );
const cacheBody = ({
  categories = CATEGORIES as Record<string, unknown>,
  assignments = placed(TRACK_IDS) as Record<string, unknown>,
} = {}) => ({
  config: { prefix: "✨", confidence_threshold: 65, anthropic_model: "m" },
  tracks: TRACKS,
  artists: ARTISTS,
  categories,
  assignments,
  runs: [],
});

// ---- a fake server ----------------------------------------------------------
type Reply =
  | { status?: number; body?: unknown }
  | "pending"
  | (() => Promise<Response>);
const server = {
  /** GET /api/cache answers, in order; the last one repeats. */
  cache: [] as Reply[],
  patch: {} as Reply,
  reclassify: {} as Reply,
  /** GET /api/status; 404 by default (the study is then treated as open). */
  status: { status: 404 } as Reply,
  calls: [] as { method: string; url: string; body?: unknown }[],
};
function stubServer() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    server.calls.push({
      method,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply =
      url === "/api/cache" && method === "GET"
        ? server.cache.length > 1
          ? server.cache.shift()!
          : server.cache[0]!
        : url === "/api/cache"
          ? server.patch
          : url === "/api/llm/reclassify"
            ? server.reclassify
            : url === "/api/status"
              ? server.status
              : { status: 404 };
    if (reply === "pending") return new Promise<Response>(() => {});
    if (typeof reply === "function") return reply();
    return new Response(JSON.stringify(reply.body ?? { ok: true }), {
      status: reply.status ?? 200,
    });
  });
}
const writes = () => server.calls.filter((c) => c.method !== "GET");

function LockProbe() {
  const { locked } = useNavLockState();
  return <output aria-label="nav lock">{locked ? "locked" : "open"}</output>;
}
const lock = () => screen.getByRole("status", { name: "nav lock" });

async function renderReview() {
  render(
    <NavLockProvider>
      <LockProbe />
      <ReviewPage />
    </NavLockProvider>,
  );
  await act(async () => {});
}

const price = ({ low, high }: { low: number; high: number }) =>
  new RegExp(`\\$${low.toFixed(2)}.*\\$${high.toFixed(2)}$`);
const heading = () => screen.getByRole("heading", { level: 1 });
const classifyButton = () =>
  screen.getByRole("button", { name: /^(Classify|Saving…|Re-scoring…)$/ });
const ROW_NAMES = ["Emo Rap", "Dream Pop", "Trance", "Late Night"];
const rowNames = () =>
  screen
    .getAllByRole("button", { name: /^(Emo Rap|Dream Pop|Trance|Late Night)$/ })
    .map((b) => ROW_NAMES.find((n) => within(b).queryByText(n)));

async function openRow(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  FakeEventSource.all = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  server.cache = [{ body: cacheBody() }];
  server.patch = {};
  server.reclassify = {};
  server.status = { status: 404 };
  server.calls = [];
  stubServer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("/review before the categories are known", () => {
  // Loading used to render "Claude is proposing" even with categories saved.
  it("claims nothing while the saved categories load, and opens no stream", async () => {
    server.cache = ["pending"];
    await renderReview();
    expect(screen.queryByText(/Proposing|Claude/)).toBeNull();
    expect(FakeEventSource.all).toHaveLength(0);
  });

  it("offers Try again and Home when the saved categories don't load", async () => {
    server.cache = [{ status: 500 }, { body: cacheBody() }];
    await renderReview();
    expect(heading()).toHaveTextContent("Your categories didn't load.");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(FakeEventSource.all).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(heading()).toHaveTextContent("3 categories. Edit anything."),
    );
  });

  it("doesn't offer a retry that can't help when the saved library is from another version", async () => {
    server.cache = [{ status: 409, body: { error: "cache_version_mismatch" } }];
    await renderReview();
    expect(screen.getByText(/another version of the app/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    // Nor a dead Classify, as if it would come back.
    expect(screen.queryByRole("button", { name: "Classify" })).toBeNull();
  });
});

describe("/review while Claude proposes", () => {
  beforeEach(() => {
    server.cache = [{ body: cacheBody({ categories: {}, assignments: {} }) }];
  });

  it("proposes once, with a way home, and holds the nav", async () => {
    await renderReview();
    expect(FakeEventSource.all.map((s) => s.url)).toEqual(["/api/llm/propose"]);
    expect(heading()).toHaveTextContent("Proposing categories…");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    // Leaving only unsubscribes: the server-side run carries on and saves.
    expect(screen.getByText(/Leaving this page won't stop it/)).toBeVisible();
    expect(lock()).toHaveTextContent("locked");
  });

  it("shows the proposal when Claude finishes, and lets go of the nav", async () => {
    await renderReview();
    stream().emit("done", {
      categories: [
        {
          id: "n1",
          name: "Emo Rap",
          description: "Sad.",
          example_track_ids: [],
        },
        { id: "n2", name: "Trance", description: "Up.", example_track_ids: [] },
      ],
    });
    expect(heading()).toHaveTextContent("2 categories. Edit anything.");
    expect(openStreams()).toHaveLength(0);
    expect(lock()).toHaveTextContent("open");
    // Propose already saved these: nothing is pending.
    expect(screen.queryByText(/Unsaved/)).toBeNull();
  });

  it("offers Try again and Home when proposing fails, and retries once", async () => {
    await renderReview();
    stream().emit("error", { message: "Anthropic returned 529." });
    expect(heading()).toHaveTextContent("Claude couldn't propose categories.");
    expect(screen.getByText("Anthropic returned 529.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(lock()).toHaveTextContent("open");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(FakeEventSource.all).toHaveLength(2));
    expect(openStreams()).toHaveLength(1);
  });
});

describe("/review with saved categories", () => {
  it("lists every category with one Classify, and starts nothing", async () => {
    await renderReview();
    expect(heading()).toHaveTextContent("3 categories. Edit anything.");
    expect(rowNames()).toEqual(["Emo Rap", "Dream Pop", "Trance"]);
    expect(screen.getAllByRole("button", { name: "Classify" })).toHaveLength(1);
    expect(FakeEventSource.all).toHaveLength(0);
    expect(writes()).toEqual([]);
  });

  it("opens a row to edit its name and description in place", async () => {
    await renderReview();
    await openRow("Dream Pop");
    const name = screen.getByRole("textbox", { name: "Category name" });
    expect(name).toHaveValue("Dream Pop");
    expect(name).toHaveFocus();
    const description = screen.getByRole("textbox", { name: "Description" });
    expect(description).toHaveValue("Reverb and haze.");
    await userEvent.clear(description);
    await userEvent.type(description, "Hazy guitars.");
    expect(screen.getByRole("link", { name: "Song 2" })).toHaveAttribute(
      "href",
      "spotify:track:t2",
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
    expect(screen.getByRole("button", { name: "Dream Pop" })).toHaveFocus();
    expect(screen.getByText("Unsaved: 1 edited")).toBeInTheDocument();
  });

  it("closes the row on Escape", async () => {
    await renderReview();
    await openRow("Trance");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Category name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Trance" })).toHaveFocus();
  });

  it("puts an emptied name back when you leave the field", async () => {
    await renderReview();
    await openRow("Dream Pop");
    const name = screen.getByRole("textbox", { name: "Category name" });
    await userEvent.clear(name);
    await userEvent.tab();
    expect(name).toHaveValue("Dream Pop");
    expect(classifyButton()).toBeEnabled();
  });

  it("blocks Classify while two categories share a name, and says why", async () => {
    await renderReview();
    await openRow("Trance");
    const name = screen.getByRole("textbox", { name: "Category name" });
    await userEvent.clear(name);
    await userEvent.type(name, "dream pop");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Another category is called this.",
    );
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(classifyButton()).toBeDisabled();
    // The status line fades in when it changes.
    await waitFor(() =>
      expect(
        screen.getByText(/2 categories are called “dream pop”/i),
      ).toBeVisible(),
    );
  });

  it("keeps both clashing rows marked once the row is closed", async () => {
    await renderReview();
    await openRow("Trance");
    const name = screen.getByRole("textbox", { name: "Category name" });
    await userEvent.clear(name);
    await userEvent.type(name, "dream pop");
    await userEvent.keyboard("{Escape}");
    const clashing = screen.getAllByRole("button", { name: /^dream pop$/i });
    expect(clashing).toHaveLength(2);
    for (const row of clashing)
      expect(within(row).getByText(/^dream pop$/i)).toHaveClass("text-danger");
    expect(
      within(screen.getByRole("button", { name: "Emo Rap" })).getByText(
        "Emo Rap",
      ),
    ).not.toHaveClass("text-danger");
  });

  it("deletes a category with one undo that puts it back in its place", async () => {
    await renderReview();
    await openRow("Dream Pop");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(heading()).toHaveTextContent("2 categories. Edit anything.");
    expect(rowNames()).toEqual(["Emo Rap", "Trance"]);
    expect(screen.getByText("Deleted Dream Pop.")).toBeInTheDocument();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveFocus();
    expect(screen.getByText("Unsaved: 1 deleted")).toBeInTheDocument();
    await userEvent.click(undo);
    expect(rowNames()).toEqual(["Emo Rap", "Dream Pop", "Trance"]);
    expect(screen.queryByText("Deleted Dream Pop.")).toBeNull();
    expect(screen.getByRole("button", { name: "Dream Pop" })).toHaveFocus();
  });

  it("merges into a category picked by typing, and splits them again on undo", async () => {
    await renderReview();
    await openRow("Emo Rap");
    await userEvent.click(screen.getByRole("button", { name: "Merge into…" }));
    const picker = screen.getByRole("group", { name: "Merge Emo Rap into" });
    const filter = within(picker).getByRole("searchbox");
    expect(filter).toHaveFocus();
    expect(
      within(picker).queryByRole("button", { name: "Emo Rap" }),
    ).toBeNull();
    await userEvent.type(filter, "tra{Enter}");
    expect(screen.getByText("Merged Emo Rap into Trance.")).toBeInTheDocument();
    expect(rowNames()).toEqual(["Dream Pop", "Trance"]);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(rowNames()).toEqual(["Emo Rap", "Dream Pop", "Trance"]);
  });

  // The same picker grammar as classify's Move to…: the catalogue tab is a
  // category's identity on every page, and it adds nothing to the name.
  it("prints each merge target with its catalogue tab, named by its name alone", async () => {
    await renderReview();
    await openRow("Emo Rap");
    await userEvent.click(screen.getByRole("button", { name: "Merge into…" }));
    const picker = screen.getByRole("group", { name: "Merge Emo Rap into" });
    const options = within(picker).getAllByRole("button", {
      name: /^(Dream Pop|Trance)$/,
    });
    expect(options.map((b) => b.textContent)).toEqual([
      "02Dream Pop",
      "03Trance",
    ]);
  });

  // "Add track" only ever added an example: sorting never reads examples, so
  // the song never reached the playlist.
  it("adds examples, and says so, rather than promising tracks", async () => {
    await renderReview();
    await openRow("Emo Rap");
    expect(screen.queryByRole("button", { name: "Add track" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add example" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      /Add examples to Emo Rap/,
    );
  });

  // Enter used to do nothing while more than one category matched.
  it("moves Enter to the first match when several are left, never merging blind", async () => {
    await renderReview();
    await openRow("Emo Rap");
    await userEvent.click(screen.getByRole("button", { name: "Merge into…" }));
    const picker = screen.getByRole("group", { name: "Merge Emo Rap into" });
    await userEvent.type(within(picker).getByRole("searchbox"), "a{Enter}");
    expect(
      within(picker).getByRole("button", { name: "Dream Pop" }),
    ).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Category name" })).toHaveValue(
      "Emo Rap",
    );
    expect(screen.queryByText(/^Merged/)).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByText("Merged Emo Rap into Dream Pop."),
    ).toBeInTheDocument();
  });

  it("adds a category from the last row, Enter to submit", async () => {
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a category" }),
    );
    const name = screen.getByRole("textbox", { name: "New category name" });
    expect(name).toHaveFocus();
    await userEvent.type(name, "Late Night{Enter}");
    expect(rowNames()).toEqual([
      "Emo Rap",
      "Dream Pop",
      "Trance",
      "Late Night",
    ]);
    expect(heading()).toHaveTextContent("4 categories. Edit anything.");
    expect(screen.getByText("Unsaved: 1 new")).toBeInTheDocument();
  });

  it("won't add a category under a name that's taken", async () => {
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a category" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "New category name" }),
      "trance",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Another category is called this.",
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("says what Classify needs when every category is gone", async () => {
    await renderReview();
    for (const name of ["Emo Rap", "Dream Pop", "Trance"]) {
      await openRow(name);
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    }
    expect(heading()).toHaveTextContent("0 categories. Edit anything.");
    expect(classifyButton()).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText("Add a category to classify.")).toBeVisible(),
    );
  });
});

describe("/review Classify", () => {
  async function priceIt() {
    await userEvent.click(classifyButton());
    return screen.getByRole("dialog");
  }

  it("prices first, saves only on Proceed, then opens /classify", async () => {
    await renderReview();
    const dialog = await priceIt();
    expect(dialog).toHaveAccessibleDescription(
      "Every track already has a category, so Claude isn't called.",
    );
    expect(writes()).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/classify"));
    const [patch] = writes();
    expect(patch).toMatchObject({
      method: "PATCH",
      url: "/api/cache",
      body: { _clear: ["categories"] },
    });
    expect(
      Object.keys((patch!.body as { categories: object }).categories),
    ).toEqual(["c1", "c2", "c3"]);
    expect(writes().some((c) => c.url === "/api/llm/reclassify")).toBe(false);
  });

  // A save with no edits used to unlink every playlist, and home then said
  // "None on Spotify yet" while they were all still on Spotify.
  it("keeps every category's Spotify playlist through a save with no edits", async () => {
    const linked = Object.fromEntries(
      Object.entries(CATEGORIES).map(([id, c]) => [
        id,
        { ...c, spotify_playlist_id: `pl_${id}` },
      ]),
    );
    // The links appear only in the read just before the save (Apply may have
    // linked them in another tab since this page loaded).
    server.cache = [
      { body: cacheBody() },
      { body: cacheBody({ categories: linked }) },
    ];
    await renderReview();
    await priceIt();
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/classify"));
    const [patch] = writes();
    const posted = (
      patch!.body as {
        categories: Record<string, { spotify_playlist_id: string | null }>;
      }
    ).categories;
    expect(
      Object.fromEntries(
        Object.entries(posted).map(([id, c]) => [id, c.spotify_playlist_id]),
      ),
    ).toEqual({ c1: "pl_c1", c2: "pl_c2", c3: "pl_c3" });
  });

  it("prices only the tracks without a category", async () => {
    server.cache = [
      { body: cacheBody({ assignments: placed(TRACK_IDS.slice(0, 2700)) }) },
    ];
    await renderReview();
    const dialog = await priceIt();
    expect(dialog).toHaveAccessibleDescription(
      "Claude sorts the 300 tracks without a category.",
    );
    expect(dialog).toHaveAccessibleName(price(estimateClassifyCost(300)));
  });

  // Saving a new category re-scores every placed track against it with a paid
  // call. The confirm used to say "$0.00 … Claude won't be called".
  it("names and prices the re-scoring a new category starts", async () => {
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a category" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "New category name" }),
      "Late Night{Enter}",
    );
    const dialog = await priceIt();
    expect(dialog).toHaveAccessibleDescription(
      "Claude re-scores your 3,000 placed tracks against Late Night.",
    );
    expect(dialog).toHaveAccessibleName(price(estimateRescoreCost(3000, 1)));
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/classify"));
    const rescore = writes().find((c) => c.url === "/api/llm/reclassify");
    expect(rescore?.body).toEqual({
      newCategoryIds: [expect.any(String)],
    });
  });

  // An add breaks /label exactly as a rename does; the confirm warned only
  // for the rename, which read as "adding is safe".
  it("warns that /label needs a heading for a new category", async () => {
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a category" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "New category name" }),
      "Late Night{Enter}",
    );
    const dialog = await priceIt();
    expect(within(dialog).getByText(/definitions\.md/)).toBeInTheDocument();
  });

  it("names renames and deletions, and what happens to their tracks", async () => {
    await renderReview();
    await openRow("Emo Rap");
    const name = screen.getByRole("textbox", { name: "Category name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Emo Rap Heartbreak");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await openRow("Trance");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await priceIt();
    expect(
      within(dialog).getByText("This also deletes 1 category:"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Emo Rap → Emo Rap Heartbreak"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/deleted category don't move/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/only steer tracks sorted from now on/),
    ).toBeInTheDocument();
  });

  it("stays here with the reason when the save fails", async () => {
    server.patch = { status: 500 };
    await renderReview();
    await priceIt();
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() =>
      expect(screen.getByText(/Couldn't save your categories\./)).toBeVisible(),
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(classifyButton()).toHaveTextContent("Classify");
    expect(classifyButton()).toBeEnabled();
    expect(lock()).toHaveTextContent("open");
  });

  it("holds the nav and says Saving… while it saves", async () => {
    server.patch = "pending";
    await renderReview();
    await priceIt();
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() => expect(classifyButton()).toHaveTextContent("Saving…"));
    expect(classifyButton()).toBeDisabled();
    expect(lock()).toHaveTextContent("locked");
  });

  it("says the save landed when only the re-scoring failed", async () => {
    server.reclassify = { status: 500 };
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a category" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "New category name" }),
      "Late Night{Enter}",
    );
    await priceIt();
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    // "failed" leads: the bar truncates the line at phone widths.
    await waitFor(() =>
      expect(
        screen.getByText(
          /^Re-scoring against Late Night failed; your categories are saved\./,
        ),
      ).toBeVisible(),
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(classifyButton()).toBeEnabled();
    expect(screen.queryByText(/Unsaved/)).toBeNull();
  });
});

describe("/review Re-propose", () => {
  // The wipe clears what is saved; the draft's count is not what it deletes.
  it("counts the saved categories it deletes, not the draft's", async () => {
    await renderReview();
    await openRow("Trance");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Re-propose all…" }),
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      /^Deletes all 3 categories and every track's place in them/,
    );
  });

  it("asks before wiping, in rust, starting on Not yet", async () => {
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Re-propose all…" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription(/all 3 categories/);
    expect(
      screen.getByRole("button", { name: "Wipe & re-propose" }),
    ).toHaveAttribute("data-variant", "danger-confirm");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Not yet" })).toHaveFocus(),
    );
    expect(writes()).toEqual([]);
  });

  it("wipes categories and placements, then proposes once", async () => {
    server.cache = [
      { body: cacheBody() },
      { body: cacheBody({ categories: {}, assignments: {} }) },
    ];
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Re-propose all…" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Wipe & re-propose" }),
    );
    await waitFor(() => expect(FakeEventSource.all).toHaveLength(1));
    expect(writes()).toEqual([
      {
        method: "PATCH",
        url: "/api/cache",
        body: { _clear: ["categories", "assignments"] },
      },
    ]);
    expect(heading()).toHaveTextContent("Proposing categories…");
  });
});

describe("/review sheet", () => {
  const sheet = () =>
    screen.getByRole("complementary", { name: "Open category" });
  const cover = (name: string) =>
    screen.getByRole("img", { name: `Cover for ${name}` });
  const colour = () => screen.getByRole("radiogroup", { name: "Colour" });
  async function proceed() {
    await userEvent.click(classifyButton());
    await userEvent.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/classify"));
    return (writes()[0]!.body as { categories: Record<string, object> })
      .categories;
  }

  // Desktop shows one pulled divider; several open rows was the old index.
  it("opens one category at a time, in the side sheet", async () => {
    await renderReview();
    await openRow("Emo Rap");
    await openRow("Dream Pop");
    const names = screen.getAllByRole("textbox", { name: "Category name" });
    expect(names).toHaveLength(1);
    expect(
      within(sheet()).getByRole("textbox", { name: "Category name" }),
    ).toHaveValue("Dream Pop");
    expect(screen.getByRole("button", { name: "Dream Pop" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Emo Rap" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  // Narrow screens: the divider gives way to its editor, so the name isn't
  // printed twice, and there is no side sheet.
  it("opens the editor inside the divider on narrow screens", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }));
    await renderReview();
    await openRow("Dream Pop");
    expect(
      screen.queryByRole("complementary", { name: "Open category" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Dream Pop" })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Category name" }),
    ).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Dream Pop" })).toHaveFocus();
  });

  // Desktop: the sheet's column never sits blank. Until a category is open it
  // says what goes there; opening one replaces the note with the sheet.
  it("holds the sheet's place with a note until a category opens", async () => {
    await renderReview();
    expect(screen.getByText("Open a category to edit it here.")).toBeVisible();
    await openRow("Dream Pop");
    expect(screen.queryByText("Open a category to edit it here.")).toBeNull();
    expect(
      within(sheet()).getByRole("textbox", { name: "Category name" }),
    ).toHaveValue("Dream Pop");
  });

  // PressList (home, /apply) links each playlist to /review#<id>.
  it("opens the category a /review#<id> link names", async () => {
    window.history.replaceState(null, "", "/review#c2");
    try {
      await renderReview();
      expect(
        within(sheet()).getByRole("textbox", { name: "Category name" }),
      ).toHaveValue("Dream Pop");
      expect(screen.getByRole("button", { name: "Dream Pop" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("opens nothing for a hash that names no category", async () => {
    window.history.replaceState(null, "", "/review#nope");
    try {
      await renderReview();
      expect(
        screen.queryByRole("textbox", { name: "Category name" }),
      ).toBeNull();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  // decodeURIComponent throws on a cut-off escape; that took the page down.
  it("still loads under a mangled hash", async () => {
    window.history.replaceState(null, "", "/review#%E0%A4%A");
    try {
      await renderReview();
      expect(heading()).toHaveTextContent("3 categories. Edit anything.");
      expect(
        screen.queryByRole("textbox", { name: "Category name" }),
      ).toBeNull();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("closes on Escape from inside the sheet, back to its divider", async () => {
    await renderReview();
    await openRow("Dream Pop");
    act(() =>
      within(colour()).getByRole("radio", { name: "Auto (guess)" }).focus(),
    );
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: "Open category" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Dream Pop" })).toHaveFocus();
  });

  // The rename reprints once typing pauses, not on every keystroke.
  it("reprints the sleeve 400ms after a rename, not while typing", async () => {
    await renderReview();
    await openRow("Dream Pop");
    const name = within(sheet()).getByRole("textbox", {
      name: "Category name",
    });
    await userEvent.clear(name);
    await userEvent.type(name, "Metal");
    // "metal" is a dusk cue; the old print holds until the pause.
    expect(cover("Metal")).toHaveAttribute("data-temp", "haze");
    await waitFor(() =>
      expect(cover("Metal")).toHaveAttribute("data-temp", "dusk"),
    );
  });

  it("explains the tab colours from the bin's key", async () => {
    await renderReview();
    expect(
      screen.queryByRole("region", { name: "What the tab colours mean" }),
    ).toBeNull();
    const button = screen.getByRole("button", { name: "what they mean" });
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const legend = screen.getByRole("region", {
      name: "What the tab colours mean",
    });
    expect(
      within(legend).getByText("Soft and dreamy: lo-fi, acoustic, ballads."),
    ).toBeInTheDocument();
    expect(
      within(legend).getByText(/guessed from each category’s name/i),
    ).toBeInTheDocument();
    await userEvent.click(button);
    expect(
      screen.queryByRole("region", { name: "What the tab colours mean" }),
    ).toBeNull();
  });

  it("says what the picked colour means under the picker", async () => {
    await renderReview();
    await openRow("Dream Pop");
    // Auto shows its guess's meaning ("dream" is a haze cue).
    expect(
      screen.getByText("Soft and dreamy: lo-fi, acoustic, ballads."),
    ).toBeInTheDocument();
    await userEvent.click(
      within(colour()).getByRole("radio", { name: "charge" }),
    );
    expect(
      screen.getByText("High energy: EDM, trap, hyperpop, bass."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Soft and dreamy: lo-fi, acoustic, ballads."),
    ).toBeNull();
  });

  it("reprints the sleeve when a colour is picked, and saves it", async () => {
    await renderReview();
    await openRow("Dream Pop");
    // "dream" is a haze cue.
    expect(cover("Dream Pop")).toHaveAttribute("data-temp", "haze");
    const auto = within(colour()).getByRole("radio", { name: "Auto (guess)" });
    expect(auto).toBeChecked();
    // The guess is named in words, not only by the Auto tab's tint.
    expect(auto).toHaveAccessibleDescription("auto guesses haze");
    await userEvent.click(
      within(colour()).getByRole("radio", { name: "charge" }),
    );
    expect(cover("Dream Pop")).toHaveAttribute("data-temp", "charge");
    expect(screen.getByText("Unsaved: 1 edited")).toBeInTheDocument();
    const saved = await proceed();
    expect(saved.c2).toMatchObject({ temperature: "charge" });
    expect(saved.c1).not.toHaveProperty("temperature");
  });

  it("goes back to the guess on Auto, and saves no colour", async () => {
    server.cache = [
      {
        body: cacheBody({
          categories: {
            ...CATEGORIES,
            c2: { ...CATEGORIES.c2, temperature: "glow" },
          },
        }),
      },
    ];
    await renderReview();
    await openRow("Dream Pop");
    expect(cover("Dream Pop")).toHaveAttribute("data-temp", "glow");
    expect(within(colour()).getByRole("radio", { name: "glow" })).toBeChecked();
    await userEvent.click(
      within(colour()).getByRole("radio", { name: "Auto (guess)" }),
    );
    expect(cover("Dream Pop")).toHaveAttribute("data-temp", "haze");
    expect(screen.getByText("Unsaved: 1 edited")).toBeInTheDocument();
    expect((await proceed()).c2).not.toHaveProperty("temperature");
  });

  // Loading a category used to drop its colour, so any save cleared it.
  it("keeps a saved colour through a save that didn't touch it", async () => {
    server.cache = [
      {
        body: cacheBody({
          categories: {
            ...CATEGORIES,
            c1: { ...CATEGORIES.c1, temperature: "glow" },
          },
        }),
      },
    ];
    await renderReview();
    expect(screen.queryByText(/Unsaved/)).toBeNull();
    expect((await proceed()).c1).toMatchObject({ temperature: "glow" });
  });

  it("names the top artists only once the labelling study is closed", async () => {
    server.status = { body: { label_study_open: false } };
    await renderReview();
    await openRow("Emo Rap");
    await waitFor(() =>
      expect(within(sheet()).getByText("Mostly")).toBeInTheDocument(),
    );
    expect(within(sheet()).getByText("Frank Ocean · Mac Miller")).toBeVisible();
  });

  it.each([
    ["open", { body: { label_study_open: true } }],
    ["unknown", { status: 404 }],
  ] as const)(
    "hides the top artists while the study is %s",
    async (_, reply) => {
      server.status = reply;
      await renderReview();
      await openRow("Emo Rap");
      await waitFor(() =>
        expect(server.calls.some((c) => c.url === "/api/status")).toBe(true),
      );
      expect(within(sheet()).queryByText("Mostly")).toBeNull();
      expect(
        within(sheet()).queryByText("Frank Ocean · Mac Miller"),
      ).toBeNull();
    },
  );

  it("charts the category at each fit, marking yours", async () => {
    await renderReview();
    await openRow("Emo Rap");
    expect(
      within(sheet()).getByRole("img", {
        name: /^Tracks at each fit: 3,000 at 40,/,
      }),
    ).toHaveAccessibleName(/Yours is 65\.$/);
  });
});

describe("/review counts", () => {
  const row = (name: string) => screen.getByRole("button", { name });

  it("prints each category's count at the fit", async () => {
    await renderReview();
    expect(row("Emo Rap")).toHaveAccessibleDescription(/3,000 tracks/);
    expect(row("Trance")).toHaveAccessibleDescription(/0 tracks/);
  });

  // Just proposed: no category has a track yet, so no column of zeros.
  it("prints no counts or chart while nothing is placed", async () => {
    server.cache = [{ body: cacheBody({ assignments: {} }) }];
    await renderReview();
    expect(row("Emo Rap")).not.toHaveAccessibleDescription(/tracks/);
    await openRow("Emo Rap");
    expect(
      screen.queryByRole("img", { name: /Tracks at each fit/ }),
    ).toBeNull();
  });

  it("says new for a category Classify hasn't sorted into", async () => {
    await renderReview();
    await userEvent.click(
      screen.getByRole("button", { name: "Add a category" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "New category name" }),
      "Late Night{Enter}",
    );
    expect(row("Late Night")).toHaveAccessibleDescription(/new/);
    await openRow("Late Night");
    expect(
      screen.queryByRole("img", { name: /Tracks at each fit/ }),
    ).toBeNull();
  });

  // The saved count no longer holds once another category merged in.
  it("marks a merge target's count stale until Classify, and undo clears it", async () => {
    await renderReview();
    expect(within(row("Emo Rap")).getByText("3,000")).not.toHaveClass(
      "text-ink-3",
    );
    await openRow("Trance");
    await userEvent.click(screen.getByRole("button", { name: "Merge into…" }));
    await userEvent.type(
      within(
        screen.getByRole("group", { name: "Merge Trance into" }),
      ).getByRole("searchbox"),
      "emo{Enter}",
    );
    expect(within(row("Emo Rap")).getByText("3,000")).toHaveClass("text-ink-3");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(row("Emo Rap")).getByText("3,000")).not.toHaveClass(
      "text-ink-3",
    );
  });

  // Its sheet mustn't chart the old numbers as if they still held.
  it("charts a merge target's numbers as before the merge", async () => {
    await renderReview();
    await openRow("Trance");
    await userEvent.click(screen.getByRole("button", { name: "Merge into…" }));
    await userEvent.type(
      within(
        screen.getByRole("group", { name: "Merge Trance into" }),
      ).getByRole("searchbox"),
      "emo{Enter}",
    );
    await openRow("Emo Rap");
    expect(
      screen.getByRole("img", { name: /^Tracks at each fit/ }),
    ).toHaveAccessibleName(
      /^Tracks at each fit, before the merge: 3,000 at 40,/,
    );
  });

  it("teaches drag-to-merge on the status line while nothing is pending", async () => {
    await renderReview();
    expect(
      screen.getByText("Drag a divider onto another to merge them."),
    ).toBeInTheDocument();
    await openRow("Trance");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.queryByText("Drag a divider onto another to merge them."),
    ).toBeNull();
  });

  // Drag-to-merge is mouse-only; a touch screen merges through Merge into….
  it("doesn't teach dragging without a mouse", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: media.includes("min-width"),
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }));
    await renderReview();
    expect(heading()).toHaveTextContent("3 categories. Edit anything.");
    expect(
      screen.queryByText("Drag a divider onto another to merge them."),
    ).toBeNull();
  });
});
