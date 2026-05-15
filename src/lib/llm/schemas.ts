import { z } from "zod";

export const ProposedCategorySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(280),
  example_track_ids: z.array(z.string()),
});

export const ProposeResponseSchema = z.object({
  categories: z.array(ProposedCategorySchema).min(1).max(50),
});

export const ClassifyMatchSchema = z.object({
  category: z.string().min(1),
  score: z.number().int().min(0).max(100),
});

export const ClassifyTrackSchema = z.object({
  track_id: z.string().min(1),
  matches: z.array(ClassifyMatchSchema).min(0).max(5),
  reasoning: z.string().max(280),
});

export const ClassifyResponseSchema = z.object({
  tracks: z.array(ClassifyTrackSchema).min(1),
});

export type ProposedCategory = z.infer<typeof ProposedCategorySchema>;
export type ClassifyTrack = z.infer<typeof ClassifyTrackSchema>;
