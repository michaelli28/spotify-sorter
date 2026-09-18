// Day 3 prep: which model-invented categories overlap enough to merge?
// Read-only on data/cache.json; writes data/analysis/redundancy.csv (not in git).
// Membership uses the app's current rule (score >= threshold, top-1 fallback).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { pairStats } from "@/src/lib/analysis/redundancy";

const MIN_JACCARD = 0.3;

async function main() {
  const dir = join(process.cwd(), "data");
  const cache = await readCache(join(dir, "cache.json"));
  const n = Object.keys(cache.tracks).length;
  const members = categoryMembers(
    cache.assignments,
    cache.config.confidence_threshold,
  );
  for (const id of Object.keys(cache.categories)) {
    if (!members.has(id)) members.set(id, new Set());
  }
  const name = (id: string) => cache.categories[id]?.name ?? id;
  const stats = pairStats(members, n);

  const csv = [
    "a,b,size_a,size_b,overlap,jaccard,lift,containment",
    ...stats.map((s) =>
      [
        JSON.stringify(name(s.a)),
        JSON.stringify(name(s.b)),
        s.sizeA,
        s.sizeB,
        s.overlap,
        s.jaccard.toFixed(4),
        s.lift.toFixed(3),
        s.containment.toFixed(4),
      ].join(","),
    ),
  ].join("\n");
  await mkdir(join(dir, "analysis"), { recursive: true });
  await writeFile(join(dir, "analysis", "redundancy.csv"), csv + "\n");

  const top = stats.filter((s) => s.jaccard >= MIN_JACCARD);
  console.log(
    `N=${n} tracks, ${members.size} categories, ${stats.length} pairs, threshold ${cache.config.confidence_threshold}; ${top.length} pairs with Jaccard >= ${MIN_JACCARD}\n`,
  );
  console.log(
    "| # | Category A (size) | Category B (size) | Overlap | Jaccard | Lift | Containment |",
  );
  console.log("|---|---|---|---|---|---|---|");
  top.forEach((s, i) =>
    console.log(
      `| ${i + 1} | ${name(s.a)} (${s.sizeA}) | ${name(s.b)} (${s.sizeB}) | ${s.overlap} | ${s.jaccard.toFixed(2)} | ${s.lift.toFixed(1)} | ${s.containment.toFixed(2)} |`,
    ),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
