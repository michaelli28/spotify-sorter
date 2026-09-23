import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import Home from "@/app/page";

let dir: string;
const savedEnv = {
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  SORTER_DATA_DIR: process.env.SORTER_DATA_DIR,
};

function configure() {
  process.env.SPOTIFY_CLIENT_ID = "c".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-home-"));
  process.env.SORTER_DATA_DIR = dir;
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(async () => {
  router.push.mockReset();
  await rm(dir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ISO = "2026-09-01T00:00:00.000Z";
const AUTH = { refresh_token: "rt-secret", expires_at: ISO };
const track = (title: string) => ({ artist_id: "a1", title, first_seen: ISO });
const category = (name: string, playlist: string | null = null) => ({
  name,
  description: "",
  spotify_playlist_id: playlist,
  created_at: ISO,
  example_track_ids: [],
});
const assignment = (categoryId: string) => ({
  matches: [{ category_id: categoryId, score: 80 }],
  classified_at: ISO,
  override: null,
});
const TRACKS = { t1: track("One"), t2: track("Two"), t3: track("Three") };
const CATEGORIES = { c1: category("Night Drive"), c2: category("Rain") };
const SORTED = {
  t1: assignment("c1"),
  t2: assignment("c2"),
  t3: assignment("c1"),
};

async function writeLibrary(over: Record<string, unknown> = {}) {
  await writeFile(
    join(dir, "cache.json"),
    JSON.stringify({
      version: 2,
      auth: AUTH,
      config: {
        prefix: "✨",
        confidence_threshold: 65,
        anthropic_model: "claude-haiku-4-5-20251001",
      },
      scope: {
        included_playlist_ids: [],
        excluded_playlist_ids: [],
        include_liked_songs: true,
      },
      artists: { a1: { name: "Artist", genres: [] } },
      tracks: TRACKS,
      categories: CATEGORIES,
      assignments: SORTED,
      runs: [],
      playlist_snapshots: {},
      liked_songs_fingerprint: null,
      ...over,
    }),
  );
}

async function renderHome(params: Record<string, string> = {}) {
  return render(await Home({ searchParams: Promise.resolve(params) }));
}

const hrefs = () =>
  screen.queryAllByRole("link").map((a) => a.getAttribute("href"));
const primaries = (container: HTMLElement) =>
  container.querySelectorAll('[data-variant="primary"]');

describe("Home, first run", () => {
  it("offers Set up before the keys are in place", async () => {
    await renderHome();
    expect(screen.getByRole("link", { name: "Set up" })).toHaveAttribute(
      "href",
      "/setup",
    );
    expect(screen.queryByRole("link", { name: /Spotify/ })).toBeNull();
  });

  it("offers Connect Spotify once the keys are set", async () => {
    configure();
    await renderHome();
    expect(
      screen.getByRole("link", { name: "Connect Spotify" }),
    ).toHaveAttribute("href", "/api/auth/login");
  });

  it("says what it will do without promising a category count or a model", async () => {
    configure();
    await renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: /Sort your library/ }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/back to your Spotify/);
    expect(document.body).not.toHaveTextContent(
      /25-35|Haiku|incremental|record-listening room/i,
    );
  });

  it("goes to the playlist picker when Spotify is connected but nothing is read yet", async () => {
    configure();
    await writeLibrary({ tracks: {}, categories: {}, assignments: {} });
    await renderHome();
    expect(
      screen.getByRole("link", { name: "Choose playlists" }),
    ).toHaveAttribute("href", "/scope");
    expect(screen.queryByRole("link", { name: "Connect Spotify" })).toBeNull();
  });
});

describe("Home, returning", () => {
  it("prices the unsorted tracks before sorting them", async () => {
    configure();
    await writeLibrary({ assignments: { t1: assignment("c1") } });
    await renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "1 of 3 tracks sorted." }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Sort 2 tracks" }),
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(/2 tracks/);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("leads to the Spotify write once every track is sorted", async () => {
    configure();
    await writeLibrary();
    await renderHome();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "3 tracks, sorted into 2 categories.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("None on Spotify yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apply to Spotify" }),
    ).toHaveAttribute("href", "/apply");
  });

  it("still leads to the write while some categories are missing from Spotify", async () => {
    configure();
    await writeLibrary({
      categories: { c1: category("Night Drive", "sp1"), c2: category("Rain") },
    });
    await renderHome();
    expect(screen.getByText("1 of 2 on Spotify.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apply to Spotify" }),
    ).toHaveAttribute("href", "/apply");
  });

  it("offers a fresh read once every category is on Spotify", async () => {
    configure();
    await writeLibrary({
      categories: {
        c1: category("Night Drive", "sp1"),
        c2: category("Rain", "sp2"),
      },
    });
    await renderHome();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "2 playlists on Spotify.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Check for new tracks" }),
    ).toHaveAttribute("href", "/scope");
    expect(screen.queryByRole("link", { name: /Apply/ })).toBeNull();
    expect(hrefs().filter((h) => h === "/scope")).toHaveLength(1);
  });

  it("keeps quiet links to the other pages", async () => {
    configure();
    await writeLibrary();
    await renderHome();
    const quiet = [
      ["Categories", "/review"],
      ["Labels", "/label"],
      ["Check for new tracks", "/scope"],
      ["Reconnect Spotify", "/api/auth/login"],
    ] as const;
    for (const [name, href] of quiet) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).not.toHaveAttribute("data-variant", "primary");
    }
  });

  it("asks to connect instead of offering Spotify steps when the token is gone", async () => {
    configure();
    await writeLibrary({ auth: null });
    await renderHome();
    expect(
      screen.getByRole("link", { name: "Connect Spotify" }),
    ).toHaveAttribute("href", "/api/auth/login");
    for (const name of [
      "Apply to Spotify",
      "Check for new tracks",
      "Reconnect Spotify",
    ]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
  });

  it("offers Set up when the keys went missing, whatever the library holds", async () => {
    await writeLibrary({ assignments: { t1: assignment("c1") } });
    await renderHome();
    expect(screen.getByRole("link", { name: "Set up" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sort/ })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Reconnect Spotify" }),
    ).toBeNull();
  });

  // With nothing else to list, a lone Reconnect is noise: the primary already
  // goes to /scope, which offers Reconnect when Spotify refuses.
  it("keeps Reconnect with the other quiet links, never on its own", async () => {
    configure();
    await writeLibrary({ categories: {}, assignments: {} });
    await renderHome();
    expect(
      screen.queryByRole("link", { name: "Reconnect Spotify" }),
    ).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("still says a declined reconnect left the old connection alone", async () => {
    configure();
    await writeLibrary({ categories: {}, assignments: {} });
    await renderHome({ error: "denied", detail: "access_denied" });
    expect(
      screen.getByText("Spotify didn't reconnect (access_denied)."),
    ).toBeInTheDocument();
  });

  // /review proposes categories, and pays for it, as soon as it loads empty.
  it("never sends a library without categories to the page that proposes them", async () => {
    configure();
    await writeLibrary({ categories: {}, assignments: {} });
    await renderHome();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "3 tracks, no categories yet.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Choose playlists" }),
    ).toHaveAttribute("href", "/scope");
    expect(hrefs()).not.toContain("/review");
  });
});

