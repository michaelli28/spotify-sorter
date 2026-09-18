export interface PairStat {
  a: string;
  b: string;
  sizeA: number;
  sizeB: number;
  overlap: number;
  jaccard: number;
  // overlap ÷ the overlap expected if membership were independent: |A||B|/N.
  lift: number;
  // share of the smaller category that also sits in the larger one.
  containment: number;
}

// Every unordered category pair, most-overlapping (by Jaccard) first.
export function pairStats(
  members: Map<string, Set<string>>,
  totalTracks: number,
): PairStat[] {
  const ids = [...members.keys()];
  const out: PairStat[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = members.get(ids[i]!)!;
      const B = members.get(ids[j]!)!;
      let overlap = 0;
      for (const t of A) if (B.has(t)) overlap++;
      const union = A.size + B.size - overlap;
      out.push({
        a: ids[i]!,
        b: ids[j]!,
        sizeA: A.size,
        sizeB: B.size,
        overlap,
        jaccard: union === 0 ? 0 : overlap / union,
        lift:
          A.size * B.size === 0
            ? 0
            : overlap / ((A.size * B.size) / totalTracks),
        containment:
          Math.min(A.size, B.size) === 0
            ? 0
            : overlap / Math.min(A.size, B.size),
      });
    }
  }
  return out.sort((x, y) => y.jaccard - x.jaccard);
}
