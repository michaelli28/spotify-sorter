import { z } from "zod";

// Shapes for the labeling study (Days 3-4). Three rules shape this file:
// - The PAIRS task stays blind, absolutely: score bins live only in
//   SampleDesign, which is never served. A pair answer is worthless if the bin
//   it was drawn from was on screen.
// - The TRACK task can now be assisted. On 2026-09-21 Michael asked to see the
//   model's suggestions while labeling, with the cost stated: a track labeled
//   with the model's answer visible cannot serve as a blind label in the
//   comparison against that same model. Such rows carry `assisted: true` so the
//   analysis can separate them instead of quietly averaging them in.
// - Labels are append-only rows; the latest row per item wins in analysis.

export const LABEL_SEED = "spotifysorter-labels-2026-09-19";
// Second, separate pre-registration: the gold set for the audio-student
// comparison, drawn only from songs whose artist has no genre tags (the only
// place that claim lives). Its own seed, its own file; the first sample is
// never edited or redrawn.
export const GOLD_SEED = "spotifysorter-gold-nogenre-2026-09-19";
export const GOLD_TRACKS = 190;
export const RANDOM_TRACKS = 100;
export const PAIRS_PER_BIN = 25;
export const RELABEL_TRACKS = 30;
export const RELABEL_DELAY_MS = 48 * 60 * 60 * 1000;

// Pre-registered score bins for the stratified pairs, fixed from the
// 2026-09-18 score histogram before any label exists. `hi` is exclusive.
// "not_top5" pairs are categories outside the track's top 5 (no score).
export const PAIR_BINS = [
  { id: "not_top5", lo: null, hi: null },
  { id: "lt55", lo: 0, hi: 55 },
  { id: "55-64", lo: 55, hi: 65 },
  { id: "65-69", lo: 65, hi: 70 },
  { id: "70-74", lo: 70, hi: 75 },
  { id: "75-79", lo: 75, hi: 80 },
  { id: "80-84", lo: 80, hi: 85 },
  { id: "85plus", lo: 85, hi: 101 },
] as const;
export type PairBinId = (typeof PAIR_BINS)[number]["id"];
const PAIR_BIN_IDS = PAIR_BINS.map((b) => b.id) as [PairBinId, ...PairBinId[]];

const IsoDate = z.string().datetime();

