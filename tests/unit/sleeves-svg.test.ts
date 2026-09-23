import { describe, it, expect } from "vitest";
import reference from "@/tests/fixtures/sleeve-reference.json";
import { catalogueSpecs, type SleeveSpec } from "@/src/lib/sleeves/spec";
import { SLEEVE_DEFS, sleeveSvgString } from "@/src/lib/sleeves/svg";
import { sleeveArt } from "@/src/lib/sleeves/geometry";

// Every sleeve's markup, element by element and attribute by attribute, against
// covers.py's cover_svg (tests/fixtures/sleeve-reference.json).

interface Node {
  tag: string;
  attrs: [string, string][];
  children: Node[];
}

function tree(el: Element): Node {
  return {
    tag: el.tagName.toLowerCase(),
    attrs: [...el.attributes]
      .map((a): [string, string] => [
        a.name,
        a.value.replace(/\s+/g, " ").trim(),
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
    children: [...el.children].map(tree),
  };
}

function parse(markup: string): Node {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  return tree(doc.body.firstElementChild!);
}

const CATS = reference.categories;
const SPECS = catalogueSpecs(CATS);
const spec = (id: string): SleeveSpec => SPECS.get(id)!;

describe("the markup comparison", () => {
  it("sees every shape and coordinate (it is not vacuous)", () => {
    const one = parse(CATS[0].svg160);
    const count = (n: Node): number =>
      1 + n.children.reduce((k, c) => k + count(c), 0);
    expect(count(one)).toBeGreaterThan(8);
    expect(parse(CATS[1].svg160)).not.toEqual(one);
    const nudged = CATS[0].svg160.replace(
      /points="(\d+\.\d)/,
      (_m, v) => `points="${(Number(v) + 0.1).toFixed(1)}`,
    );
    expect(nudged).not.toBe(CATS[0].svg160);
    expect(parse(nudged)).not.toEqual(one);
  });
});

describe("sleeve markup matches covers.py", () => {
  it.each(CATS.map((c) => [c.name, c] as const))(
    "%s at 160px and 40px",
    (_n, c) => {
      expect(
        parse(sleeveSvgString(spec(c.id), 160, { defs: "shared" })),
      ).toEqual(parse(c.svg160));
      expect(
        parse(sleeveSvgString(spec(c.id), 40, { defs: "shared" })),
      ).toEqual(parse(c.svg40));
    },
  );

  it.each(Object.entries(reference.edges))(
    "switches the dot screen at 80px and the speckle at 120px (%spx)",
    (size, markup) => {
      expect(
        parse(
          sleeveSvgString(spec(CATS[0].id), Number(size), { defs: "shared" }),
        ),
      ).toEqual(parse(markup));
    },
  );

  it("labels a titled sleeve as an image", () => {
    const got = sleeveSvgString(spec(CATS[0].id), 160, {
      defs: "shared",
      title: "Cover for Emo Rap Heartbreak",
      className: "big",
    });
    expect(parse(got)).toEqual(parse(reference.titled));
  });

  it("prints the shared dot screen and speckle defs", () => {
    expect(parse(SLEEVE_DEFS)).toEqual(parse(reference.screenDefs));
  });
});

describe("sleeveSvgString (standalone, for canvas export)", () => {
  const s = spec(CATS[1].id);
  const standalone = sleeveSvgString(s, 640);

  it("is a well-formed SVG document with its own namespace and size", () => {
    const doc = new DOMParser().parseFromString(standalone, "image/svg+xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    const root = doc.documentElement;
    expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(root.getAttribute("width")).toBe("640");
    expect(root.getAttribute("height")).toBe("640");
  });

  it("carries the defs it references inline", () => {
    const doc = new DOMParser().parseFromString(standalone, "image/svg+xml");
    for (const id of ["rs-dots", "rs-screen", "rs-voids", "rs-grain"]) {
      expect(doc.getElementById(id)).not.toBeNull();
    }
  });

  it("prints the same sleeve as the shared-defs markup", () => {
    const withoutDefs = parse(standalone);
    withoutDefs.children = withoutDefs.children.filter((n) => n.tag !== "defs");
    withoutDefs.attrs = withoutDefs.attrs.filter(([k]) => k !== "xmlns");
    expect(withoutDefs).toEqual(
      parse(sleeveSvgString(s, 640, { defs: "shared" })),
    );
  });

  it("escapes a title", () => {
    const got = sleeveSvgString(s, 40, { title: 'Rock & "Roll" <3' });
    expect(got).toContain('aria-label="Rock &amp; &quot;Roll&quot; &lt;3"');
  });
});

describe("sleeveArt", () => {
  it("lays solid drum B over solid drum A in every motif", () => {
    for (const c of CATS) {
      const { a, b } = sleeveArt(spec(c.id), 160);
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
    }
  });

  it("screens with a flat 42% tint below 80px, where dots would moire", () => {
    const { a } = sleeveArt(spec(CATS[0].id), 40);
    const screened = a.filter((s) =>
      s.attrs.some(([k]) => k === "fill-opacity"),
    );
    expect(screened.length).toBeGreaterThan(0);
    expect(a.some((s) => s.attrs.some(([k]) => k === "mask"))).toBe(false);
  });

  it("adds the speckle only from 120px", () => {
    expect(sleeveArt(spec(CATS[0].id), 119).grain).toBe(false);
    expect(sleeveArt(spec(CATS[0].id), 120).grain).toBe(true);
  });
});
