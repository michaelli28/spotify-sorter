// @vitest-environment node
import { describe, it, expect } from "vitest";
import reference from "@/tests/fixtures/sleeve-reference.json";
import {
  CRATE,
  crateLayout,
  dividerDepth,
  orderBySize,
  recordHairlines,
  tracksPerU,
} from "@/src/components/graphics/crate-geometry";

// The real library: 41 categories, their catalogue numbers and track counts at cutoff 65.
const ENTRIES = reference.categories.map((c, i) => ({
  id: c.id,
  name: c.name,
  catalogueNo: i + 1,
  count: c.tracks,
}));
const BY_SIZE = orderBySize(ENTRIES);
const counts = BY_SIZE.map((e) => e.count);

describe("orderBySize", () => {
  it("stands the largest category at the front, the smallest at the back", () => {
    expect(BY_SIZE[0]).toMatchObject({
      name: "Bedroom Pop Intimacy",
      count: 1442,
      catalogueNo: 2,
    });
    expect(BY_SIZE[40]).toMatchObject({
      name: "Stutter House Rhythmic",
      count: 14,
    });
    expect(BY_SIZE.map((e) => e.catalogueNo).slice(0, 6)).toEqual([
      2, 12, 41, 3, 4, 1,
    ]);
  });

  it("breaks a tie by catalogue number", () => {
    const tied = BY_SIZE.filter((e) => e.count === 51).map((e) => e.name);
    expect(tied).toEqual(["Dubstep Bass Heavy", "Melodic Techno Hypnotic"]);
  });

  it("does not reorder its input", () => {
    const input = [...ENTRIES];
    orderBySize(input);
    expect(input).toEqual(ENTRIES);
  });
});

describe("tracksPerU and dividerDepth", () => {
  it("fits the tracks in front of the back divider into the crate: 1u per 72.06", () => {
    expect(counts.reduce((a, b) => a + b, 0)).toBe(12192);
    expect(tracksPerU(counts)).toBeCloseTo(12178 / 169, 10);
    expect(tracksPerU(counts)).toBeCloseTo(72.06, 2);
  });

  it("is 3.2u of divider card plus the records behind it", () => {
    const perU = tracksPerU(counts);
    expect(dividerDepth(1442, perU)).toBeCloseTo(23.2, 1);
    expect(dividerDepth(14, perU)).toBeCloseTo(3.4, 1);
    expect(dividerDepth(0, perU)).toBe(CRATE.DIVIDER);
  });

  it("draws no record stacks when nothing is placed yet", () => {
    expect(tracksPerU([0, 0, 0])).toBe(0);
    expect(dividerDepth(0, 0)).toBe(3.2);
  });

  it("has room for record stacks up to MAX_DIVIDERS categories, and none past it", () => {
    const layout = (n: number) =>
      crateLayout(Array.from({ length: n }, () => ({ count: 100 })));
    expect(CRATE.MAX_DIVIDERS).toBe(93);
    const full = layout(CRATE.MAX_DIVIDERS);
    expect(full[0].stack.height).toBeGreaterThan(0);
    // Every tab stays inside the figure.
    expect(Math.min(...full.map((d) => d.tab.top))).toBeGreaterThanOrEqual(0);
    expect(tracksPerU(Array(CRATE.MAX_DIVIDERS + 1).fill(100))).toBe(0);
  });

  it("gives a lone category the whole crate", () => {
    const perU = tracksPerU([300]);
    expect(dividerDepth(300, perU)).toBeCloseTo(
      CRATE.DIVIDER + CRATE.FRONT_TOP - CRATE.BACK_TOP,
      6,
    );
  });
});

