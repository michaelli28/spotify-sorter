// The crate (brief §3 Home, §4.2), in bin units: the figure is 440u wide, and
// <CrateFigure> sets --u = 1u in px. Pure functions, shared by home and classify.

export const CRATE = {
  WIDTH: 440,
  /** Figure height: slat 1 + two slats + the gap between them. */
  HEIGHT: 578,
  TAB_H: 18,
  TAB_COLS: 6,
  TAB_GAP: 5,
  /** A divider card's own thickness. 6 columns x 3.2 = 19.2u > TAB_H, so tabs in a column never touch. */
  DIVIDER: 3.2,
  /** Top edge of the back-most divider. */
  BACK_TOP: 22,
  /**
   * The most dividers whose cards leave room for records: floor((FRONT_TOP - BACK_TOP) / DIVIDER) + 1.
   * Past it `tracksPerU` is 0 (no stacks draw) and back tabs soon rise above the figure.
   */
  MAX_DIVIDERS: 93,
  /** Top edge of the front divider. */
  FRONT_TOP: 319,
  CARD_X: 18,
  CARD_W: 404,
  /** Each u further back is this much narrower per side. */
  PERSPECTIVE: 0.045,
  /** The back rail's corners, where the crate's sides meet it. */
  BACK_Y: 13,
  BACK_X: 23.5,
  SLAT_1: 500,
  SLAT_H: 36,
  SLAT_GAP: 6,
  /** Home's pulled sleeve: 220u square, 8u below the front divider's top. */
  SLEEVE: 220,
  SLEEVE_TOP: 327,
  /** Record stacks: inset from the card's sides; a record top every PITCH, the first HAIRLINE_AT down. */
  STACK_INSET: 5,
  STACK_TRIM: 0.6,
  HAIRLINE_AT: 1.7,
  HAIRLINE_PITCH: 2.7,
  HAIRLINE: 1,
} as const;

interface Sized {
  count: number;
  catalogueNo: number;
}

/** Largest first; a tie goes to the lower catalogue number. Returns a new array. */
export function orderBySize<T extends Sized>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => b.count - a.count || a.catalogueNo - b.catalogueNo,
  );
}

/**
 * Tracks per u, so the records in front of the back divider fill the crate between
 * FRONT_TOP and BACK_TOP (72.06 on the real library). 0 = draw no record stacks
 * (nothing placed yet, or too many dividers to leave room).
 */
export function tracksPerU(countsFrontToBack: readonly number[]): number {
  const n = countsFrontToBack.length;
  const room = CRATE.FRONT_TOP - CRATE.BACK_TOP - (n - 1) * CRATE.DIVIDER;
  const total = countsFrontToBack.reduce((a, b) => a + b, 0);
  // The back divider's records stand behind the crate's fill line, so they don't count; a lone divider has only them.
  const inFront = n > 1 ? total - countsFrontToBack[n - 1] : total;
  return n === 0 || room <= 0 || inFront <= 0 ? 0 : inFront / room;
}

/** A divider's depth: its card plus its records, a linear length (never sqrt: it would misstate ratios). */
export function dividerDepth(count: number, perU: number): number {
  return CRATE.DIVIDER + (perU > 0 ? count / perU : 0);
}

export interface DividerLayout<T> {
  entry: T;
  /** Top edge, u from the figure's top. */
  top: number;
  /** Card and records, u. */
  depth: number;
  x: number;
  width: number;
  /** The records standing behind this divider, seen from above: a box ending at `top`. */
  stack: { x: number; y: number; width: number; height: number };
  tab: { column: number; left: number; top: number; width: number };
  /** Paint order: front dividers over back ones. */
  z: number;
  /** Entrance stagger index: back first. */
  settle: number;
}

/** Positions for dividers given front to back (e.g. `orderBySize(...)`). DOM/key order = this order. */
export function crateLayout<T extends { count: number }>(
  frontToBack: readonly T[],
  opts: { perU?: number } = {},
): DividerLayout<T>[] {
  const perU = opts.perU ?? tracksPerU(frontToBack.map((e) => e.count));
  const n = frontToBack.length;
  const tabW =
    (CRATE.CARD_W - (CRATE.TAB_COLS - 1) * CRATE.TAB_GAP) / CRATE.TAB_COLS;
  let top: number = CRATE.FRONT_TOP;
  return frontToBack.map((entry, k) => {
    const depth = dividerDepth(entry.count, perU);
    const inset = (CRATE.FRONT_TOP - top) * CRATE.PERSPECTIVE;
    const x = CRATE.CARD_X + inset;
    const width = CRATE.CARD_W - 2 * inset;
    const scale = width / CRATE.CARD_W;
    const column = k % CRATE.TAB_COLS;
    // No records behind it (nothing placed yet): the divider stands alone, with no stack.
    const stackH = depth > CRATE.DIVIDER ? depth - CRATE.STACK_TRIM : 0;
    const d: DividerLayout<T> = {
      entry,
      top,
      depth,
      x,
      width,
      stack: {
        x: x + CRATE.STACK_INSET,
        width: width - 2 * CRATE.STACK_INSET,
        height: stackH,
        y: top - stackH,
      },
      tab: {
        column,
        left: x + column * (tabW + CRATE.TAB_GAP) * scale,
        top: top - CRATE.TAB_H,
        width: tabW * scale,
      },
      z: n - k,
      settle: n - 1 - k,
    };
    top -= depth;
    return d;
  });
}

/** Where each record top's hairline starts, u down from the top of a stack `height` deep. */
export function recordHairlines(height: number): number[] {
  const ys: number[] = [];
  for (let j = 0; CRATE.HAIRLINE_AT + j * CRATE.HAIRLINE_PITCH < height; j++) {
    ys.push(CRATE.HAIRLINE_AT + j * CRATE.HAIRLINE_PITCH);
  }
  return ys;
}
