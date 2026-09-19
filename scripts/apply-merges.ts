// Day 3: apply Michael's category merges (45 -> 41) and clear every assignment
// so the next classify run re-sorts the whole library against the merged set.
// Dry run by default; pass --apply to write data/cache.json (back it up first).
import { join } from "node:path";
import { readCache, writeCache, type Cache } from "@/src/lib/cache";

// The first name in each group keeps its category id; the rest are removed.
const MERGES = [
  {
    keep: "Moombahton Tropical Dance",
    absorb: ["Afrobeats Global Groove", "Reggaeton Latin Rhythm"],
    name: "Afro-Latin Dance Rhythms",
    description:
      "Afrobeats, reggaeton and moombahton: infectious African and Latin rhythms with modern, tropical dance production. Celebratory and made to move.",
  },
  {
    keep: "Hyperpop Experimental",
    absorb: ["Glitch Hyperpop Chaotic"],
    name: "Glitchy Hyperpop",
    description:
      "Chaotic, genre-bending electronic pop with glitchy production, distorted vocals and unconventional song structures.",
  },
  {
    keep: "Alternative Rock Indie",
    absorb: ["Indie Rock Garage"],
    name: "Indie & Alternative Rock",
    description:
      "Guitar-driven indie and alternative rock, from fuzzy garage energy to introspective songwriting, with catchy hooks.",
  },
];

function idOf(cache: Cache, name: string): string {
  const hits = Object.entries(cache.categories).filter(
    ([, c]) => c.name === name,
  );
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one category named "${name}", found ${hits.length}`,
    );
  }
  return hits[0]![0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const path = join(process.cwd(), "data", "cache.json");
  const cache = await readCache(path);
  const categories = { ...cache.categories };

  for (const m of MERGES) {
    const keepId = idOf(cache, m.keep);
    const absorbIds = m.absorb.map((n) => idOf(cache, n));
    const examples = [keepId, ...absorbIds].flatMap(
      (id) => cache.categories[id]!.example_track_ids,
    );
    categories[keepId] = {
      ...cache.categories[keepId]!,
      name: m.name,
      description: m.description,
      example_track_ids: [...new Set(examples)],
    };
    for (const id of absorbIds) delete categories[id];
    console.log(`${m.name} <- ${[m.keep, ...m.absorb].join(" + ")}`);
  }

  const before = Object.keys(cache.categories).length;
  const after = Object.keys(categories).length;
  const cleared = Object.keys(cache.assignments).length;
  console.log({
    categoriesBefore: before,
    categoriesAfter: after,
    assignmentsCleared: cleared,
  });
  if (!apply) {
    console.log("dry run: pass --apply to write data/cache.json");
    return;
  }
  await writeCache(path, { ...cache, categories, assignments: {} });
  console.log("written");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
