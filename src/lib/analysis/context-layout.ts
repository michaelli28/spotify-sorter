import { seededRandom, shuffled } from "@/src/lib/labeling/rng";

export interface ContextLayouts {
  // Batches of track ids, each in line order.
  A: string[][];
  B: string[][];
  C: string[][];
  // Sole occupants of a position column (only the longest batches reach the
  // last position): they can't change batch without changing line number.
  unmoved: string[];
  // Mean share of each track's A-neighbors still beside it (≈ 1/(k-1)).
  neighborOverlap: { B: number; C: number };
}

// Uniform over derangements by rejection (a shuffle is one with p ≈ 1/e).
function derangement(m: number, rand: () => number): number[] {
  const identity = Array.from({ length: m }, (_, i) => i);
  for (;;) {
    const p = shuffled(identity, rand);
    if (p.every((to, from) => to !== from)) return p;
  }
}

// Same batch sizes and line positions as A; the tracks at each position are
// moved across batches by a random derangement drawn per position.
function rearranged(A: string[][], rand: () => number): string[][] {
  const out = A.map((batch) => [...batch]);
  const width = Math.max(0, ...A.map((b) => b.length));
  for (let p = 0; p < width; p++) {
    const holders = A.flatMap((batch, b) => (p < batch.length ? [b] : []));
    if (holders.length < 2) continue;
    const to = derangement(holders.length, rand);
    holders.forEach((b, i) => {
      out[holders[to[i]!]!]![p] = A[b]![p]!;
    });
  }
  return out;
}

export function neighborOverlap(base: string[][], other: string[][]): number {
  const batchOf = new Map<string, number>();
  other.forEach((batch, b) => batch.forEach((t) => batchOf.set(t, b)));
  const shares = base.flatMap((batch) =>
    batch.length < 2
      ? []
      : batch.map((t) => {
          const kept = batch.filter(
            (n) => n !== t && batchOf.get(n) === batchOf.get(t),
          ).length;
          return kept / (batch.length - 1);
        }),
  );
  return shares.length === 0
    ? 0
    : shares.reduce((s, x) => s + x, 0) / shares.length;
}

export function buildLayouts(opts: {
  trackIds: string[];
  seed: string;
  batchSize?: number;
}): ContextLayouts {
  const batchSize = opts.batchSize ?? 50;
  const sorted = [...opts.trackIds].sort();
  if (new Set(sorted).size !== sorted.length) {
    throw new Error("buildLayouts: duplicate track ids");
  }
  const order = shuffled(sorted, seededRandom(`${opts.seed}:A`));
  const k = Math.ceil(order.length / batchSize);
  const base = Math.floor(order.length / k);
  const extra = order.length % k;
  const A: string[][] = [];
  let start = 0;
  for (let b = 0; b < k; b++) {
    const size = base + (b < extra ? 1 : 0);
    A.push(order.slice(start, start + size));
    start += size;
  }

  const B = rearranged(A, seededRandom(`${opts.seed}:B`));
  const C = rearranged(A, seededRandom(`${opts.seed}:C`));
  const width = Math.max(0, ...A.map((b) => b.length));
  const unmoved: string[] = [];
  for (let p = 0; p < width; p++) {
    const column = A.filter((batch) => p < batch.length);
    if (column.length === 1) unmoved.push(column[0]![p]!);
  }
  return {
    A,
    B,
    C,
    unmoved,
    neighborOverlap: {
      B: neighborOverlap(A, B),
      C: neighborOverlap(A, C),
    },
  };
}
