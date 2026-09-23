import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelApp } from "@/src/components/label/LabelApp";
import type { LabelState } from "@/src/lib/labeling/schema";

// "Accept all" must offer only what it can actually write. The relabel queue
// is time-locked per item, so unlabeled != actionable: a locked queue offered
// the button, said "the 30 remaining", then wrote nothing and reported 0 / 0.
// And a confirm left open on one queue used to follow you to the next, where
// one more click would bulk-write model answers into a queue you never opened
// it for — into an append-only file.

const SHA = "sha-defs-1";
const HOUR = 60 * 60 * 1000;
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
  };
}

function stubServer(s: LabelState) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ ok: true }), { status: 200 })
        : new Response(JSON.stringify(s), { status: 200 }),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ACCEPT_ALL = /Accept all suggestions/;
const CONFIRM = /Save the model's answer/;

/** Every queue finished except relabel, whose only item is still locked. */
function lockedRelabelOnly(): LabelState {
  return {
    definitions_sha256: SHA,
    categories: CATEGORIES,
    random: [{ ...track("t1", "First Song"), done: true }],
    gold: [],
    pairs: [],
    relabel: [
      {
        ...track("t1", "First Song"),
        done: false,
        opens_at: new Date(Date.now() + 5 * HOUR).toISOString(),
      },
    ],
  };
}

/** Songs still has work; relabel is locked. */
function songsOpenRelabelLocked(): LabelState {
  return {
    definitions_sha256: SHA,
    categories: CATEGORIES,
    random: [
      { ...track("t1", "First Song"), done: false },
      { ...track("t2", "Second Song"), done: false },
    ],
    gold: [],
    pairs: [],
    relabel: [
      {
        ...track("t3", "Third Song"),
        done: false,
        opens_at: new Date(Date.now() + 5 * HOUR).toISOString(),
      },
    ],
  };
}

describe("bulk accept gating", () => {
  it("offers nothing on a queue where every item is still locked", async () => {
    stubServer(lockedRelabelOnly());
    render(<LabelApp />);
    // It auto-selects the only queue with work left, which is Relabel.
    expect(await screen.findByText(/Next relabel opens/)).toBeTruthy();
    expect(screen.queryByText(ACCEPT_ALL)).toBeNull();
  });

  it("counts only the items it can actually write", async () => {
    stubServer(songsOpenRelabelLocked());
    render(<LabelApp />);
    await userEvent.click(await screen.findByText(ACCEPT_ALL));
    // Two unlabeled songs, both open — the count is about actionable items.
    expect(screen.getByText(/the 2 remaining\?/)).toBeTruthy();
  });

  it("drops an open confirm when you switch queues", async () => {
    stubServer(songsOpenRelabelLocked());
    render(<LabelApp />);
    await userEvent.click(await screen.findByText(ACCEPT_ALL));
    expect(screen.getByText(CONFIRM)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Relabel" }));
    await userEvent.click(screen.getByRole("button", { name: "Songs" }));

    expect(screen.queryByText(CONFIRM)).toBeNull();
  });
});
