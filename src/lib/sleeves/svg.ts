// Port of covers.py's cover_svg and SCREEN_DEFS, as strings: the canvas export
// (sleeveToJpeg) and static pages. In React, use <Sleeve> and <SleeveDefs>.
import { fmt } from "./format";
import { sleeveArt, speckle, type Shape } from "./geometry";
import { PAPER } from "./inks";
import type { SleeveSpec } from "./spec";

const esc = (v: string): string =>
  v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function shapeMarkup(s: Shape): string {
  return `<${s.tag}${s.attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}/>`;
}

// The masks' white and black are luminance values, never painted.
const DEFS =
  "<defs>" +
  '<pattern id="rs-dots" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">' +
  '<circle cx="1.5" cy="1.5" r="0.95" fill="white"/></pattern>' +
  '<mask id="rs-screen" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">' +
  '<rect x="-50" y="-50" width="200" height="200" fill="url(#rs-dots)"/></mask>' +
  '<pattern id="rs-voids" width="23" height="23" patternUnits="userSpaceOnUse" patternTransform="rotate(7)">' +
  '<rect width="23" height="23" fill="white"/>' +
  speckle().map(shapeMarkup).join("") +
  "</pattern>" +
  '<mask id="rs-grain" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">' +
  '<rect x="-50" y="-50" width="200" height="200" fill="url(#rs-voids)"/></mask>' +
  "</defs>";

/** The dot screen and ink speckle every sleeve references. Exactly one copy per document. */
export const SLEEVE_DEFS =
  '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
  DEFS +
  "</svg>";

/** SLEEVE_DEFS without its wrapper, for <SleeveDefs>. */
export const SLEEVE_DEFS_INNER = DEFS;

export interface SleeveSvgOptions {
  /** "inline" (default): a standalone document. "shared": references one SLEEVE_DEFS on the page. */
  defs?: "inline" | "shared";
  /** role="img" with this label; without it the sleeve is aria-hidden. */
  title?: string;
  className?: string;
}

/** One sleeve as SVG markup, `size` px square. Standalone by default (canvas export). */
export function sleeveSvgString(
  spec: SleeveSpec,
  size: number,
  opts: SleeveSvgOptions = {},
): string {
  const { defs = "inline", title, className = "cover" } = opts;
  const { a, b, grain } = sleeveArt(spec, size);
  const g = grain ? ' mask="url(#rs-grain)"' : "";
  const label = title
    ? `role="img" aria-label="${esc(title)}"`
    : 'aria-hidden="true"';
  const ns = defs === "inline" ? 'xmlns="http://www.w3.org/2000/svg" ' : "";
  return (
    `<svg ${ns}class="${esc(className)}" viewBox="0 0 100 100" width="${size}" height="${size}" ${label} ` +
    `data-temp="${spec.temp}" data-motif="${spec.motif}" data-inks="${spec.inkA}+${spec.inkB}">` +
    (defs === "inline" ? DEFS : "") +
    `<rect x="-10" y="-10" width="120" height="120" fill="${PAPER}"/>` +
    `<g transform="rotate(${spec.turn * 90} 50 50)">` +
    `<g${g}>${a.map(shapeMarkup).join("")}</g>` +
    `<g style="mix-blend-mode:multiply" transform="translate(${fmt(spec.dx)} ${fmt(spec.dy)})">` +
    `<g${g}>${b.map(shapeMarkup).join("")}</g></g>` +
    "</g></svg>"
  );
}
