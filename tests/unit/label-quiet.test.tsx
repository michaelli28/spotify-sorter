import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelApp } from "@/src/components/label/LabelApp";
import type { LabelState } from "@/src/lib/labeling/schema";

// /label is the quietest page (brief §3, spec §1): ink on card stock only. The
// sleeves' colours encode mood cues, so no sleeve, tab tint, album art or
// orange may print beside a blind judgement, and nothing travels on screen.

const ROOT = process.cwd();
const DIRS = ["app/label", "src/components/label"];

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const files = DIRS.flatMap((d) => filesUnder(join(ROOT, d))).map(
  (f) => [relative(ROOT, f), readFileSync(f, "utf-8")] as const,
);

const BANNED: Array<[string, RegExp]> = [
  [
    "a sleeve, tab or album art",
    /components\/graphics|lib\/sleeves|lib\/artwork/,
  ],
  [
    "orange",
    /\b(?:bg|text|border|fill|stroke|decoration|outline|accent)-accent\b|--accent\b/,
  ],
  ["a temperature or riso ink", /\bt-(?:dusk|charge|glow|haze)\b|--riso-/],
  // Logical sides too: border-s/-e is the same stripe.
  ["a side stripe", /border-[lrse]-(?:[2-9]|\[)/],
  ["a shared-layout slide", /layoutId/],
  // The prop, not the word: comments here say "layout".
  ["a layout animation", /\slayout(?:=|\s*\/?>)|^\s*layout\s*$/m],
  ["a gesture or variant animation", /\bwhile[A-Z]\w*=|\bvariants=/],
  ["an exit animation", /\bexit=/],
];

describe("/label stays quiet", () => {
  it("scans the page and its components", () => {
    expect(files.map(([name]) => name)).toContain(
      join("src", "components", "label", "LabelApp.tsx"),
    );
  });

  it.each(files)("%s prints no colour, art or travel", (_name, text) => {
    const hits = BANNED.filter(([, re]) => re.test(text)).map(([n]) => n);
    expect(hits).toEqual([]);
  });

  it.each(files)("%s animates opacity only", (_name, text) => {
    // A literal opacity object and nothing else: a variant name or a controls
    // object could move something this check can't read.
    for (const m of text.matchAll(/\b(?:initial|animate)=(\{\{[^}]*\}\}|\S+)/g))
      expect(m[1]!.replace(/\s/g, "")).toMatch(/^\{\{opacity:\d+,?\}\}$/);
  });

  // An absolute ::before/::after sizes to the nearest positioned ancestor. On
  // the ghost recipe (not positioned) it made the whole page one Home link.
  it.each(files)("%s positions every absolute pseudo's owner", (_name, text) => {
    for (const m of text.matchAll(/"([^"\n]*)"|`([^`]*)`/g)) {
      const s = m[1] ?? m[2] ?? "";
      if (/(?:before|after):absolute\b/.test(s))
        expect(s).toMatch(/(?:^|\s)(?:relative|absolute|fixed|sticky)(?:\s|$)/);
    }
  });
});

const CATEGORIES = [
  { id: "c1", name: "Dream Pop", definition: "Hazy pop." },
  { id: "c2", name: "Shoegaze", definition: "Guitar noise." },
];

function state(): LabelState {
  const song = (id: string, title: string) => ({
    track_id: id,
    title,
    artist_name: `Artist ${id}`,
    genres: [],
    done: false,
    suggestions: [{ category_id: "c1", score: 80 }],
  });
  return {
    definitions_sha256: "sha",
    categories: CATEGORIES,
    random: [song("t1", "First Song"), song("t2", "Second Song")],
    gold: [],
    pairs: [
      {
        ...song("t9", "Pair Song"),
        pair_id: "p1",
        category_id: "c2",
        suggestion: { score: 70, verdict: "yes" },
      },
    ],
    relabel: [],
  } as never as LabelState;
}

afterEach(() => vi.unstubAllGlobals());

describe("/label prints in ink only", () => {
  it("has no orange primary on a song, a pair or a finished queue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? new Response(JSON.stringify({ ok: true }), { status: 200 })
          : new Response(JSON.stringify(state()), { status: 200 }),
      ),
    );
    const primaries = () =>
      document.querySelectorAll('[data-variant="primary"]').length;
    render(<LabelApp />);

    await screen.findByRole("heading", { name: "First Song" });
    expect(primaries()).toBe(0);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "data-variant",
      "ink",
    );

    await userEvent.click(screen.getByRole("button", { name: "Pairs" }));
    await screen.findByRole("heading", { name: "Pair Song" });
    expect(primaries()).toBe(0);
    for (const name of ["Yes", "No"])
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "data-variant",
        "ink",
      );

    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await screen.findByText("Every pair is labelled.");
    expect(primaries()).toBe(0);
    expect(
      screen.getByRole("button", { name: "Continue to Songs" }),
    ).toHaveAttribute("data-variant", "ink");
  });

  it("has no orange primary when the page can't load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "no_sample" }), { status: 404 }),
      ),
    );
    render(<LabelApp />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(retry).toHaveAttribute("data-variant", "ink");
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(
      0,
    );
  });
});

describe("/label dims every disabled control", () => {
  // A lock you can't see reads as a live button: while a save was in flight,
  // Can't judge stood at full ink beside a faded Save.
  it("gives every button the dimmed disabled state, in every view", async () => {
    let post: "ok" | "409" | "hang" = "ok";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method !== "POST")
          return new Response(JSON.stringify(state()), { status: 200 });
        if (post === "hang") return new Promise<Response>(() => {});
        return post === "409"
          ? new Response("{}", { status: 409 })
          : new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const undimmed = () =>
      [...document.querySelectorAll("button")]
        .filter((b) => !/(?:^|\s)(?:not-aria-busy:)?disabled:opacity-50(?:\s|$)/.test(b.className))
        .map((b) => b.textContent);
    const click = (name: string) =>
      userEvent.click(screen.getByRole("button", { name }));
    render(<LabelApp />);

    await screen.findByRole("heading", { name: "First Song" });
    expect(undimmed()).toEqual([]);

    await click("Accept all suggestions");
    await screen.findByText(/Save the model's answer/);
    expect(undimmed()).toEqual([]);
    await click("Cancel");

    post = "409";
    await click("Save");
    await screen.findByRole("button", { name: "Reload" });
    expect(undimmed()).toEqual([]);
    post = "ok";

    await click("Pairs");
    await screen.findByRole("heading", { name: "Pair Song" });
    expect(undimmed()).toEqual([]);

    await click("Yes");
    await screen.findByText("Every pair is labelled.");
    expect(undimmed()).toEqual([]);

    await click("Continue to Songs");
    await screen.findByRole("heading", { name: "First Song" });
    post = "hang";
    await click("Accept all suggestions");
    await click("Accept all");
    await screen.findByRole("button", { name: "Stop" });
    expect(undimmed()).toEqual([]);
  });
});
