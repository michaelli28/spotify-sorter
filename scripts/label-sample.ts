// Day 4: draw the pre-registered label sample. Read-only on data/cache.json;
// writes data/labels/sample.json + sample-design.json and refuses to redraw.
// Prints aggregates only: anything per-track could leak scores to the labeler.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { dataDir } from "@/src/lib/config/paths";
import {
  goldSamplePath,
  labelsDir,
  sampleDesignPath,
  samplePath,
} from "@/src/lib/labeling/paths";
import { drawGoldSample, drawSample } from "@/src/lib/labeling/sample";
import {
  GOLD_SEED,
  GOLD_TRACKS,
  LABEL_SEED,
  LabelSampleSchema,
} from "@/src/lib/labeling/schema";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function main() {
  const cache = await readCache(join(dataDir(), "cache.json"));
  await mkdir(labelsDir(), { recursive: true });
  await drawFirstSample(cache);
  await drawGoldSet(cache);
}

type Cache = Awaited<ReturnType<typeof readCache>>;

// Each pre-registered file is drawn once and never rewritten. Missing ones are
// drawn; existing ones are left exactly as they are.
async function drawFirstSample(cache: Cache) {
  const existing = [samplePath(), sampleDesignPath()].filter((p) =>
    existsSync(p),
  );
  if (existing.length > 0) {
    console.log(
      `sample.json already drawn; leaving it alone (${existing.length} file(s))\n`,
    );
    return;
  }

  const { sample, design } = drawSample({
    track_ids: Object.keys(cache.tracks),
    category_ids: Object.keys(cache.categories),
    assignments: cache.assignments,
    seed: LABEL_SEED,
    created_at: new Date().toISOString(),
    assignments_sha256: sha256(JSON.stringify(cache.assignments)),
  });

  const sampleJson = JSON.stringify(sample, null, 2) + "\n";
  // "wx" fails if the file appeared since the check above: never overwrite.
  await writeFile(samplePath(), sampleJson, { flag: "wx" });
  await writeFile(sampleDesignPath(), JSON.stringify(design, null, 2) + "\n", {
    flag: "wx",
  });

  const distinct = new Set([
    ...sample.random_track_ids,
    ...sample.pairs.map((p) => p.track_id),
  ]);
  console.log(
    `seed ${design.seed}; population ${design.population.tracks} tracks x ${design.population.categories} categories`,
  );
  console.log(
    `random ${sample.random_track_ids.length}, relabel ${sample.relabel_track_ids.length}, pairs ${sample.pairs.length}, distinct sampled tracks ${distinct.size}\n`,
  );
  console.log("| Bin | Population pairs | Sampled | Inclusion prob |");
  console.log("|---|---|---|---|");
  for (const b of design.bins) {
    console.log(
      `| ${b.id} | ${b.population_pairs} | ${b.sampled} | ${(b.sampled / b.population_pairs).toPrecision(3)} |`,
    );
  }
  console.log(
    `\nwrote ${samplePath()}\nsample.json sha256 ${sha256(sampleJson)}`,
  );
  console.log(`wrote ${sampleDesignPath()}`);
}

// The gold set for the audio-student comparison: no-genre songs only, drawn
// from the ones the first sample didn't already take.
async function drawGoldSet(cache: Cache) {
  if (existsSync(goldSamplePath())) {
    console.log(`\n${goldSamplePath()} already drawn; leaving it alone`);
    return;
  }
  const noGenre = Object.entries(cache.tracks)
    .filter(([, t]) => (cache.artists[t.artist_id]?.genres ?? []).length === 0)
    .map(([id]) => id);

  const first = existsSync(samplePath())
    ? LabelSampleSchema.parse(JSON.parse(await readFile(samplePath(), "utf-8")))
    : null;
  const alreadySampled = new Set(
    first
      ? [...first.random_track_ids, ...first.pairs.map((p) => p.track_id)]
      : [],
  );

  const gold = drawGoldSample({
    no_genre_ids: noGenre,
    already_sampled: alreadySampled,
    count: GOLD_TRACKS,
    seed: GOLD_SEED,
    created_at: new Date().toISOString(),
  });
  const goldJson = JSON.stringify(gold, null, 2) + "\n";
  await writeFile(goldSamplePath(), goldJson, { flag: "wx" });

  // Only the random set carries a full 41-category label per song; a pair
  // song is judged on one category, so it can't join the gold set.
  const noGenreSet = new Set(noGenre);
  const fullyLabeled = (first?.random_track_ids ?? []).filter((id) =>
    noGenreSet.has(id),
  ).length;
  console.log(
    `\nseed ${gold.seed}; no-genre songs ${gold.pool.no_genre} of ${Object.keys(cache.tracks).length}` +
      `, already in sample.json ${gold.pool.already_sampled}, eligible ${gold.pool.eligible}`,
  );
  console.log(
    `drew ${gold.track_ids.length}; with the ${fullyLabeled} no-genre songs in the first sample's random set that is a gold set of ${fullyLabeled + gold.track_ids.length}`,
  );
  console.log(
    `wrote ${goldSamplePath()}\ngold-sample.json sha256 ${sha256(goldJson)}`,
  );
}

main().catch((err: unknown) => {
  console.error(
    "label-sample failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
