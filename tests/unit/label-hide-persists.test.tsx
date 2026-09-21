import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelApp } from "@/src/components/label/LabelApp";
import type { LabelInput, LabelState } from "@/src/lib/labeling/schema";

// Hide is a PREFERENCE, not a per-song state. It resets on every song if it
// lives inside the per-item component, which makes relabelling blind cost one
// click per song — 190 of them for the gold set. That turns "you can still get
// the blind claim back" from a real option into a theoretical one, so it is
// pinned here.

const SHA = "sha-defs-1";
const CATEGORIES = [
  { id: "c1", name: "Dream Pop", definition: "Hazy pop." },
  { id: "c2", name: "Shoegaze", definition: "Guitar noise." },
];

function track(id: string, title: string) {
  return {
    track_id: id,
    title,
    artist_name: `Artist ${id}`,
    genres: ["indie"],
    suggestions: [{ category_id: "c1", score: 85 }],
  };
}

function state(): LabelState {
  return {
    definitions_sha256: SHA,
    categories: CATEGORIES,
    random: [
      { ...track("t1", "First Song"), done: false },
      { ...track("t2", "Second Song"), done: false },
    ],
    gold: [],
    pairs: [],
    relabel: [],
  } as never as LabelState;
}

function stubServer(s: LabelState) {
  const posts: LabelInput[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)) as LabelInput);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(s), { status: 200 });
    }),
  );
  return posts;
}

afterEach(() => vi.unstubAllGlobals());

describe("hiding suggestions is a session preference", () => {
  it("stays hidden on the next song, and those rows are not assisted", async () => {
    const posts = stubServer(state());
    const user = userEvent.setup();
    render(<LabelApp />);

    await screen.findByRole("heading", { name: "First Song" });
    expect(screen.getByText(/the model's guesses/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText(/the model's guesses/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "Second Song" });

    // The whole point: still hidden without touching Hide again.
    expect(screen.queryByText(/the model's guesses/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(posts).toHaveLength(2);
    // Song 1 saw them before Hide was clicked, so it is assisted and stays so.
    expect((posts[0] as { assisted: boolean }).assisted).toBe(true);
    // Song 2 never displayed them at all: a genuinely blind row.
    expect((posts[1] as { assisted: boolean }).assisted).toBe(false);
  });

  it("Show brings them back for the rest of the session", async () => {
    stubServer(state());
    const user = userEvent.setup();
    render(<LabelApp />);

    await screen.findByRole("heading", { name: "First Song" });
    await user.click(screen.getByRole("button", { name: "Hide" }));
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText(/the model's guesses/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { name: "Second Song" });
    expect(screen.getByText(/the model's guesses/i)).toBeInTheDocument();
  });
});
