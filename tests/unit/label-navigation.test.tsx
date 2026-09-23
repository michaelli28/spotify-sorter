import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelApp } from "@/src/components/label/LabelApp";
import { categoryOrder } from "@/src/components/label/logic";
import type { LabelState } from "@/src/lib/labeling/schema";

// Ways in, out and onward from /label: every state has a way home, a failed
// load can be retried, a 409 can be acted on, and a finished queue points at
// the next one with open work.

const SHA = "sha-defs-1";
const HOUR = 60 * 60 * 1000;
const CATEGORIES = [
  { id: "c5", name: "Dream Pop", definition: "Hazy pop." },
  { id: "c2", name: "Shoegaze", definition: "Guitar noise." },
  { id: "c3", name: "Synthwave", definition: "Retro synths." },
];

function track(id: string, title: string) {
  return { track_id: id, title, artist_name: `Artist ${id}`, genres: [] };
}

function state(over: Partial<LabelState> = {}): LabelState {
  return {
    definitions_sha256: SHA,
    categories: CATEGORIES,
    random: [
      { ...track("t1", "First Song"), done: false },
      { ...track("t2", "Second Song"), done: false },
    ],
    gold: [],
    pairs: [
      {
        ...track("t9", "Pair Song"),
        pair_id: "p1",
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

// GETs take the next queued reply, then the state; POSTs take the next one.
function stubServer(
  s: LabelState,
  { gets = [], posts = [] }: { gets?: Reply[]; posts?: Reply[] } = {},
) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const r =
      (init?.method === "POST" ? posts.shift() : gets.shift()) ??
      (init?.method === "POST"
        ? { status: 200, body: { ok: true } }
        : { status: 200, body: s });
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

const heading = (name: string) => screen.findByRole("heading", { name });
const tab = (name: string) => screen.getByRole("button", { name });

describe("/label ways out and onward", () => {
  it("links home from a queue", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("links home and offers Try again when the page can't load", async () => {
    stubServer(state(), {
      gets: [{ status: 404, body: { error: "no_sample" } }],
    });
    render(<LabelApp />);
    expect(await screen.findByText(/No sample yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await heading("First Song");
    expect(screen.queryByText(/No sample yet/)).toBeNull();
  });

  it("offers Reload beside a definitions-changed error, and only there", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    stubServer(state(), {
      posts: [
        {
          status: 400,
          body: { error: "bad_input", message: "unknown category" },
        },
        { status: 409, body: { error: "definitions_changed" } },
      ],
    });
    render(<LabelApp />);
    await heading("First Song");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("unknown category")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "Definitions changed since this page loaded. Reload.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("continues from a finished queue to the first one with open work", async () => {
    stubServer(
      state({
        random: [{ ...track("t1", "First Song"), done: true }],
        pairs: [],
        relabel: [
          {
            ...track("t3", "Third Song"),
            done: false,
            opens_at: new Date(Date.now() - HOUR).toISOString(),
          },
        ],
      }),
    );
    render(<LabelApp />);
    await heading("Third Song");
    await userEvent.click(tab("Songs"));
    expect(
      await screen.findByText("Every song is labeled."),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Continue to Relabel" }),
    );
    await heading("Third Song");
    expect(tab("Relabel")).toHaveAttribute("aria-pressed", "true");
  });

  it("offers no Continue when nothing else is open", async () => {
    stubServer(
      state({
        random: [{ ...track("t1", "First Song"), done: true }],
        pairs: [],
      }),
    );
    render(<LabelApp />);
    // Relabel is unfinished but locked, so the page opens on its line.
    expect(await screen.findByText(/Next relabel opens/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue to/ })).toBeNull();
    await userEvent.click(tab("Songs"));
    expect(
      await screen.findByText("Every song is labeled."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue to/ })).toBeNull();
  });

  it("marks other tabs that have open work, without renaming them", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    // Pairs has one open pair; the count is visual only.
    const pairs = tab("Pairs");
    expect(pairs).toHaveTextContent("1");
    const count = within(pairs).getByText("1");
    expect(count).toHaveAttribute("aria-hidden", "true");
    // The active tab, an empty queue and a locked one carry nothing.
    expect(tab("Songs")).toHaveTextContent(/^Songs$/);
    expect(tab("Gold set")).toHaveTextContent(/^Gold set$/);
    expect(tab("Relabel")).toHaveTextContent(/^Relabel$/);
  });

  it("says what is ticked next to Save", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    expect(screen.getByText("Nothing ticked")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Synthwave" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Dream Pop" }));
    // In the order the list shows them.
    const shown = categoryOrder(CATEGORIES, "t1", 1)
      .map((c) => c.name)
      .filter((n) => n !== "Shoegaze");
    expect(screen.getByText(shown.join(", "))).toBeInTheDocument();
    expect(screen.queryByText("Nothing ticked")).toBeNull();
  });

  it("does not also say Nothing ticked under a saved can't judge", async () => {
    stubServer(state());
    render(<LabelApp />);
    await heading("First Song");
    await userEvent.click(screen.getByRole("button", { name: "Can't judge" }));
    await heading("Second Song");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("First Song");
    expect(screen.getByText("Saved as can't judge.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing ticked")).toBeNull();
  });
});
