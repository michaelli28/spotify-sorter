// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import reference from "@/tests/fixtures/sleeve-reference.json";
import { B_INKS, INKS, PAPER, TEMP_INK, tabTint } from "@/src/lib/sleeves/inks";
import { sleeveSeed, type SleeveSource } from "@/src/lib/sleeves/lexicon";
import {
  MOTIFS,
  MOTIF_CAP,
  catalogueSpecs,
  specFor,
  specInCatalogue,
} from "@/src/lib/sleeves/spec";
import { TEMPERATURES } from "@/src/lib/sleeves/temperature";

// tests/fixtures/sleeve-reference.json is covers.py's output for the 41 real
// categories, in catalogue order (regenerate: scratchpad build/F2-graphics/make_fixture.py).
const CATS = reference.categories;

describe("inks", () => {
  it("are the brief's nine riso inks, none of them orange", () => {
    expect(Object.keys(INKS)).toHaveLength(9);
    expect(INKS.yellow).toBe("oklch(0.915 0.175 103)");
    expect(INKS.teal).toBe("oklch(0.555 0.090 200)");
    expect(PAPER).toBe("oklch(0.978 0.010 90)");
  });

  it("give each temperature one ink A and four darker ink Bs", () => {
    expect(TEMP_INK).toEqual({
      dusk: "violet",
      charge: "pink",
      glow: "yellow",
      haze: "aqua",
    });
    for (const t of TEMPERATURES) {
      expect(B_INKS[t]).toHaveLength(4);
      expect(B_INKS[t]).not.toContain(TEMP_INK[t]);
    }
  });

  it("tints a tab with the design system's --t-* token, the one source of the tab colours", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
      "utf8",
    );
    for (const t of TEMPERATURES) {
      expect(tabTint(t)).toBe(`var(--t-${t})`);
      // The token mixes this temperature's ink A (the sleeve's drum A) into tab stock.
      expect(css).toMatch(
        new RegExp(
          `--t-${t}:\\s*color-mix\\(in oklab, var\\(--riso-${TEMP_INK[t]}\\) 42%, var\\(--tab-stock\\)\\)`,
        ),
      );
    }
  });
});

describe("catalogueSpecs matches covers.py", () => {
  const specs = catalogueSpecs(CATS);

  it.each(CATS.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const got = specs.get(c.id);
    expect(got).toEqual(c.spec);
  });

  it("returns one spec per category, in catalogue order", () => {
    expect([...specs.keys()]).toEqual(CATS.map((c) => c.id));
  });
});

