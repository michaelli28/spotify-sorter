import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { reclassifyAgainstCategory } from "@/src/lib/llm/reclassify";

function trimToTop5(matches: Array<{ category_id: string; score: number }>) {
  return [...matches].sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function runReclassifyForNewCategories(opts: {
  apiKey: string;
  newCategoryIds: string[];
}) {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);

  const eligibleTrackIds = Object.keys(cache.assignments).filter(
    (id) => !cache.assignments[id]!.override,
  );
  if (eligibleTrackIds.length === 0) return { tracks_updated: 0, cost_usd: 0 };

  let totalCost = 0;
  const merged = { ...cache.assignments };
  const updated = new Set<string>();

  for (const categoryId of opts.newCategoryIds) {
    const category = cache.categories[categoryId];
    if (!category) continue;
    const inputs = eligibleTrackIds.map((id) => {
      const t = cache.tracks[id]!;
      const a = cache.artists[t.artist_id];
      return {
        id,
        title: t.title,
        artist_name: a?.name ?? "",
        genres: a?.genres ?? [],
      };
    });
    const r = await reclassifyAgainstCategory({
      apiKey: opts.apiKey,
      category: {
        id: categoryId,
        name: category.name,
        description: category.description,
      },
      tracks: inputs,
    });
    totalCost += r.cost_usd;
    for (const score of r.scores) {
      const existing = merged[score.track_id];
      if (!existing) continue;
      const withoutThis = existing.matches.filter(
        (m) => m.category_id !== categoryId,
      );
      const next = trimToTop5([
        ...withoutThis,
        { category_id: categoryId, score: score.score },
      ]);
      merged[score.track_id] = { ...existing, matches: next };
      updated.add(score.track_id);
    }
  }

  await writeCache(cachePath, patchCache(cache, { assignments: merged }));
  return { tracks_updated: updated.size, cost_usd: totalCost };
}