describe("Home, notices", () => {
  it("says Spotify didn't connect when consent was declined", async () => {
    configure();
    await renderHome({ error: "denied", detail: "access_denied" });
    expect(
      screen.getByText("Spotify didn't connect (access_denied)."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Connect Spotify" }),
    ).toBeInTheDocument();
  });

  // The stored token still works after a declined reconnect, so "didn't
  // connect" above Apply would read as if Apply had failed.
  it("says the reconnect failed, beside Reconnect, when the old connection still stands", async () => {
    configure();
    await writeLibrary();
    await renderHome({ error: "denied", detail: "access_denied" });
    const line = screen.getByText("Spotify didn't reconnect (access_denied).");
    const nav = screen.getByRole("navigation");
    expect(nav).toContainElement(line);
    expect(
      within(nav).getByRole("link", { name: "Reconnect Spotify" }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/didn't connect/);
  });

  it("does not echo arbitrary text from the address bar", async () => {
    configure();
    await renderHome({ error: "denied", detail: "Call 555-0100 now" });
    expect(screen.getByText("Spotify didn't connect.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/555/);
  });

  it("stays quiet without a denial", async () => {
    configure();
    await renderHome({ detail: "access_denied" });
    expect(document.body).not.toHaveTextContent(/didn't connect/);
  });

  it("explains a cache from another version instead of failing", async () => {
    configure();
    await writeLibrary({ version: 99 });
    const { container } = await renderHome();
    expect(
      screen.getByText(/from another version of SpotifySorter/),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(primaries(container)).toHaveLength(0);
  });
});

describe("Home, safety", () => {
  const states: Array<[string, () => Promise<void>]> = [
    ["unconfigured", async () => {}],
    ["first run", async () => configure()],
    [
      "no categories",
      async () => {
        configure();
        await writeLibrary({ categories: {}, assignments: {} });
      },
    ],
    [
      "unsorted",
      async () => {
        configure();
        await writeLibrary({ assignments: {} });
      },
    ],
    [
      "sorted",
      async () => {
        configure();
        await writeLibrary();
      },
    ],
    [
      "applied",
      async () => {
        configure();
        await writeLibrary({
          categories: {
            c1: category("Night Drive", "sp1"),
            c2: category("Rain", "sp2"),
          },
        });
      },
    ],
  ];

  it.each(states)(
    "%s: one accent action, and no link opens a paid page",
    async (_name, arrange) => {
      await arrange();
      const { container } = await renderHome();
      expect(primaries(container)).toHaveLength(1);
      expect(hrefs()).not.toContain("/scan");
      expect(hrefs()).not.toContain("/classify");
    },
  );

  it("reads the library without writing it", async () => {
    configure();
    await writeLibrary();
    const path = join(dir, "cache.json");
    const before = [await readFile(path, "utf8"), (await stat(path)).mtimeMs];
    await renderHome();
    expect([await readFile(path, "utf8"), (await stat(path)).mtimeMs]).toEqual(
      before,
    );
  });

  it("shows no per-category detail beyond the counts", async () => {
    configure();
    await writeLibrary();
    await renderHome();
    const main = screen.getByRole("main");
    expect(within(main).queryByText(/Night Drive|Rain/)).toBeNull();
  });
});
