import { appendFile, mkdir, readFile } from "node:fs/promises";
import type { Cache } from "@/src/lib/cache";
import { parseDefinitions, type CategoryDefinition } from "./definitions";
import {
  definitionsPath,
  goldSamplePath,
  labelsDir,
  labelsPath,
  samplePath,
} from "./paths";
import {
  GoldSampleSchema,
  LabelRowSchema,
  LabelSampleSchema,
  RELABEL_DELAY_MS,
  type GoldSample,
  type LabelRow,
  type LabelSample,
  type LabelState,
  type LabelTrack,
  type PairSuggestion,
  type Suggestion,
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

// The gold set is a separate pre-registration and may not exist yet.
export async function readGoldSample(): Promise<GoldSample | null> {
  const raw = await readOrNull(goldSamplePath());
  return raw === null ? null : GoldSampleSchema.parse(JSON.parse(raw));
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

// Takes tracks, artists and categories from the cache. Model output reaches the
// page ONLY through `suggestions`, which the caller must build and pass
// explicitly — there is no path by which it arrives here by accident, and the
// pairs queue never receives it at all. Throws DefinitionsError from
// parseDefinitions when definitions.md doesn't match the categories.
export function buildLabelState(
  input: Pick<Cache, "tracks" | "artists" | "categories"> & {
    sample: LabelSample;
    gold?: GoldSample | null;
    definitions: string;
    definitionsSha: string;
    labels: readonly LabelRow[];
    // track_id -> the model's ranked suggestions. Omit for a blind page.
    suggestions?: Readonly<Record<string, readonly Suggestion[]>>;
    // pair_id -> the model's answer to that pair. Separate from `suggestions`
    // and keyed differently on purpose: a pair is a (track, category) question,
    // so the track's ranked list is the wrong shape and would leak the other
    // four categories into a question about one.
    pairSuggestions?: Readonly<Record<string, PairSuggestion>>;
  },
): LabelState {
  const { tracks, artists, categories, sample, labels, suggestions } = input;
  const pairSuggestions = input.pairSuggestions;

  // Blind by DEFAULT: a caller must ask for suggestions. The pairs queue shares
  // this helper, and a yes/no answer about one named category with the model's
  // score for that category on screen is not an answer at all — so the opt-in
  // sits at the call site, where it is visible, rather than being inherited.
  const labelTrack = (track_id: string, assisted = false): LabelTrack => {
    const track = tracks[track_id];
    if (!track)
      throw new Error(`Sampled track ${track_id} is not in the cache`);
    const artist = artists[track.artist_id];
    const suggested = assisted ? suggestions?.[track_id] : undefined;
    return {
      track_id,
      title: track.title,
      artist_name: artist?.name ?? "",
      genres: artist?.genres ?? [],
      // Spread so the key is absent rather than undefined when not offered.
      ...(suggested ? { suggestions: suggested } : {}),
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
      ...labelTrack(id, true),
      done: pass1Done.has(id),
    })),
    gold: (input.gold?.track_ids ?? []).map((id) => ({
      ...labelTrack(id, true),
      done: pass1Done.has(id),
    })),
    pairs: sample.pairs.map((p) => {
      if (!categories[p.category_id]) {
        throw new Error(
          `Sample pair ${p.pair_id} names category ${p.category_id}, which is not in the cache`,
        );
      }
      const suggestion = pairSuggestions?.[p.pair_id];
      return {
        // Never the track's ranked list here: a pair asks about ONE category,
        // and the other four would be an answer to a question not asked.
        ...labelTrack(p.track_id),
        pair_id: p.pair_id,
        category_id: p.category_id,
        done: pairsDone.has(p.pair_id),
        ...(suggestion ? { suggestion } : {}),
      };
    }),
    // Assisted too, matching pass 1. If one pass saw the suggestions and the
    // other did not, their disagreement would conflate "changed my mind" with
    // "had help the first time", and the self-agreement ceiling would stop
    // meaning anything. The same condition on both passes is the only readable
    // option once pass 1 is assisted.
    relabel: sample.relabel_track_ids.map((id) => ({
      ...labelTrack(id, true),
      done: pass2Done.has(id),
      opens_at: opensAt.get(id) ?? null,
    })),
  };
}
