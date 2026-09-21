import { NextResponse } from "next/server";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, type Cache } from "@/src/lib/cache";
import { rejectCrossSite } from "@/src/lib/http/same-origin";
import {
  DefinitionsError,
  definitionsSha256,
} from "@/src/lib/labeling/definitions";
import {
  appendLabel,
  buildLabelState,
  defineCategories,
  readDefinitionsFile,
  readGoldSample,
  readLabels,
  readSample,
  relabelOpensAt,
} from "@/src/lib/labeling/store";
import {
  LabelInputSchema,
  type LabelInput,
  type LabelRow,
  type GoldSample,
  type LabelSample,
  type PairSuggestion,
  type Suggestion,
} from "@/src/lib/labeling/schema";

export const dynamic = "force-dynamic";

// Serves the labeling page.
//
// The TRACK queues are assisted: on 2026-09-21 Michael asked to see the model's
// suggestions while labeling, having been told what it costs — a track answered
// with the model's own ranking on screen cannot then serve as a blind label in
// the comparison against that model. Those rows are stamped `assisted: true`.
//
// The PAIRS queue is assisted too, as of 2026-09-21, and the cost there is
// larger than on the tracks. The 200 pairs were stratified across pre-registered
// SCORE BINS to measure calibration — "when the model says 85, how often is it
// right?" — so an answer given with the score on screen measures the threshold
// rather than the judgement, and the calibration curve comes out right by
// construction. Those rows are stamped `assisted: true`.
//
// The draw's design file is still never read here. That is now a narrower
// guarantee than it sounds: a bin is derivable from the score, so what it still
// protects is only the INCLUSION PROBABILITIES, which the estimator needs and
// which nothing on the page should ever see.

const cachePath = () => join(dataDir(), "cache.json");

// The model's ranked categories per track, best first, straight out of the
// classification run. Only categories still present in the cache survive, so a
// renamed or deleted category cannot put an unresolvable id on the page.
function trackSuggestions(
  cache: Pick<Cache, "assignments" | "categories">,
): Record<string, Suggestion[]> {
  const out: Record<string, Suggestion[]> = {};
  for (const [track_id, a] of Object.entries(cache.assignments ?? {})) {
    const picks = (a?.matches ?? [])
      .filter((m) => cache.categories[m.category_id])
      .map((m) => ({ category_id: m.category_id, score: m.score }));
    if (picks.length) out[track_id] = picks;
  }
  return out;
}

// The model's answer to each sampled pair. A category the model never ranked
// for that track has no score, and its verdict is "no" — which is exactly what
// the app does when it decides what to file where.
function pairSuggestions(
  cache: Pick<Cache, "assignments" | "config">,
  pairs: LabelSample["pairs"],
): Record<string, PairSuggestion> {
  const threshold = cache.config.confidence_threshold;
  const out: Record<string, PairSuggestion> = {};
  for (const p of pairs) {
    const match = (cache.assignments?.[p.track_id]?.matches ?? []).find(
      (m) => m.category_id === p.category_id,
    );
    const score = match?.score ?? null;
    out[p.pair_id] = {
      score,
      verdict: score !== null && score >= threshold ? "yes" : "no",
    };
  }
  return out;
}

function fail(status: number, error: string, message?: string) {
  return NextResponse.json(message ? { error, message } : { error }, {
    status,
  });
}

export async function GET() {
  const sample = await readSample();
  if (!sample) return fail(404, "no_sample");
  const definitions = await readDefinitionsFile();
  if (definitions === null) return fail(404, "no_definitions");
  const cache = await readCache(cachePath());
  const { tracks, artists, categories } = cache;
  const labels = await readLabels();
  try {
    return NextResponse.json(
      buildLabelState({
        tracks,
        artists,
        categories,
        sample,
        gold: await readGoldSample(),
        definitions,
        definitionsSha: definitionsSha256(definitions),
        labels,
        suggestions: trackSuggestions(cache),
        pairSuggestions: pairSuggestions(cache, sample.pairs),
      }),
    );
  } catch (err) {
    if (err instanceof DefinitionsError)
      return fail(422, "bad_definitions", err.message);
    throw err;
  }
}

