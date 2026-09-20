import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelApp } from "@/src/components/label/LabelApp";
import { categoryOrder, formatLocal } from "@/src/components/label/logic";
import { seededRandom, shuffled } from "@/src/lib/labeling/rng";
import {
  LabelInputSchema,
  type LabelInput,
  type LabelState,
} from "@/src/lib/labeling/schema";

const SHA = "sha-defs-1";
const HOUR = 60 * 60 * 1000;

// Cache order is deliberately not id order, so "sorted by id" is observable.
const CATEGORIES = [
  { id: "c5", name: "Dream Pop", definition: "Hazy, reverb-soaked pop." },
  { id: "c2", name: "Shoegaze", definition: "Walls of guitar noise." },
  { id: "c8", name: "Deep House", definition: "Warm four-on-the-floor." },
  { id: "c1", name: "Midwest Emo", definition: "Twinkly guitars, yelled." },
  { id: "c7", name: "Pop Punk", definition: "Fast, bright, snotty." },
  { id: "c3", name: "Synthwave", definition: "Retro analog synths." },
  { id: "c6", name: "Vaporwave", definition: "Slowed mall muzak." },
  { id: "c4", name: "Trance", definition: "Long builds, big leads." },
];

function track(id: string, title: string) {
  return {
    track_id: id,
    title,
    artist_name: `Artist ${id}`,
    genres: ["indie"],
  };
}

function state(over: Partial<LabelState> = {}): LabelState {
  return {
    definitions_sha256: SHA,
    categories: CATEGORIES,
    random: [
      { ...track("t1", "First Song"), done: false },
      { ...track("t2", "Second Song"), done: false },
      { ...track("t3", "Third Song"), done: true },
    ],
    gold: [],
    pairs: [
      {
        ...track("t9", "Pair Song"),
        pair_id: "p001",
        category_id: "c2",
        done: false,
      },
    ],
    relabel: [
      {
        ...track("t3", "Third Song"),
        done: false,
        opens_at: new Date(Date.now() + 5 * HOUR).toISOString(),
      },
    ],
    ...over,
  };
}

type Reply = { status: number; body: unknown };

