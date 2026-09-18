import { z } from "zod";

export const ProposedCategorySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(280),
  example_track_ids: z
    .array(z.string())
    .transform((ids) => Array.from(new Set(ids))),
});

export const ProposeResponseSchema = z.object({
  categories: z.array(ProposedCategorySchema).min(1).max(50),
});

// Shape only: per-track checks (known number, score range, known category,
// at most 5 matches) happen in parseBatch so one bad row can't sink a batch.
export const ClassifyMatchSchema = z.object({
  category: z.string(),
  score: z.number(),
});

export const ClassifyTrackSchema = z.object({
  n: z.number(),
  matches: z.array(ClassifyMatchSchema),
});

export const ClassifyResponseSchema = z.object({
  tracks: z.array(ClassifyTrackSchema),
});

export type ProposedCategory = z.infer<typeof ProposedCategorySchema>;
export type ClassifyTrack = z.infer<typeof ClassifyTrackSchema>;
