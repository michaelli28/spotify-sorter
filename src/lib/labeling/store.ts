import { appendFile, mkdir, readFile } from "node:fs/promises";
import type { Cache } from "@/src/lib/cache";
import { parseDefinitions, type CategoryDefinition } from "./definitions";
import { definitionsPath, labelsDir, labelsPath, samplePath } from "./paths";
import {
  LabelRowSchema,
  LabelSampleSchema,
  RELABEL_DELAY_MS,
  type LabelRow,
  type LabelSample,
  type LabelState,
  type LabelTrack,
} from "./schema";

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function readSample(): Promise<LabelSample | null> {
  const raw = await readOrNull(samplePath());
  return raw === null ? null : LabelSampleSchema.parse(JSON.parse(raw));
}

export function readDefinitionsFile(): Promise<string | null> {
  return readOrNull(definitionsPath());
}

// Every line must parse: a skipped label would silently bias the study.
export async function readLabels(): Promise<LabelRow[]> {
  const raw = await readOrNull(labelsPath());
  if (raw === null) return [];
  const lines = raw.split("\n");
  // Every append ends in "\n", so only the final empty segment is expected.
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line, i) => {
    try {
      return LabelRowSchema.parse(JSON.parse(line));
    } catch (err) {
      throw new Error(
        `labels.jsonl line ${i + 1} is malformed: ${(err as Error).message}`,
      );
    }
  });
}

// Appends go through one promise chain so concurrent POSTs can't interleave
// partial lines. The chain swallows a failure only to stay usable: the caller
// still gets the rejection.
let appendChain: Promise<void> = Promise.resolve();

export function appendLabel(row: LabelRow): Promise<void> {
  let line: string;
  try {
    line = JSON.stringify(LabelRowSchema.parse(row)) + "\n";
  } catch (err) {
    return Promise.reject(err);
  }
  const write = appendChain.then(async () => {
    await mkdir(labelsDir(), { recursive: true });
    await appendFile(labelsPath(), line, "utf-8");
  });
  appendChain = write.catch(() => undefined);
  return write;
}

// track_id -> when its pass-2 relabel opens: earliest pass-1 label + 48 h.
export function relabelOpensAt(
  labels: readonly LabelRow[],
): Map<string, string> {
  const firstPass1 = new Map<string, number>();
  for (const row of labels) {
    if (row.kind !== "track" || row.pass !== 1) continue;
    const at = Date.parse(row.labeled_at);
    const prev = firstPass1.get(row.track_id);
    if (prev === undefined || at < prev) firstPass1.set(row.track_id, at);
  }
  return new Map(
    [...firstPass1].map(([id, at]) => [
      id,
      new Date(at + RELABEL_DELAY_MS).toISOString(),
    ]),
  );
}

// Categories in cache order, each with its definitions.md section. Throws
// DefinitionsError when the headings don't match the category names.
export function defineCategories(
  definitions: string,
  categories: Cache["categories"],
): CategoryDefinition[] {
  return parseDefinitions(
    definitions,
    Object.entries(categories).map(([id, c]) => ({ id, name: c.name })),
  );
}

// Takes only tracks, artists and categories from the cache, so model output
// can't reach the page even by accident. Throws DefinitionsError from
// parseDefinitions when definitions.md doesn't match the categories.
export function buildLabelState(
  input: Pick<Cache, "tracks" | "artists" | "categories"> & {
    sample: LabelSample;
    definitions: string;
    definitionsSha: string;
    labels: readonly LabelRow[];
  },
): LabelState {
  const { tracks, artists, categories, sample, labels } = input;

  const labelTrack = (track_id: string): LabelTrack => {
    const track = tracks[track_id];
    if (!track)
      throw new Error(`Sampled track ${track_id} is not in the cache`);
    const artist = artists[track.artist_id];
    return {
      track_id,
      title: track.title,
      artist_name: artist?.name ?? "",
      genres: artist?.genres ?? [],
    };
  };

  const done = (pass: 1 | 2) =>
    new Set(
      labels.flatMap((r) =>
        r.kind === "track" && r.pass === pass ? [r.track_id] : [],
      ),
    );
  const pass1Done = done(1);
  const pass2Done = done(2);
  const pairsDone = new Set(
    labels.flatMap((r) => (r.kind === "pair" ? [r.pair_id] : [])),
  );
  const opensAt = relabelOpensAt(labels);

  return {
    definitions_sha256: input.definitionsSha,
    categories: defineCategories(input.definitions, categories),
    random: sample.random_track_ids.map((id) => ({
      ...labelTrack(id),
      done: pass1Done.has(id),
    })),
    pairs: sample.pairs.map((p) => {
      if (!categories[p.category_id]) {
        throw new Error(
          `Sample pair ${p.pair_id} names category ${p.category_id}, which is not in the cache`,
        );
      }
      return {
        ...labelTrack(p.track_id),
        pair_id: p.pair_id,
        category_id: p.category_id,
        done: pairsDone.has(p.pair_id),
      };
    }),
    relabel: sample.relabel_track_ids.map((id) => ({
      ...labelTrack(id),
      done: pass2Done.has(id),
      opens_at: opensAt.get(id) ?? null,
    })),
  };
}
