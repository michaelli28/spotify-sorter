import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import reference from "@/tests/fixtures/sleeve-reference.json";
import { Sleeve, registrationShift } from "@/src/components/graphics/Sleeve";
import { SleeveDefs } from "@/src/components/graphics/SleeveDefs";
import { PlainSleeve } from "@/src/components/graphics/PlainSleeve";
import { catalogueSpecs, type SleeveSpec } from "@/src/lib/sleeves/spec";
import { sleeveSvgString } from "@/src/lib/sleeves/svg";

const CATS = reference.categories;
const SPECS = catalogueSpecs(CATS);
const spec = (i: number): SleeveSpec => SPECS.get(CATS[i].id)!;

type Leaf = [string, [string, string][]];
const SHAPES = "circle, rect, polygon, path";

/** The printed shapes, in document order, with their attributes. */
function leaves(root: Element): Leaf[] {
  return [...root.querySelectorAll(SHAPES)].map((el) => [
    el.tagName.toLowerCase(),
    [...el.attributes]
      .map((a): [string, string] => [a.name, a.value])
      .sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

function stringLeaves(markup: string): Leaf[] {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  return leaves(doc.body.firstElementChild!);
}

describe("<Sleeve>", () => {
  it.each([0, 1, 4, 11, 27, 40])(
    "prints the same shapes as sleeveSvgString (category %i)",
    (i) => {
      for (const size of [40, 160]) {
        const { container, unmount } = render(
          <Sleeve spec={spec(i)} size={size} />,
        );
        const svg = container.querySelector("svg")!;
        expect(leaves(svg)).toEqual(
          stringLeaves(sleeveSvgString(spec(i), size, { defs: "shared" })),
        );
        unmount();
      }
    },
  );

  it("rotates the print and offsets drum B by its misregistration", () => {
    const s = spec(1);
    const { container } = render(<Sleeve spec={s} size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg.getAttribute("width")).toBe("40");
    expect(
      svg.querySelector(`g[transform="rotate(${s.turn * 90} 50 50)"]`),
    ).not.toBeNull();
    const drumB = svg.querySelector(
      'g[transform^="translate("]',
    ) as SVGGElement;
    expect(drumB.getAttribute("transform")).toBe(`translate(${s.dx} ${s.dy})`);
    expect(drumB.style.mixBlendMode).toBe("multiply");
  });

  it("masks both drums with the speckle only from 120px", () => {
    const big = render(<Sleeve spec={spec(0)} size={160} />);
    expect(
      big.container.querySelectorAll('g[mask="url(#rs-grain)"]'),
    ).toHaveLength(2);
    big.unmount();
    const small = render(<Sleeve spec={spec(0)} size={96} />);
    expect(
      small.container.querySelectorAll('g[mask="url(#rs-grain)"]'),
    ).toHaveLength(0);
  });

  it("is an image with a label when titled, hidden otherwise", () => {
    const { container, rerender } = render(<Sleeve spec={spec(0)} size={40} />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    rerender(
      <Sleeve spec={spec(0)} size={40} title="Cover for Emo Rap Heartbreak" />,
    );
    expect(
      screen.getByRole("img", { name: "Cover for Emo Rap Heartbreak" }),
    ).toBeInTheDocument();
  });

  it("marks temperature, motif and inks for pages and tests", () => {
    const s = spec(0);
    const { container } = render(<Sleeve spec={s} size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg.dataset.temp).toBe(s.temp);
    expect(svg.dataset.motif).toBe(s.motif);
    expect(svg.dataset.inks).toBe(`${s.inkA}+${s.inkB}`);
  });

  it("finds its spec from a category and its catalogue", () => {
    const { container } = render(
      <Sleeve category={CATS[5]} catalogue={CATS} size={40} />,
    );
    expect(leaves(container.querySelector("svg")!)).toEqual(
      stringLeaves(sleeveSvgString(spec(5), 40, { defs: "shared" })),
    );
  });

  it("reprints ink A when the category carries an override", () => {
    const overridden = { ...CATS[0], temperature: "haze" as const };
    const catalogue = [overridden, ...CATS.slice(1)];
    const { container } = render(
      <Sleeve category={overridden} catalogue={catalogue} size={40} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.dataset.temp).toBe("haze");
    expect(svg.dataset.inks?.startsWith("aqua+")).toBe(true);
  });

  it("prints the sheet's unsaved draft even against the saved catalogue", () => {
    const draft = { ...CATS[0], temperature: "glow" as const };
    const { container, rerender } = render(
      <Sleeve category={draft} catalogue={CATS} size={40} />,
    );
    const svg = () => container.querySelector("svg")!;
    expect(svg().dataset.temp).toBe("glow");
    expect(svg().dataset.inks?.startsWith("yellow+")).toBe(true);
    // Clearing the override ("Auto (guess)") prints the saved sleeve again.
    rerender(<Sleeve category={{ ...CATS[0] }} catalogue={CATS} size={40} />);
    expect(svg().dataset.inks).toBe(`${spec(0).inkA}+${spec(0).inkB}`);
  });

  it("hands drum B's motion to a group inside its misregistration", () => {
    const s = spec(2);
    const shift = registrationShift(s, 4);
    const { container } = render(
      <Sleeve
        spec={s}
        size={160}
        drumB={{ initial: shift, animate: { x: 0, y: 0 } }}
      />,
    );
    const offset = container.querySelector('g[transform^="translate("]')!;
    const moving = offset.firstElementChild as SVGGElement;
    expect(moving.tagName.toLowerCase()).toBe("g");
    expect(moving.style.transform).toContain(`${shift.x}px`);
    // Drum A is untouched.
    const drumA = container.querySelector(`g[transform^="rotate("]`)!
      .firstElementChild as SVGGElement;
    expect(drumA.style.transform).toBe("");
  });
});

describe("registrationShift", () => {
  it("moves drum B to `factor` times its offset, relative to where it rests", () => {
    const s = { ...spec(0), dx: 1.6, dy: -2.4 };
    expect(registrationShift(s, 1)).toEqual({ x: 0, y: 0 });
    expect(registrationShift(s, 4)).toEqual({ x: 1.6 * 3, y: -2.4 * 3 });
    expect(registrationShift(s, 0)).toEqual({ x: -1.6, y: 2.4 });
  });
});

describe("<SleeveDefs>", () => {
  it("renders the shared dot screen and speckle once, hidden", () => {
    const { container } = render(<SleeveDefs />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("width")).toBe("0");
    for (const id of ["rs-dots", "rs-screen", "rs-voids", "rs-grain"]) {
      expect(container.querySelectorAll(`#${id}`)).toHaveLength(1);
    }
    expect(container.querySelectorAll("#rs-voids circle")).toHaveLength(46);
  });
});

describe("<PlainSleeve>", () => {
  it("is a flat square that says there is no cover art", () => {
    render(<PlainSleeve size={44} />);
    const img = screen.getByRole("img", { name: "No cover art" });
    expect(img).toHaveAttribute("width", "44");
    expect(img).toHaveAttribute("height", "44");
    // No rings and no ink: it never reads as a groove sleeve or the brand mark.
    expect(img.querySelectorAll("circle, path, polygon")).toHaveLength(0);
  });
});