describe("crateLayout", () => {
  const layout = crateLayout(BY_SIZE);

  it("keeps the order it is given (front to back)", () => {
    expect(layout.map((d) => d.entry.id)).toEqual(BY_SIZE.map((e) => e.id));
  });

  it("stands the front divider at 319u and the back divider at 22u", () => {
    expect(layout[0].top).toBe(CRATE.FRONT_TOP);
    expect(layout[40].top).toBeCloseTo(CRATE.BACK_TOP, 9);
  });

  it("puts each divider's top behind the records of the one in front of it", () => {
    for (let k = 1; k < layout.length; k++) {
      expect(layout[k].top).toBeCloseTo(
        layout[k - 1].top - layout[k - 1].depth,
        9,
      );
    }
  });

  it("narrows dividers further back, in perspective", () => {
    expect(layout[0].x).toBe(CRATE.CARD_X);
    expect(layout[0].width).toBe(CRATE.CARD_W);
    const back = layout[40];
    const inset = (CRATE.FRONT_TOP - back.top) * CRATE.PERSPECTIVE;
    expect(back.x).toBeCloseTo(CRATE.CARD_X + inset, 9);
    expect(back.width).toBeCloseTo(CRATE.CARD_W - 2 * inset, 9);
  });

  it("staggers the tabs across six columns, as in a real bin", () => {
    expect(layout.slice(0, 8).map((d) => d.tab.column)).toEqual([
      0, 1, 2, 3, 4, 5, 0, 1,
    ]);
    const tw = (CRATE.CARD_W - 5 * CRATE.TAB_GAP) / 6;
    expect(layout[0].tab.width).toBeCloseTo(tw, 9);
    // Further back, the columns shrink with the card's perspective.
    const d = layout[3];
    const scale = d.width / CRATE.CARD_W;
    expect(d.tab.left).toBeCloseTo(d.x + 3 * (tw + CRATE.TAB_GAP) * scale, 9);
    expect(d.tab.width).toBeCloseTo(tw * scale, 9);
    expect(layout[3].tab.top).toBe(layout[3].top - CRATE.TAB_H);
  });

  it("never lets two tabs in one column touch", () => {
    for (let k = 0; k + 6 < layout.length; k++) {
      expect(layout[k].tab.top - layout[k + 6].tab.top).toBeGreaterThanOrEqual(
        CRATE.TAB_H,
      );
    }
  });

  it("paints front dividers over back ones, and settles back to front", () => {
    expect(layout[0].z).toBe(41);
    expect(layout[40].z).toBe(1);
    expect(layout[0].settle).toBe(40);
    expect(layout[40].settle).toBe(0);
  });

  it("stands each record stack on its divider's top, inset 5u, depth less the card", () => {
    const d = layout[0];
    expect(d.stack).toEqual({
      x: d.x + 5,
      width: d.width - 10,
      height: d.depth - 0.6,
      y: d.top - (d.depth - 0.6),
    });
  });

  it("gives a divider with no records no stack (just proposed, nothing placed)", () => {
    const empty = crateLayout(BY_SIZE.map((e) => ({ ...e, count: 0 })));
    expect(empty.every((d) => d.stack.height === 0)).toBe(true);
    expect(empty[1].top).toBeCloseTo(CRATE.FRONT_TOP - CRATE.DIVIDER, 9);
  });

  it("can hold a fixed scale while counts change (classify)", () => {
    const fixed = crateLayout(BY_SIZE, { perU: 100 });
    expect(fixed[0].depth).toBeCloseTo(CRATE.DIVIDER + 1442 / 100, 9);
  });
});

describe("recordHairlines", () => {
  it("prints one record top every 2.7u, starting 1.7u down", () => {
    expect(recordHairlines(10)).toEqual(
      [1.7, 4.4, 7.1, 9.8].map((y) => expect.closeTo(y, 9)),
    );
  });

  it("grows with the stack: the depth is the count", () => {
    const perU = tracksPerU(counts);
    const front = recordHairlines(dividerDepth(1442, perU) - 0.6).length;
    const back = recordHairlines(dividerDepth(14, perU) - 0.6).length;
    expect(front).toBe(8);
    expect(back).toBe(1);
  });

  it("prints none for an empty stack", () => {
    expect(recordHairlines(0)).toEqual([]);
  });
});