// One model suggestion shown beside a track. `score` is the model's own 0-100
// number, surfaced because a suggestion without its confidence invites equal
// trust in a 85 and a 51.
export const SuggestionSchema = z.object({
  category_id: z.string().min(1),
  score: z.number(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const LabelPairSchema = z.object({
  pair_id: z.string().min(1),
  track_id: z.string().min(1),
  category_id: z.string().min(1),
});
export type LabelPair = z.infer<typeof LabelPairSchema>;

// data/labels/sample.json: what gets labeled. Safe to serve to the page.
export const LabelSampleSchema = z.object({
  seed: z.string(),
  created_at: IsoDate,
  random_track_ids: z.array(z.string()),
  pairs: z.array(LabelPairSchema),
  // A subset of random_track_ids, relabeled >= 48 h after its first label.
  relabel_track_ids: z.array(z.string()),
});
export type LabelSample = z.infer<typeof LabelSampleSchema>;

// data/labels/gold-sample.json: a plain uniform draw from the no-genre songs
// not already sampled. No scores enter the draw, so there is no design file.
export const GoldSampleSchema = z.object({
  seed: z.string(),
  created_at: IsoDate,
  pool: z.object({
    // Songs whose artist carries no genre tags.
    no_genre: z.number().int().min(0),
    // Of those, the ones already in sample.json (labeled there, not redrawn).
    already_sampled: z.number().int().min(0),
    eligible: z.number().int().min(0),
  }),
  track_ids: z.array(z.string()),
});
export type GoldSample = z.infer<typeof GoldSampleSchema>;

// data/labels/sample-design.json: how the pairs were drawn, for inverse-
// probability weights. Holds score bins, so the label page never reads it.
export const SampleDesignSchema = z.object({
  seed: z.string(),
  created_at: IsoDate,
  // sha256 of JSON.stringify(cache.assignments) when sampled: calibration
  // must use these exact scores.
  assignments_sha256: z.string(),
  population: z.object({
    tracks: z.number().int(),
    categories: z.number().int(),
  }),
  bins: z.array(
    z.object({
      id: z.enum(PAIR_BIN_IDS),
      // (track, category) pairs in this bin among tracks eligible for pairs.
      population_pairs: z.number().int().min(0),
      sampled: z.number().int().min(0),
    }),
  ),
  pairs: z.array(
    z.object({
      pair_id: z.string(),
      bin_id: z.enum(PAIR_BIN_IDS),
      inclusion_prob: z.number().gt(0).max(1),
    }),
  ),
});
export type SampleDesign = z.infer<typeof SampleDesignSchema>;

// What the page POSTs; the server stamps labeled_at. definitions_sha256 is the
// hash the page loaded: the server rejects it (409) if the file has changed, so
// every label is tied to the definitions actually on screen.
export const TrackLabelInputSchema = z
  .object({
    kind: z.literal("track"),
    track_id: z.string().min(1),
    pass: z.union([z.literal(1), z.literal(2)]),
    // Every category the track belongs in; empty means "fits none".
    category_ids: z.array(z.string().min(1)),
    cant_judge: z.boolean(),
    elapsed_ms: z.number().int().min(0),
    definitions_sha256: z.string().min(1),
    // Which pre-registered draw the song came from. Rows written before the
    // gold draw existed carry no field, so they default to the first sample.
    set: z.enum(["random", "gold"]).default("random"),
    // True when the model's suggestions were on screen as this was answered.
    // Defaults false so every row written before 2026-09-21 stays blind, which
    // is what they were.
    assisted: z.boolean().default(false),
  })
  .refine((l) => !l.cant_judge || l.category_ids.length === 0, {
    message: "cant_judge labels carry no categories",
  })
  .refine((l) => new Set(l.category_ids).size === l.category_ids.length, {
    message: "duplicate category_ids",
  });

export const PairLabelInputSchema = z.object({
  kind: z.literal("pair"),
  pair_id: z.string().min(1),
  answer: z.enum(["yes", "no", "cant_judge"]),
  elapsed_ms: z.number().int().min(0),
  definitions_sha256: z.string().min(1),
});

export const LabelInputSchema = z.union([
  TrackLabelInputSchema,
  PairLabelInputSchema,
]);
export type LabelInput = z.infer<typeof LabelInputSchema>;

const Stamp = z.object({ labeled_at: IsoDate });

// One line of data/labels/labels.jsonl.
export const LabelRowSchema = z.union([
  TrackLabelInputSchema.and(Stamp),
  PairLabelInputSchema.extend({
    track_id: z.string().min(1),
    category_id: z.string().min(1),
  }).and(Stamp),
]);
export type LabelRow = z.infer<typeof LabelRowSchema>;

// GET /api/label response. Categories come in cache order; the page shuffles
// them per track. `done` says an item has a label, never what the label was.
export interface LabelTrack {
  track_id: string;
  title: string;
  artist_name: string;
  genres: string[];
  // Present only when the server was asked for suggestions. Absent, not empty,
  // when there are none — so "not offered" and "offered nothing" stay distinct.
  suggestions?: readonly Suggestion[];
}
export interface LabelState {
  definitions_sha256: string;
  categories: Array<{ id: string; name: string; definition: string }>;
  random: Array<LabelTrack & { done: boolean }>;
  // The gold set: no-genre songs from the second draw. Empty when it is absent.
  gold: Array<LabelTrack & { done: boolean }>;
  pairs: Array<
    LabelTrack & { pair_id: string; category_id: string; done: boolean }
  >;
  // opens_at is null until the first-pass label exists.
  relabel: Array<LabelTrack & { done: boolean; opens_at: string | null }>;
}
