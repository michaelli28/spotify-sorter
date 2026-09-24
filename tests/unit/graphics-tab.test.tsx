import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Tab,
  TemperatureKey,
  TemperatureLegend,
} from "@/src/components/graphics/Tab";
import { tabTint } from "@/src/lib/sleeves/inks";
import {
  TEMPERATURES,
  TEMPERATURE_MEANINGS,
} from "@/src/lib/sleeves/temperature";

const fill = (el: HTMLElement) => el.style.getPropertyValue("--tab-fill");

describe("<Tab>", () => {
  it("prints the catalogue number, two digits, on its temperature's tint", () => {
    render(
      <Tab catalogueNo={4} temperature="haze" size="review" data-testid="t" />,
    );
    const tab = screen.getByTestId("t");
    expect(tab).toHaveTextContent(/^04$/);
    expect(fill(tab)).toBe(tabTint("haze"));
    expect(tab.tagName).toBe("SPAN");
  });

  it("is 16px tall in the review bin and 18u in the crate", () => {
    const { rerender } = render(
      <Tab catalogueNo={1} temperature="dusk" size="review" data-testid="t" />,
    );
    expect(screen.getByTestId("t").className).toContain("h-4");
    rerender(
      <Tab catalogueNo={1} temperature="dusk" size="crate" data-testid="t" />,
    );
    expect(screen.getByTestId("t").style.height).toBe("calc(18 * var(--u))");
  });

  it("prints reversed and lifted when open or current", () => {
    render(
      <Tab
        catalogueNo={2}
        temperature="glow"
        size="review"
        reversed
        data-testid="t"
      />,
    );
    const tab = screen.getByTestId("t");
    expect(tab).toHaveAttribute("data-reversed", "true");
    expect(tab.className).toContain("bg-[var(--tab-pressed)]");
    expect(tab.className).not.toContain("bg-[var(--tab-fill)]");
  });

  it("prints a dashed blank tab without a temperature", () => {
    render(
      <Tab catalogueNo={42} temperature={null} size="review" data-testid="t" />,
    );
    const tab = screen.getByTestId("t");
    expect(tab).toHaveTextContent("42");
    expect(tab.className).toContain("border-dashed");
    expect(fill(tab)).toBe("");
    // A slot on the page's own well, not a printed tab: page ink, which flips
    // with the stock (the navy tab ink vanished on the evening stock).
    expect(tab.className).toContain("text-[var(--ink-2)]");
    expect(tab.className).not.toContain("text-[var(--tab-ink)]");
  });

  // /review's proposing bin: a catalogue number belongs to a real category.
  it("prints an unnumbered blank tab", () => {
    render(
      <Tab
        catalogueNo={null}
        temperature={null}
        size="review"
        data-testid="t"
      />,
    );
    const tab = screen.getByTestId("t");
    expect(tab).toBeEmptyDOMElement();
    expect(tab.className).toContain("border-dashed");
    expect(tab.className).toContain("min-w-10");
  });

  // Classify's crate prints a number and a live count in one tab.
  it("prints its children in place of the number", () => {
    render(
      <Tab catalogueNo={7} temperature="haze" size="crate" data-testid="t">
        <span>07</span>
        <span>1,442</span>
      </Tab>,
    );
    const tab = screen.getByTestId("t");
    expect(tab).toHaveTextContent(/^071,442$/);
    expect(fill(tab)).toBe(tabTint("haze"));
  });
});

describe("<TemperatureLegend>", () => {
  it("says what each colour means, in the key's order, with the page's note", () => {
    render(
      <TemperatureLegend id="legend">
        Guessed from each category&apos;s name.
      </TemperatureLegend>,
    );
    const legend = screen.getByRole("region", {
      name: "What the tab colours mean",
    });
    const terms = within(legend).getAllByRole("term");
    expect(terms.map((t) => t.textContent)).toEqual([...TEMPERATURES]);
    for (const t of TEMPERATURES) {
      expect(
        within(legend).getByText(TEMPERATURE_MEANINGS[t]),
      ).toBeInTheDocument();
    }
    expect(
      within(legend).getByText("Guessed from each category's name."),
    ).toBeInTheDocument();
  });

  it("has a plain meaning for every temperature", () => {
    expect(Object.keys(TEMPERATURE_MEANINGS)).toEqual([...TEMPERATURES]);
    for (const t of TEMPERATURES) {
      expect(TEMPERATURE_MEANINGS[t]).toMatch(/^[A-Z].+\.$/);
    }
  });
});

describe("<TemperatureKey>", () => {
  it("offers what the colours mean only when the page can show it", async () => {
    const onExplain = vi.fn();
    const { rerender } = render(<TemperatureKey />);
    expect(screen.queryByRole("button", { name: "what they mean" })).toBeNull();
    rerender(
      <TemperatureKey
        explained={false}
        explainId="legend"
        onExplain={onExplain}
      />,
    );
    const button = screen.getByRole("button", { name: "what they mean" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "legend");
    await userEvent.click(button);
    expect(onExplain).toHaveBeenCalledOnce();
    rerender(
      <TemperatureKey explained explainId="legend" onExplain={onExplain} />,
    );
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("names the four temperatures in order, each on its tab tint", () => {
    render(<TemperatureKey />);
    const list = screen.getByRole("list", { name: "Tab colours" });
    const items = [...list.querySelectorAll("li")];
    expect(items.map((li) => li.textContent)).toEqual([
      "dusk",
      "charge",
      "glow",
      "haze",
    ]);
    const swatch = items[3].querySelector("i") as HTMLElement;
    expect(fill(swatch)).toBe(tabTint("haze"));
  });
});
