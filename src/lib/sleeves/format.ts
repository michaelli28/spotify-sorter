/**
 * `v.toFixed(digits)`, except an exact binary tie rounds to even, as Python's
 * `f"{v:.{digits}f}"` does (toFixed rounds 0.25 up to "0.3"; Python prints "0.2").
 * Keeps the sleeve markup identical to covers.py's.
 */
export function pyFixed(v: number, digits: number): string {
  const sign = v < 0 || Object.is(v, -0) ? "-" : "";
  const abs = Math.abs(v);
  // toFixed(100) is the exact decimal expansion of the double.
  const exact = abs.toFixed(100);
  const point = exact.indexOf(".");
  const kept = exact.slice(0, point + 1 + digits);
  const rest = exact.slice(point + 1 + digits);
  const tie = /^50*$/.test(rest);
  const lastKept = Number(kept[kept.length - 1]);
  if (tie && lastKept % 2 === 0) {
    return sign + (digits === 0 ? kept.slice(0, -1) : kept);
  }
  return sign + abs.toFixed(digits);
}

/** covers.py's `_f`: one decimal, trailing zeros and point dropped ("10.0" → "10"). */
export function fmt(v: number): string {
  return pyFixed(v, 1).replace(/0+$/, "").replace(/\.$/, "");
}