// GET returns the state; each POST takes the next queued reply (default ok).
function stubServer(s: LabelState, postReplies: Reply[] = []) {
  const posts: LabelInput[] = [];
  const urls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    urls.push(String(url));
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)) as LabelInput);
      const r = postReplies.shift() ?? { status: 200, body: { ok: true } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    return new Response(JSON.stringify(s), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { posts, urls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function heading(name: string) {
  return screen.findByRole("heading", { name });
}

function checkboxNames(): string[] {
  return screen
    .getAllByRole("checkbox")
    .map((el) => el.getAttribute("data-category-id") ?? "");
}

function box(name: string) {
  return screen.getByRole("checkbox", { name });
}

describe("categoryOrder", () => {
  it("shuffles the id-sorted categories with the track and pass as seed", () => {
    const sorted = [...CATEGORIES].sort((a, b) => (a.id < b.id ? -1 : 1));
    const expected = shuffled(sorted, seededRandom("t1:pass1")).map(
      (c) => c.id,
    );
    expect(categoryOrder(CATEGORIES, "t1", 1).map((c) => c.id)).toEqual(
      expected,
    );
  });

  it("does not depend on the order categories arrive in", () => {
    const reversed = [...CATEGORIES].reverse();
    expect(categoryOrder(reversed, "t1", 1)).toEqual(
      categoryOrder(CATEGORIES, "t1", 1),
    );
  });

  it("differs between passes of the same track", () => {
    expect(categoryOrder(CATEGORIES, "t3", 2).map((c) => c.id)).not.toEqual(
      categoryOrder(CATEGORIES, "t3", 1).map((c) => c.id),
    );
  });
});

describe("LabelApp: songs", () => {
  it("only ever talks to /api/label", async () => {
    const { urls } = stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(box("Shoegaze"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await heading("Second Song");
    expect(new Set(urls)).toEqual(new Set(["/api/label"]));
  });

  it("opens on the first unfinished song with its embed and genres", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    expect(screen.getByText("Artist t1")).toBeInTheDocument();
    expect(screen.getByText("indie")).toBeInTheDocument();
    const embed = document.querySelector("iframe");
    expect(embed).toHaveAttribute(
      "src",
      "https://open.spotify.com/embed/track/t1",
    );
    expect(embed).toHaveAttribute("loading", "lazy");
    expect(embed).toHaveAttribute("allow", "encrypted-media");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("shows every category with its definition and nothing ticked", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(CATEGORIES.length);
    for (const b of boxes) expect(b).not.toBeChecked();
    expect(box("Dream Pop")).toHaveAccessibleDescription(
      "Hazy, reverb-soaked pop.",
    );
  });

  it("renders an In/Out definition as two lines without markdown markers", async () => {
    stubServer(
      state({
        categories: [
          {
            id: "c5",
            name: "Dream Pop",
            definition: "**In:** Hazy pop.\n**Out:** Shoegaze is louder.",
          },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("First Song");
    expect(screen.getByText("In: Hazy pop.")).toBeInTheDocument();
    expect(screen.getByText("Out: Shoegaze is louder.")).toBeInTheDocument();
    expect(box("Dream Pop")).toHaveAccessibleDescription(
      "In: Hazy pop. Out: Shoegaze is louder.",
    );
    expect(document.body.textContent).not.toContain("**");
  });

  it("orders categories per track, stable across re-render and reload", async () => {
    stubServer(state());
    const { rerender, unmount } = render(<LabelApp />);
    await heading("First Song");
    const first = checkboxNames();
    expect(first).toEqual(categoryOrder(CATEGORIES, "t1", 1).map((c) => c.id));

    rerender(<LabelApp />);
    expect(checkboxNames()).toEqual(first);

    unmount();
    render(<LabelApp />);
    await heading("First Song");
    expect(checkboxNames()).toEqual(first);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await heading("Second Song");
    const second = checkboxNames();
    expect(second).toEqual(categoryOrder(CATEGORIES, "t2", 1).map((c) => c.id));
    expect(second).not.toEqual(first);
  });

  it("Save posts the ticked categories and advances", async () => {
    const { posts } = stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(box("Synthwave"));
    await userEvent.click(box("Dream Pop"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await heading("Second Song");

    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(LabelInputSchema.parse(post)).toEqual(post);
    expect(post).toMatchObject({
      kind: "track",
      track_id: "t1",
      pass: 1,
      // Cache order, whatever order they were ticked or shown in.
      category_ids: ["c5", "c3"],
      cant_judge: false,
      definitions_sha256: SHA,
    });
    const elapsed = (post as { elapsed_ms: number }).elapsed_ms;
    expect(Number.isInteger(elapsed)).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("Can't judge posts no categories even with ticks", async () => {
    const { posts } = stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(box("Trance"));
    await userEvent.click(screen.getByRole("button", { name: "Can't judge" }));
    await heading("Second Song");
    expect(posts[0]).toMatchObject({
      kind: "track",
      track_id: "t1",
      pass: 1,
      category_ids: [],
      cant_judge: true,
      definitions_sha256: SHA,
    });
    expect(LabelInputSchema.safeParse(posts[0]).success).toBe(true);
  });

  it("Back pre-fills a label saved in this page session", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(box("Shoegaze"));
    await userEvent.click(box("Pop Punk"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await heading("Second Song");
    expect(
      screen.getAllByRole("checkbox").filter((b) => b.matches(":checked")),
    ).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("First Song");
    expect(box("Shoegaze")).toBeChecked();
    expect(box("Pop Punk")).toBeChecked();
    expect(box("Dream Pop")).not.toBeChecked();
  });

  it("Back pre-fills nothing for a label from an earlier session", async () => {
    stubServer(
      state({
        random: [
          { ...track("t1", "First Song"), done: true },
          { ...track("t2", "Second Song"), done: false },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("Second Song");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("First Song");
    for (const b of screen.getAllByRole("checkbox"))
      expect(b).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("Next leaves a revisited song without posting over its label", async () => {
    const { posts } = stubServer(
      state({
        random: [
          { ...track("t1", "First Song"), done: true },
          { ...track("t2", "Second Song"), done: false },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("Second Song");
    // Only a labeled song can be left without an answer.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await heading("Second Song");
    expect(posts).toHaveLength(0);
  });

  it("Back from the finished line reaches the last song", async () => {
    stubServer(
      state({
        random: [
          { ...track("t1", "First Song"), done: true },
          { ...track("t2", "Second Song"), done: false },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("Second Song");
    await userEvent.click(box("Trance"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Every song is labeled."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("Second Song");
    expect(box("Trance")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByText("Every song is labeled."),
    ).toBeInTheDocument();
  });

  it("Back after Can't judge shows that answer, not an empty label", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Can't judge" }));
    await heading("Second Song");
    expect(screen.queryByText("Saved as can't judge.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("First Song");
    expect(screen.getByText("Saved as can't judge.")).toBeInTheDocument();
    for (const b of screen.getAllByRole("checkbox"))
      expect(b).not.toBeChecked();
  });

  it("re-saving after Back skips to the next unlabeled song", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await heading("Second Song");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await heading("Second Song");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Every song is labeled."),
    ).toBeInTheDocument();
  });

  it("a 409 asks for a reload and keeps the ticks", async () => {
    stubServer(state(), [
      { status: 409, body: { error: "definitions_changed" } },
    ]);
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(box("Deep House"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "Definitions changed since this page loaded. Reload.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "First Song" })).toBeVisible();
    expect(box("Deep House")).toBeChecked();
  });

  it("any other error shows its message and keeps the ticks", async () => {
    stubServer(state(), [
      {
        status: 400,
        body: { error: "bad_input", message: "unknown category" },
      },
    ]);
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(box("Vaporwave"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("unknown category")).toBeInTheDocument();
    expect(box("Vaporwave")).toBeChecked();
    expect(screen.getByRole("heading", { name: "First Song" })).toBeVisible();
  });

  it("shows why the page can't load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "no_sample" }), { status: 404 }),
      ),
    );
    render(<LabelApp />);
    expect(await screen.findByText(/No sample yet/)).toBeInTheDocument();
  });
});

describe("LabelApp: modes", () => {
  it("opens on Pairs when every song is labeled", async () => {
    stubServer(
      state({
        random: [{ ...track("t1", "First Song"), done: true }],
      }),
    );
    render(<LabelApp />);
    await heading("Pair Song");
    expect(screen.getByRole("button", { name: "Pairs" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Pairs shows the one category and posts the answer", async () => {
    const { posts } = stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Pairs" }));
    await heading("Pair Song");
    expect(screen.getByText("Shoegaze")).toBeInTheDocument();
    expect(screen.getByText("Walls of guitar noise.")).toBeInTheDocument();
    expect(screen.queryByText("Dream Pop")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(document.querySelector("iframe")).toHaveAttribute(
      "src",
      "https://open.spotify.com/embed/track/t9",
    );

    const answers = screen.getByRole("group", { name: /Shoegaze/ });
    await userEvent.click(within(answers).getByRole("button", { name: "No" }));
    expect(
      await screen.findByText("Every pair is labeled."),
    ).toBeInTheDocument();
    // The last pair stays reachable, so a mis-click can be corrected.
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(LabelInputSchema.parse(post)).toEqual(post);
    expect(post).toMatchObject({
      kind: "pair",
      pair_id: "p001",
      answer: "no",
      definitions_sha256: SHA,
    });
    expect(Number.isInteger((post as { elapsed_ms: number }).elapsed_ms)).toBe(
      true,
    );
  });

  it("Pairs: Back shows this session's answer and a new answer replaces it", async () => {
    const { posts } = stubServer(
      state({
        random: [{ ...track("t1", "First Song"), done: true }],
        pairs: [
          {
            ...track("t9", "Pair Song"),
            pair_id: "p001",
            category_id: "c2",
            done: false,
          },
          {
            ...track("t8", "Other Pair"),
            pair_id: "p002",
            category_id: "c5",
            done: false,
          },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("Pair Song");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await heading("Other Pair");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("Pair Song");
    expect(screen.getByText("Saved as yes.")).toBeInTheDocument();
    // Next leaves it without posting again.
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await heading("Other Pair");
    expect(posts).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("Pair Song");
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    await heading("Other Pair");
    expect(posts.map((p) => (p as { answer: string }).answer)).toEqual([
      "yes",
      "no",
    ]);
  });

  it("Relabel shows one line with the earliest opening when none is open", async () => {
    const soon = new Date(Date.now() + 3 * HOUR).toISOString();
    const later = new Date(Date.now() + 9 * HOUR).toISOString();
    stubServer(
      state({
        relabel: [
          { ...track("t3", "Third Song"), done: false, opens_at: later },
          { ...track("t4", "Fourth Song"), done: false, opens_at: soon },
          { ...track("t5", "Fifth Song"), done: false, opens_at: null },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Relabel" }));
    expect(
      await screen.findByText(`Next relabel opens ${formatLocal(soon)}.`),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Third Song" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Fourth Song" })).toBeNull();
  });

  it("Relabel labels open items as pass 2 in the pass-2 order", async () => {
    const past = new Date(Date.now() - HOUR).toISOString();
    const future = new Date(Date.now() + HOUR).toISOString();
    const { posts } = stubServer(
      state({
        random: [{ ...track("t1", "First Song"), done: true }],
        pairs: [],
        relabel: [
          { ...track("t3", "Third Song"), done: false, opens_at: future },
          { ...track("t4", "Fourth Song"), done: false, opens_at: past },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("Fourth Song");
    expect(checkboxNames()).toEqual(
      categoryOrder(CATEGORIES, "t4", 2).map((c) => c.id),
    );
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    await userEvent.click(box("Midwest Emo"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      kind: "track",
      track_id: "t4",
      pass: 2,
      category_ids: ["c1"],
      cant_judge: false,
      definitions_sha256: SHA,
    });
    expect(
      await screen.findByText(`Next relabel opens ${formatLocal(future)}.`),
    ).toBeInTheDocument();
  });
});

describe("LabelApp: gold set", () => {
  const withGold = (over: Partial<LabelState> = {}) =>
    state({
      gold: [
        { ...track("g1", "Gold One"), done: false },
        { ...track("g2", "Gold Two"), done: false },
      ],
      ...over,
    });

  it("labels a gold song as pass 1 of the gold set", async () => {
    const { posts } = stubServer(withGold());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Gold set" }));
    await heading("Gold One");
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    for (const b of screen.getAllByRole("checkbox")) expect(b).not.toBeChecked();

    await userEvent.click(box("Trance"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await heading("Gold Two");
    const post = posts[0]!;
    expect(LabelInputSchema.parse(post)).toEqual(post);
    expect(post).toMatchObject({
      kind: "track",
      track_id: "g1",
      pass: 1,
      set: "gold",
      category_ids: ["c4"],
    });
  });

  it("opens on the gold set once songs and pairs are done, before the locked relabel", async () => {
    stubServer(
      withGold({
        random: [{ ...track("t1", "First Song"), done: true }],
        pairs: [
          {
            ...track("t9", "Pair Song"),
            pair_id: "p001",
            category_id: "c2",
            done: true,
          },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("Gold One");
    expect(screen.getByRole("button", { name: "Gold set" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
