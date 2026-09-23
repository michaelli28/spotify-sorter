import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelApp } from "@/src/components/label/LabelApp";
import type { LabelState } from "@/src/lib/labeling/schema";

// A bulk run writes model answers one POST at a time into an append-only file.
// While it runs nothing else on the page may write or move you away from its
// progress, and Stop must end it after the request already in flight.

const SHA = "sha-defs-1";
const CATEGORIES = [
  { id: "c1", name: "Dream Pop", definition: "Hazy pop." },
  { id: "c2", name: "Shoegaze", definition: "Guitar noise." },
];

function song(id: string, title: string) {
  return {
    track_id: id,
    title,
    artist_name: `Artist ${id}`,
    genres: [],
    done: false,
    suggestions: [{ category_id: "c1", score: 80 }],
  };
}

function state(): LabelState {
  return {
    definitions_sha256: SHA,
    categories: CATEGORIES,
    random: [
      song("t1", "First Song"),
      song("t2", "Second Song"),
      song("t3", "Third Song"),
    ],
    gold: [],
    pairs: [],
    relabel: [],
  } as never as LabelState;
}

// Every POST waits until the test lets it answer.
function stubServer(s: LabelState) {
  const pending: Array<() => void> = [];
  let gets = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Promise<Response>((resolve) =>
          pending.push(() =>
            resolve(
              new Response(JSON.stringify({ ok: true }), { status: 200 }),
            ),
          ),
        );
      gets += 1;
      return Promise.resolve(new Response(JSON.stringify(s), { status: 200 }));
    }),
  );
  return {
    pending,
    gets: () => gets,
    answerNext: async () => {
      await act(async () => pending.shift()?.());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

async function startRun() {
  await screen.findByRole("heading", { name: "First Song" });
  await userEvent.click(screen.getByText(/Accept all suggestions/));
  await userEvent.click(screen.getByRole("button", { name: "Accept all" }));
}

describe("bulk accept while running", () => {
  it("locks the tabs, the song and Home until the run ends", async () => {
    const server = stubServer(state());
    render(<LabelApp />);
    await startRun();

    for (const name of ["Songs", "Pairs", "Gold set", "Relabel"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    for (const name of ["Save", "Can't judge"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    const home = screen.getByRole("link", { name: "Home" });
    expect(home).not.toHaveAttribute("href");
    expect(home).toHaveAttribute("aria-disabled", "true");

    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(server.pending).toHaveLength(1));
      await server.answerNext();
    }
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Songs" })).toBeEnabled(),
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("says how far it got", async () => {
    const server = stubServer(state());
    render(<LabelApp />);
    await startRun();
    expect(screen.getByText("Saving 0 of 3")).toBeInTheDocument();
    await waitFor(() => expect(server.pending).toHaveLength(1));
    await server.answerNext();
    expect(await screen.findByText("Saving 1 of 3")).toBeInTheDocument();
  });

  it("Stop ends the run after the request in flight and re-reads the queue", async () => {
    const server = stubServer(state());
    render(<LabelApp />);
    await startRun();
    await waitFor(() => expect(server.pending).toHaveLength(1));
    const readsBefore = server.gets();

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    await server.answerNext();

    // Back to idle, re-read from the server, and no second write started.
    expect(
      await screen.findByText(/Accept all suggestions/),
    ).toBeInTheDocument();
    expect(server.gets()).toBe(readsBefore + 1);
    expect(server.pending).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Songs" })).toBeEnabled();
  });

  it("keeps the categories out of reach until the run ends", async () => {
    const server = stubServer(state());
    render(<LabelApp />);
    await startRun();
    // A tick made now would be thrown away when the run moves the song on.
    for (const box of screen.getAllByRole("checkbox"))
      expect(box).toBeDisabled();

    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(server.pending).toHaveLength(1));
      await server.answerNext();
    }
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")[0]).toBeEnabled(),
    );
  });

  it("says how many it saved once the run ends", async () => {
    const server = stubServer(state());
    render(<LabelApp />);
    await startRun();
    await waitFor(() => expect(server.pending).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await server.answerNext();

    expect(await screen.findByText("Saved 1 of 3.")).toBeInTheDocument();
    // A new question replaces the old outcome rather than sitting beside it.
    await userEvent.click(screen.getByText(/Accept all suggestions/));
    expect(screen.queryByText("Saved 1 of 3.")).toBeNull();
  });
});

describe("bulk accept focus", () => {
  it("moves focus to Cancel when the confirm opens, so a second Enter can't write", async () => {
    const server = stubServer(state());
    render(<LabelApp />);
    await screen.findByRole("heading", { name: "First Song" });
    screen.getByRole("button", { name: "Accept all suggestions" }).focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Accept all" })).toBeNull();
    expect(server.pending).toHaveLength(0);
    // Back on the control that asked, not dropped on the page.
    expect(
      screen.getByRole("button", { name: "Accept all suggestions" }),
    ).toHaveFocus();
  });

  it("moves focus to Stop when the run starts", async () => {
    stubServer(state());
    render(<LabelApp />);
    await startRun();
    expect(screen.getByRole("button", { name: "Stop" })).toHaveFocus();
  });

  it("leaves focus on the tab when a tab click closes the confirm", async () => {
    stubServer(state());
    render(<LabelApp />);
    await screen.findByRole("heading", { name: "First Song" });
    await userEvent.click(screen.getByText(/Accept all suggestions/));

    // The active tab: the song stays, so nothing else takes focus either.
    const songs = screen.getByRole("button", { name: "Songs" });
    await userEvent.click(songs);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(songs).toHaveFocus();
  });
});
