import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The tokens live in CSS, which jsdom can't lay out, so these read the file.
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** The body of the first block whose header matches, braces balanced. */
function block(header: RegExp): string {
  const m = header.exec(css);
  if (!m) throw new Error(`no block ${header}`);
  let depth = 0;
  const start = css.indexOf("{", m.index);
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start + 1, i);
  }
  throw new Error(`unclosed block ${header}`);
}

// Prettier writes 0.500 as 0.5, so numbers compare by value, not spelling.
const norm = (s: string) =>
  s.replace(/\d*\.\d+/g, (n) => String(Number(n))).replace(/\s+/g, " ").trim();

function value(body: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|[\\s;{])${name}\\s*:\\s*([^;]+);`).exec(body);
  return m ? norm(m[1]) : undefined;
}

const day = block(/^:root\s*\{/m);
const night = block(/@media \(prefers-color-scheme: dark\)/);

// Brief §1, day stock.
const DAY: Record<string, string> = {
  "--paper": "oklch(0.958 0.017 88)",
  "--paper-deep": "oklch(0.922 0.026 84)",
  "--card": "oklch(0.978 0.010 90)",
  "--ink": "oklch(0.285 0.075 266)",
  "--ink-2": "oklch(0.435 0.060 266)",
  "--ink-3": "oklch(0.500 0.045 266)",
  "--rule": "oklch(0.815 0.030 262)",
  "--rule-strong": "oklch(0.600 0.050 264)",
  "--tint": "oklch(0.905 0.030 264)",
  "--accent": "oklch(0.735 0.165 52)",
  "--accent-press": "oklch(0.690 0.170 48)",
  "--success": "oklch(0.500 0.085 195)",
  "--danger": "oklch(0.500 0.170 22)",
  "--warn": "oklch(0.850 0.140 88)",
  "--warn-ink": "oklch(0.500 0.100 72)",
  "--kraft": "oklch(0.845 0.045 72)",
  "--hollow": "oklch(0.560 0.035 70)",
  "--rec-edge": "oklch(0.700 0.040 264)",
  "--on-accent": "oklch(0.285 0.075 266)",
  "--scrim": "oklch(0.285 0.075 266 / 0.48)",
};

// Brief §1, evening stock.
const NIGHT: Record<string, string> = {
  "--paper": "oklch(0.235 0.068 266)",
  "--paper-deep": "oklch(0.200 0.058 266)",
  "--card": "oklch(0.275 0.074 266)",
  "--tint": "oklch(0.345 0.085 266)",
  "--ink": "oklch(0.925 0.024 86)",
  "--ink-2": "oklch(0.815 0.030 84)",
  "--ink-3": "oklch(0.735 0.032 82)",
  "--rule": "oklch(0.390 0.060 266)",
  "--rule-strong": "oklch(0.600 0.055 266)",
  "--accent": "oklch(0.735 0.155 52)",
  "--accent-press": "oklch(0.690 0.160 48)",
  "--danger": "oklch(0.745 0.135 24)",
  "--success": "oklch(0.790 0.085 192)",
  "--warn-ink": "oklch(0.860 0.110 88)",
  "--kraft": "oklch(0.500 0.055 66)",
  "--hollow": "oklch(0.175 0.030 62)",
  "--scrim": "oklch(0.130 0.040 266 / 0.66)",
  "--weight-body": "370",
};

const CJK =
  '"Hiragino Sans", "PingFang SC", "Noto Sans CJK JP", "Noto Sans CJK SC", sans-serif';

describe("globals.css tokens", () => {
  it.each(Object.entries(DAY))("prints %s on the day stock", (name, v) => {
    expect(value(day, name)).toBe(norm(v));
  });

  it.each(Object.entries(NIGHT))(
    "reprints %s on the evening stock",
    (name, v) => {
      expect(value(night, name)).toBe(norm(v));
    },
  );

  it("switches the browser's own controls with the stock", () => {
    expect(value(day, "color-scheme")).toBe("light");
    expect(value(night, "color-scheme")).toBe("dark");
  });

  // Printed objects keep their own stock at night (brief §1).
  it("leaves the label on orange and the tab tints alone at night", () => {
    for (const name of [
      "--on-accent",
      "--tab-stock",
      "--tab-ink",
      "--t-dusk",
      "--t-haze",
    ])
      expect(value(night, name)).toBeUndefined();
    expect(value(day, "--riso-aqua")).toBe(norm("oklch(0.78 0.10 222)"));
    expect(value(day, "--t-haze")).toBe(
      "color-mix(in oklab, var(--riso-aqua) 42%, var(--tab-stock))",
    );
  });

  it("ends every font stack with the CJK fallback (spec §4.2)", () => {
    for (const name of ["--font-display", "--font-body", "--font-mono"]) {
      const stack = value(css, name);
      expect(stack, name).toBeDefined();
      expect(stack!.endsWith(CJK), `${name}: ${stack}`).toBe(true);
    }
  });

  // Tailwind resolves max-w-md from --spacing-md before --container-md, so a
  // spacing token named md would shrink every max-w-md from 28rem to 24px.
  it("never names a spacing token after a t-shirt size", () => {
    expect(css).not.toMatch(/--spacing-(3xs|2xs|xs|sm|md|lg|xl|2xl|3xl)\s*:/);
    expect(value(day, "--space-md")).toBe("24px");
  });

  // Every page migrated, so the pre-redesign aliases are gone, and nothing
  // may read one again: an unset var() prints nothing, silently.
  it("has no legacy alias left, and no source reads one", () => {
    const LEGACY =
      /--color-(?:bg|text|border)-|--color-accent-(?:strong|soft)\b|var\(--color-(?:accent|success|danger|warning)\)|--ease-out-expo|ease-out-expo\b/;
    expect(css).not.toMatch(LEGACY);
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory()
          ? files(path)
          : /\.(tsx?|css)$/.test(name)
            ? [path]
            : [];
      });
    const readers = ["app", "src"]
      .flatMap((d) => files(join(process.cwd(), d)))
      .filter((f) => LEGACY.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f));
    expect(readers).toEqual([]);
  });

  // /setup's ground. A whole page of night kraft is mud, so the evening
  // counter is the stock's well.
  it("sets the counter in kraft by day and the well at night", () => {
    expect(value(day, "--counter")).toBe("var(--kraft)");
    expect(value(night, "--counter")).toBe("var(--paper-deep)");
    expect(value(css, "--color-counter")).toBe("var(--counter)");
  });

  // The open tab prints in the ink on both stocks. At night paper-deep was
  // its own divider card's fill (1.0:1): it read as a hole in the crate.
  it("prints the open tab in the stock's ink, its number in the deep navy", () => {
    expect(value(day, "--tab-pressed")).toBe(value(day, "--ink"));
    expect(value(night, "--tab-pressed")).toBe(value(night, "--ink"));
    expect(value(night, "--tab-pressed")).not.toBe(value(night, "--paper-deep"));
    expect(value(night, "--tab-pressed-ink")).toBe(value(night, "--paper-deep"));
  });

  // Brief §5: 93px desktop, 73px phone whatever the strip holds, so one
  // token serves the strip, scroll padding and pages' sticky offsets.
  it("sizes the top strip with one token per breakpoint", () => {
    expect(value(day, "--strip-h")).toBe("93px");
    const phone = block(/@media \(width < 45\.0625rem\)/);
    expect(value(phone, "--strip-h")).toBe("73px");
    expect(value(css, "--spacing-strip")).toBe("var(--strip-h)");
  });

  // WCAG 2.2 SC 2.4.11: focus that scrolls under the pinned strip is hidden.
  it("scrolls keyboard focus clear of the strip", () => {
    const rule = block(/html:has\(\[data-action-bar\], \[data-action-strip-claim\]\)\s*\{/);
    expect(value(rule, "scroll-padding-top")).toBe(
      "calc(var(--strip-h) + var(--space-2xs))",
    );
  });

  // The bar portals in after hydration; the server's claim holds its room.
  it("holds the strip's room while the bar is only claimed", () => {
    const rule = block(
      /html:has\(\[data-action-strip-claim\]\) \[data-action-strip-slot\]\s*\{/,
    );
    expect(value(rule, "min-height")).toBe("var(--strip-h)");
  });

  it("draws the paper tooth as one background image, not a filter per element", () => {
    expect(value(day, "--grain")).toMatch(/^url\("data:image\/svg\+xml/);
    expect(css).not.toMatch(/(^|[\s;{])filter\s*:/);
  });
});
