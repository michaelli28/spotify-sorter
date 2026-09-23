import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CrateBack,
  CrateDivider,
  CrateFigure,
  CrateLayer,
  CrateSlats,
  CrateTab,
  u,
} from "@/src/components/graphics/Crate";
import {
  CRATE,
  crateLayout,
  orderBySize,
  recordHairlines,
} from "@/src/components/graphics/crate-geometry";
import { Tab, TemperatureKey } from "@/src/components/graphics/Tab";
import { tabTint } from "@/src/lib/sleeves/inks";

const ENTRIES = orderBySize([
  { id: "a", catalogueNo: 1, count: 618, temperature: "dusk" as const },
  { id: "b", catalogueNo: 2, count: 1442, temperature: "haze" as const },
  { id: "c", catalogueNo: 3, count: 14, temperature: "charge" as const },
]);
const LAYOUT = crateLayout(ENTRIES);

function inSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>).container;
}

describe("u()", () => {
  it("writes a length in bin units", () => {
    expect(u(18)).toBe("calc(18 * var(--u))");
  });
});

describe("<CrateFigure>", () => {
  it("scales 440u to its width and stands 578u tall", () => {
    render(
      <CrateFigure role="group" aria-label="Flip through categories">
        x
      </CrateFigure>,
    );
    const bin = screen.getByRole("group", { name: "Flip through categories" });
    expect(bin.style.getPropertyValue("--u")).toBe("calc(100cqw / 440)");
    expect(bin.style.height).toBe(u(CRATE.HEIGHT));
    // Tailwind's @container: container-type inline-size, so 100cqw is the figure's width.
    expect(bin.parentElement).toHaveClass("@container");
  });

  // Its sleeve (z 60) and slats (z 70) must stay inside the figure: they beat
  // the z-30 top strip and a dialog's z-50 on the page (spec §7.4).
  it("keeps its layers to itself", () => {
    render(
      <CrateFigure role="group" aria-label="Crate">
        x
      </CrateFigure>,
    );
    expect(
      screen.getByRole("group", { name: "Crate" }).parentElement,
    ).toHaveClass("isolate");
  });
});

describe("<CrateLayer> and <CrateBack>", () => {
  it("draws in bin units over the whole figure", () => {
    const { container } = render(
      <CrateLayer>
        <CrateBack />
      </CrateLayer>,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 440 578");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("path.crate-edge")!.getAttribute("d")).toBe(
      "M0 500 L23.5 13 H416.5 L440 500",
    );
  });
});

describe("<CrateDivider>", () => {
  it("stands its card from its top down to the crate floor", () => {
    const d = LAYOUT[1];
    const svg = inSvg(<CrateDivider divider={d} temperature="dusk" />);
    const card = svg.querySelector("rect.crate-card")!;
    expect(Number(card.getAttribute("y"))).toBe(d.top);
    expect(Number(card.getAttribute("height"))).toBeCloseTo(
      CRATE.HEIGHT - 2 - d.top,
      9,
    );
    expect(Number(card.getAttribute("x"))).toBe(d.x);
  });

  it("draws its records as a stack tinted with its temperature, one hairline per record top", () => {
    const d = LAYOUT[0];
    const svg = inSvg(<CrateDivider divider={d} temperature="haze" />);
    const stack = svg.querySelector("rect.crate-stack") as SVGRectElement;
    expect(stack.style.fill).toBe(tabTint("haze"));
    const lines = svg.querySelector("path.crate-hairlines")!.getAttribute("d")!;
    expect(lines.match(/M/g)).toHaveLength(
      recordHairlines(d.stack.height).length,
    );
  });

  it("outlines the current divider's stack in ink", () => {
    const svg = inSvg(
      <CrateDivider divider={LAYOUT[0]} temperature="haze" current />,
    );
    expect(
      svg.querySelector("path.crate-stack-edge")!.getAttribute("stroke"),
    ).toBe("var(--ink)");
    expect(
      svg.querySelector("path.crate-hairlines")!.getAttribute("stroke"),
    ).toBe("var(--ink-2)");
  });

  it("draws no stack for a divider with no records", () => {
    const [empty] = crateLayout([{ count: 0 }]);
    const svg = inSvg(<CrateDivider divider={empty} temperature="glow" />);
    expect(svg.querySelector("rect.crate-card")).not.toBeNull();
    expect(svg.querySelector("rect.crate-stack")).toBeNull();
  });
});

describe("<CrateTab>", () => {
  it("places its content over its divider's tab slot", () => {
    const d = LAYOUT[2];
    render(
      <CrateTab divider={d} data-testid="slot">
        <Tab catalogueNo={3} temperature="charge" size="crate" />
      </CrateTab>,
    );
    const slot = screen.getByTestId("slot");
    expect(slot.style.left).toBe(u(d.tab.left));
    expect(slot.style.top).toBe(u(d.tab.top));
    expect(slot.style.width).toBe(u(d.tab.width));
  });

  it("can hold the crate's button (home) around a Tab", async () => {
    const onClick = vi.fn();
    render(
      <CrateTab divider={LAYOUT[0]}>
        <button
          type="button"
          aria-pressed
          aria-label="02 Bedroom Pop Intimacy, 1,442 tracks"
          onClick={onClick}
        >
          <Tab catalogueNo={2} temperature="haze" size="crate" reversed />
        </button>
      </CrateTab>,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "02 Bedroom Pop Intimacy, 1,442 tracks",
      }),
    );
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("<CrateSlats>", () => {
  it("stencils its children (the key) on the lower slat, over everything", () => {
    render(
      <CrateSlats>
        <TemperatureKey />
      </CrateSlats>,
    );
    const key = screen.getByRole("list", { name: "Tab colours" });
    const slat = key.closest("[data-slat]") as HTMLElement;
    expect(slat.dataset.slat).toBe("2");
    expect(slat.style.top).toBe(
      u(CRATE.SLAT_1 + CRATE.SLAT_H + CRATE.SLAT_GAP),
    );
  });
});
