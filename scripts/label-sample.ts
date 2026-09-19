// Day 4: draw the pre-registered label sample. Read-only on data/cache.json;
// writes data/labels/sample.json + sample-design.json and refuses to redraw.
// Prints aggregates only: anything per-track could leak scores to the labeler.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { dataDir } from "@/src/lib/config/paths";
import {
  labelsDir,
  sampleDesignPath,
  samplePath,
} from "@/src/lib/labeling/paths";
import { drawSample } from "@/src/lib/labeling/sample";
import { LABEL_SEED } from "@/src/lib/labeling/schema";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function main() {
  const existing = [samplePath(), sampleDesignPath()].filter((p) =>
    existsSync(p),
  );
  if (existing.length > 0) {
    throw new Error(
      `refusing to redraw a pre-registered sample; already exists: ${existing.join(", ")}`,
    );
  }

  const cache = await readCache(join(dataDir(), "cache.json"));
  const { sample, design } = drawSample({
    track_ids: Object.keys(cache.tracks),
    category_ids: Object.keys(cache.categories),
    assignments: cache.assignments,
    seed: LABEL_SEED,
    created_at: new Date().toISOString(),
    assignments_sha256: sha256(JSON.stringify(cache.assignments)),
  });

  const sampleJson = JSON.stringify(sample, null, 2) + "\n";
  await mkdir(labelsDir(), { recursive: true });
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

main().catch((err: unknown) => {
  console.error(
    "label-sample failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
