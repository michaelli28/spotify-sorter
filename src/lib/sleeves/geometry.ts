// Port of covers.py's _art and _speckle: every position and size inside a motif,
// in a 100x100 box. Shapes are data, so the string renderer (svg.ts) and the
// React <Sleeve> print the same sleeve from one source.
import { fmt, pyFixed } from "./format";
import { mulberry32 } from "./hash";
import { INKS } from "./inks";
import type { SleeveSpec } from "./spec";

/** Dot screen from here up; a flat 42% tint below, where 1px dots moire. */
export const SCREEN_MIN_PX = 80;
/** Ink speckle (paper showing through a starved drum) from here up. */
export const GRAIN_MIN_PX = 120;

export type Attr = readonly [name: string, value: string];
export interface Shape {
  tag: "circle" | "rect" | "polygon" | "path";
  attrs: readonly Attr[];
}

const shape = (tag: Shape["tag"], ...attrs: (Attr | null)[]): Shape => ({
  tag,
  attrs: attrs.filter((a): a is Attr => a !== null),
});

/**
 * Drum A and drum B for one sleeve. Every motif lays solid B over solid A somewhere,
 * so the third (overprint) colour always prints, not only where B crosses the dot screen.
 */
export function sleeveArt(
  spec: SleeveSpec,
  size: number,
): { a: Shape[]; b: Shape[]; grain: boolean } {
  const rand = mulberry32((spec.seed ^ 0x9e3779b9) >>> 0);
  const screen: Attr =
    size >= SCREEN_MIN_PX
      ? ["mask", "url(#rs-screen)"]
      : ["fill-opacity", "0.42"];
  const A = INKS[spec.inkA];
  const B = INKS[spec.inkB];
  const a: Shape[] = [];
  const b: Shape[] = [];

  switch (spec.motif) {
    case "groove": {
      // A record from above: disc in A, grooves and centre label in B.
      const cx = 40 + rand() * 20;
      const cy = 40 + rand() * 20;
      a.push(
        shape(
          "circle",
          ["cx", fmt(cx)],
          ["cy", fmt(cy)],
          ["r", "44"],
          ["fill", A],
        ),
      );
      a.push(
        shape(
          "rect",
          ["x", "0"],
          ["y", "0"],
          ["width", "100"],
          ["height", "100"],
          ["fill", A],
          screen,
        ),
      );
      for (let rr = 16; rr < 44; rr += 7) {
        b.push(
          shape(
            "circle",
            ["cx", fmt(cx)],
            ["cy", fmt(cy)],
            ["r", String(rr)],
            ["fill", "none"],
            ["stroke", B],
            ["stroke-width", "1.6"],
          ),
        );
      }
      b.push(
        shape(
          "circle",
          ["cx", fmt(cx)],
          ["cy", fmt(cy)],
          ["r", fmt(8 + rand() * 3)],
          ["fill", B],
        ),
      );
      break;
    }
    case "split": {
      // Solid A triangle; the B quarter-disc's radius always passes the diagonal (70.7), so they overlap.
      a.push(shape("polygon", ["points", "0,0 100,0 0,100"], ["fill", A]));
      a.push(
        shape(
          "polygon",
          ["points", "100,0 100,100 0,100"],
          ["fill", A],
          screen,
        ),
      );
      const r = 78 + rand() * 12;
      b.push(
        shape(
          "path",
          [
            "d",
            `M100 100 L${fmt(100 - r)} 100 A${fmt(r)} ${fmt(r)} 0 0 1 100 ${fmt(100 - r)} Z`,
          ],
          ["fill", B],
        ),
      );
      const cx = 22 + rand() * 12;
      const cy = 22 + rand() * 12;
      b.push(
        shape(
          "circle",
          ["cx", fmt(cx)],
          ["cy", fmt(cy)],
          ["r", fmt(6 + rand() * 4)],
          ["fill", B],
        ),
      );
      break;
    }
    case "sleeves": {
      // Three sleeves dropped on a counter: A, B, A-screened, each overlapping the next.
      for (let i = 0; i < 3; i++) {
        const w = 46 + rand() * 12;
        const x = 8 + i * 16 + rand() * 5;
        const y = 10 + i * 14 + rand() * 5;
        const rot = (rand() - 0.5) * 16;
        const part = shape(
          "rect",
          ["x", fmt(x)],
          ["y", fmt(y)],
          ["width", fmt(w)],
          ["height", fmt(w)],
          ["fill", i !== 1 ? A : B],
          i === 2 ? screen : null,
          [
            "transform",
            `rotate(${fmt(rot)} ${fmt(x + w / 2)} ${fmt(y + w / 2)})`,
          ],
        );
        (i === 1 ? b : a).push(part);
      }
      break;
    }
    case "waves": {
      // A sound, not a measurement: three B strokes, the middle one always crossing a solid A disc.
      a.push(
        shape(
          "rect",
          ["x", "0"],
          ["y", "0"],
          ["width", "100"],
          ["height", "100"],
          ["fill", A],
          screen,
        ),
      );
      const amp = 5 + rand() * 4;
      const wl = 30 + rand() * 12;
      const sw = 5 + rand() * 2.5;
      const y0 = 44 + rand() * 8;
      const r = 16 + rand() * 7;
      const cx = 24 + rand() * 52;
      a.push(
        shape(
          "circle",
          ["cx", fmt(cx)],
          ["cy", fmt(y0 + sw + 8 - r * 0.25)],
          ["r", fmt(r)],
          ["fill", A],
        ),
      );
      for (let k = 0; k < 3; k++) {
        const y = y0 + k * (sw + 8);
        let d = `M-10 ${fmt(y)}`;
        let x = -10.0;
        let up = true;
        while (x < 110) {
          const cy = up ? y - amp : y + amp;
          d += ` Q${fmt(x + wl / 4)} ${fmt(cy)} ${fmt(x + wl / 2)} ${fmt(y)}`;
          x += wl / 2;
          up = !up;
        }
        b.push(
          shape(
            "path",
            ["d", d],
            ["fill", "none"],
            ["stroke", B],
            ["stroke-width", fmt(sw)],
            ["stroke-linecap", "round"],
          ),
        );
      }
      break;
    }
    case "pull": {
      // A record half out of its sleeve: sleeve in A, the disc (with its label hole) in B, overlapping it.
      const s = 56 + rand() * 8;
      const x0 = 8 + rand() * 6;
      const y0 = 100 - s - 8 - rand() * 10;
      a.push(
        shape(
          "rect",
          ["x", fmt(x0)],
          ["y", fmt(y0)],
          ["width", fmt(s)],
          ["height", fmt(s)],
          ["fill", A],
        ),
      );
      a.push(
        shape(
          "rect",
          ["x", "0"],
          ["y", "0"],
          ["width", "100"],
          ["height", fmt(y0 - 6)],
          ["fill", A],
          screen,
        ),
      );
      const R = s * 0.46;
      const cx = x0 + s * (0.78 + rand() * 0.14);
      const cy = y0 + s / 2;
      const hole = R * 0.3;
      b.push(
        shape(
          "path",
          ["fill-rule", "evenodd"],
          ["fill", B],
          [
            "d",
            `M${fmt(cx - R)} ${fmt(cy)} a${fmt(R)} ${fmt(R)} 0 1 0 ${fmt(2 * R)} 0 ` +
              `a${fmt(R)} ${fmt(R)} 0 1 0 ${fmt(-2 * R)} 0 Z M${fmt(cx - hole)} ${fmt(cy)} ` +
              `a${fmt(hole)} ${fmt(hole)} 0 1 0 ${fmt(2 * hole)} 0 ` +
              `a${fmt(hole)} ${fmt(hole)} 0 1 0 ${fmt(-2 * hole)} 0 Z`,
          ],
        ),
      );
      break;
    }
    case "spines": {
      // Records leaning in a crate, seen edge-on: equal heights (never a bar chart), alternating drums, touching.
      const lean = 8 + rand() * 7;
      const top = 14 + rand() * 6;
      const h = 70;
      let x = 6 + rand() * 4;
      for (let i = 0; i < 6; i++) {
        const w = 8 + rand() * 5;
        const skew = h * (lean / 60);
        const pts =
          `${fmt(x)},${fmt(top + h)} ${fmt(x + w)},${fmt(top + h)} ` +
          `${fmt(x + w + skew)},${fmt(top)} ${fmt(x + skew)},${fmt(top)}`;
        if (i % 2 === 0)
          a.push(
            shape(
              "polygon",
              ["points", pts],
              ["fill", A],
              i === 4 ? screen : null,
            ),
          );
        else b.push(shape("polygon", ["points", pts], ["fill", B]));
        x += w - 2.2; // neighbours overlap by 2.2u, so every A/B seam prints the third colour
      }
      break;
    }
  }
  return { a, b, grain: size >= GRAIN_MIN_PX };
}

/** A 23u tile of paper-coloured voids, pre-rendered once (deterministic). */
export function speckle(): Shape[] {
  const rand = mulberry32(0x5eed);
  const dots: Shape[] = [];
  for (let i = 0; i < 46; i++) {
    const r = 0.18 + rand() ** 2 * 0.62;
    const cx = rand() * 23;
    const cy = rand() * 23;
    dots.push(
      shape(
        "circle",
        ["cx", fmt(cx)],
        ["cy", fmt(cy)],
        ["r", pyFixed(r, 2)],
        ["fill", "black"],
      ),
    );
  }
  return dots;
}