export async function POST(req: Request) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;
  const parsed = LabelInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail(400, "bad_body", z.prettifyError(parsed.error));
  const input = parsed.data;

  const sample = await readSample();
  if (!sample) return fail(404, "no_sample");
  const definitions = await readDefinitionsFile();
  if (definitions === null) return fail(404, "no_definitions");
  if (input.definitions_sha256 !== definitionsSha256(definitions))
    return fail(409, "definitions_changed");

  // The hash covers the file, not which id each heading names: re-match it so
  // a category renamed since the page loaded can't take a stale label.
  const { categories } = await readCache(cachePath());
  try {
    defineCategories(definitions, categories);
  } catch (err) {
    if (err instanceof DefinitionsError)
      return fail(422, "bad_definitions", err.message);
    throw err;
  }

  const row = await toRow(input, {
    sample,
    gold: await readGoldSample(),
    categories,
  });
  if (row instanceof Response) return row;
  await appendLabel(row);
  return NextResponse.json({ ok: true });
}

// Checks the label against the sample and the cache, then stamps it.
async function toRow(
  input: LabelInput,
  {
    sample,
    gold,
    categories,
  }: {
    sample: LabelSample;
    gold: GoldSample | null;
    categories: Cache["categories"];
  },
): Promise<LabelRow | Response> {
  const labeled_at = new Date().toISOString();

  // `assisted` may ratchet UP but never down. The client flag is per-mount: a
  // song revisited with Back, after the suggestions were hidden, resubmits as
  // blind even though they were on screen the first time. Analysis takes the
  // LATEST row per item, so that false-blind row would erase the honest mark
  // and put a label copied from the model back into the blind denominator.
  // Enforced here rather than in the component so it survives a reload, a
  // second tab, and any future client.
  const assistedBefore = async (match: (r: LabelRow) => boolean) =>
    (await readLabels()).some((r) => match(r) && r.assisted === true);

  if (input.kind === "pair") {
    const pair = sample.pairs.find((p) => p.pair_id === input.pair_id);
    if (!pair)
      return fail(400, "not_in_sample", `Unknown pair ${input.pair_id}`);
    if (!categories[pair.category_id])
      return fail(
        400,
        "unknown_category",
        `Unknown category ${pair.category_id}`,
      );
    const wasAssisted = await assistedBefore(
      (r) => r.kind === "pair" && r.pair_id === input.pair_id,
    );
    return {
      ...input,
      assisted: input.assisted || wasAssisted,
      track_id: pair.track_id,
      category_id: pair.category_id,
      labeled_at,
    };
  }

  // A gold song is only ever a first pass; the 48 h relabel covers the
  // random set only.
  if (input.set === "gold" && input.pass !== 1)
    return fail(400, "not_in_sample", "The gold set has no pass 2");
  const allowed =
    input.set === "gold"
      ? (gold?.track_ids ?? [])
      : input.pass === 1
        ? sample.random_track_ids
        : sample.relabel_track_ids;
  if (!allowed.includes(input.track_id))
    return fail(
      400,
      "not_in_sample",
      `Track ${input.track_id} is not in the ${input.set} pass-${input.pass} set`,
    );
  const unknown = input.category_ids.filter((id) => !categories[id]);
  if (unknown.length > 0)
    return fail(
      400,
      "unknown_category",
      `Unknown categories: ${unknown.join(", ")}`,
    );
  if (input.pass === 2) {
    const opensAt = relabelOpensAt(await readLabels()).get(input.track_id);
    if (!opensAt || Date.parse(opensAt) > Date.now())
      return fail(403, "relabel_not_open");
  }
  const wasAssisted = await assistedBefore(
    (r) =>
      r.kind === "track" &&
      r.track_id === input.track_id &&
      r.pass === input.pass,
  );
  return { ...input, assisted: input.assisted || wasAssisted, labeled_at };
}
