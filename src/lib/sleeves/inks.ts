// Port of covers.py's inks. Riso-ink approximations (OKLCH), all inside sRGB.
// Orange is absent: it is the action ink and never prints on a sleeve.
import type { Temperature } from "./temperature";

export const INKS = {
  yellow: "oklch(0.915 0.175 103)",
  pink: "oklch(0.68 0.215 355)",
  red: "oklch(0.64 0.185 20)",
  aqua: "oklch(0.78 0.10 222)",
  teal: "oklch(0.555 0.090 200)",
  violet: "oklch(0.62 0.13 300)",
  mblue: "oklch(0.48 0.14 264)",
  fblue: "oklch(0.44 0.09 264)",
  burgundy: "oklch(0.48 0.10 345)",
} as const;
export type InkName = keyof typeof INKS;

/** Drum A (light, printed first): one ink per temperature, so a tab's colour means something. */
export const TEMP_INK: Readonly<Record<Temperature, InkName>> = {
  dusk: "violet",
  charge: "pink",
  glow: "yellow",
  haze: "aqua",
};

/** Drum B (dark, overprinted with multiply): four per temperature, all darker than its ink A. */
export const B_INKS: Readonly<
  Record<Temperature, readonly [InkName, InkName, InkName, InkName]>
> = {
  dusk: ["fblue", "burgundy", "mblue", "teal"],
  charge: ["mblue", "fblue", "violet", "teal"],
  glow: ["red", "pink", "burgundy", "teal"],
  haze: ["mblue", "violet", "teal", "pink"],
};

/** A sleeve's own stock: it stays light on the evening stock too. */
export const PAPER = "oklch(0.978 0.010 90)";

/** A divider tab's fill: the design system's `--t-*` token (ink A at 42% on tab stock, in OKLab). */
export function tabTint(t: Temperature): string {
  return `var(--t-${t})`;
}
