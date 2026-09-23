import { z } from "zod";

// data/artwork.json. `url: null` = oEmbed had no usable art at `fetched_at`.
export const ArtworkEntrySchema = z.object({
  url: z.url().nullable(),
  fetched_at: z.iso.datetime(),
});

export const ArtworkSchema = z.object({
  version: z.literal(1),
  tracks: z.record(z.string(), ArtworkEntrySchema),
});

export type ArtworkEntry = z.infer<typeof ArtworkEntrySchema>;
export type Artwork = z.infer<typeof ArtworkSchema>;