describe("catalogueSpecs rules", () => {
  it("is deterministic", () => {
    expect(catalogueSpecs(CATS)).toEqual(catalogueSpecs(CATS));
  });

  it("gives all 41 real categories a unique (ink A, ink B, motif)", () => {
    const keys = new Set(
      [...catalogueSpecs(CATS).values()].map(
        (s) => `${s.inkA}+${s.inkB}+${s.motif}`,
      ),
    );
    expect(keys.size).toBe(41);
  });

  it("never uses a motif more than 7 times up to 42 categories", () => {
    const counts = new Map<string, number>();
    for (const s of catalogueSpecs(CATS).values()) {
      counts.set(s.motif, (counts.get(s.motif) ?? 0) + 1);
    }
    expect(MOTIF_CAP).toBe(7);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(MOTIF_CAP);
    expect(Object.fromEntries(counts)).toEqual({
      spines: 7,
      waves: 6,
      pull: 7,
      sleeves: 7,
      groove: 7,
      split: 7,
    });
  });

  it("lifts the cap to the least-used motif past 42 categories", () => {
    // One cue word each, so the four temperatures share the load (as covers.py
    // needs: it prints motifs 10 x 6 for this input).
    const words = ["Dark", "Trap", "Soul", "Chill"];
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `s${i}`,
      name: `${words[i % 4]} ${i}`,
      description: "",
    }));
    const counts = new Map<string, number>();
    for (const s of catalogueSpecs(many).values()) {
      counts.set(s.motif, (counts.get(s.motif) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it("reuses a sleeve rather than throw once one temperature holds all 24", () => {
    // covers.py raises at the 25th haze category here (a temperature has only
    // 6 motifs x 4 ink Bs); a page must still render.
    const haze = Array.from({ length: 30 }, (_, i) => ({
      id: `h${i}`,
      name: `Chill ${i}`,
      description: "",
    }));
    const specs = [...catalogueSpecs(haze).values()];
    expect(specs).toHaveLength(30);
    const first24 = new Set(
      specs.slice(0, 24).map((s) => `${s.motif}+${s.inkB}`),
    );
    expect(first24.size).toBe(24);
    expect(specs.every((s) => s.inkA === "aqua")).toBe(true);
  });

  it("never reprints an earlier category when one is added", () => {
    const before = catalogueSpecs(CATS.slice(0, 40));
    const after = catalogueSpecs(CATS);
    for (const [id, spec] of before) expect(after.get(id)).toEqual(spec);
  });

  it("changes ink A when the owner overrides the temperature", () => {
    const [first, ...rest] = CATS;
    expect(first.spec.temp).toBe("dusk");
    const specs = catalogueSpecs([{ ...first, temperature: "glow" }, ...rest]);
    const s = specs.get(first.id)!;
    expect(s.temp).toBe("glow");
    expect(s.inkA).toBe("yellow");
    expect(B_INKS.glow).toContain(s.inkB);
  });

  it("keeps spines upright (turn 0 or 2)", () => {
    for (const s of catalogueSpecs(CATS).values()) {
      if (s.motif === "spines") expect([0, 2]).toContain(s.turn);
    }
  });
});

describe("specFor (no catalogue context)", () => {
  it("is bump 0 of the category's own candidates", () => {
    const c = CATS[0];
    const s = specFor(c);
    expect(s.seed).toBe(c.spec.seed);
    expect(s.temp).toBe(c.spec.temp);
    expect(s.motif).toBe(MOTIFS[(c.spec.seed >>> 16) % 6]);
    expect(s.inkB).toBe(B_INKS.dusk[(c.spec.seed >>> 6) & 3]);
  });

  it("uses the same misregistration offsets as the catalogue spec", () => {
    for (const c of CATS.slice(0, 5)) {
      const s = specFor(c);
      expect([s.dx, s.dy]).toEqual([c.spec.dx, c.spec.dy]);
    }
  });
});

describe("specInCatalogue", () => {
  /** The catalogue as it will be once `draft` is saved in its place. */
  const saved = (draft: SleeveSource) =>
    CATS.map((c) => (c.id === draft.id ? draft : c));

  it("is the category's catalogue spec", () => {
    expect(specInCatalogue(CATS[7], CATS)).toEqual(CATS[7].spec);
    // An equal copy (a fresh object with the same fields) is the same sleeve.
    expect(specInCatalogue({ ...CATS[7] }, CATS)).toEqual(CATS[7].spec);
  });

  it("prints an unsaved colour override against the saved catalogue", () => {
    const draft = { ...CATS[0], temperature: "glow" as const };
    const s = specInCatalogue(draft, CATS);
    expect(s.temp).toBe("glow");
    expect(s.inkA).toBe("yellow");
    expect(s).toEqual(catalogueSpecs(saved(draft)).get(draft.id));
  });

  it("reprints an unsaved rename against the saved catalogue", () => {
    const draft = { ...CATS[0], name: "Completely Renamed" };
    const s = specInCatalogue(draft, CATS);
    expect(s.seed).toBe(sleeveSeed(draft));
    expect(s.seed).not.toBe(CATS[0].spec.seed);
    expect(s).toEqual(catalogueSpecs(saved(draft)).get(draft.id));
  });

  it("follows an unsaved description when the name has no cue words", () => {
    const cats = [...CATS, { id: "misc", name: "Misc", description: "chill" }];
    expect(specInCatalogue(cats[41], cats).temp).toBe("haze");
    const draft = { ...cats[41], description: "dark metal" };
    expect(specInCatalogue(draft, cats).temp).toBe("dusk");
  });

  it("gives a category the catalogue lacks the sleeve it gets once added at the end", () => {
    const fresh = { id: "new", name: "Brand New", description: "" };
    const s = specInCatalogue(fresh, CATS);
    expect(s).toEqual(catalogueSpecs([...CATS, fresh]).get(fresh.id));
    // The saved catalogue's sleeves never shift for it.
    expect(specInCatalogue(CATS[40], CATS)).toEqual(CATS[40].spec);
  });
});
