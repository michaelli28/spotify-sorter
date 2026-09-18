import { z } from "zod";

export const EXPECTED_CACHE_VERSION = 2;

const ISODate = z.string().datetime();

export const ConfigSchema = z.object({
  prefix: z.string().min(1).max(8),
  confidence_threshold: z.number().int().min(0).max(100),
  anthropic_model: z.string().min(1),
});

export const ScopeSchema = z.object({
  included_playlist_ids: z.array(z.string()),
  excluded_playlist_ids: z.array(z.string()),
  include_liked_songs: z.boolean(),
});

export const AuthSchema = z
  .object({
    refresh_token: z.string(),
    expires_at: ISODate,
  })
  .nullable();

export const ArtistSchema = z.object({
  name: z.string(),
  genres: z.array(z.string()),
});

export const TrackSchema = z.object({
  artist_id: z.string(),
  title: z.string(),
  first_seen: ISODate,
});

export const CategorySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  spotify_playlist_id: z.string().nullable(),
  created_at: ISODate,
  example_track_ids: z.array(z.string()).default([]),
});

export const MatchSchema = z.object({
  category_id: z.string(),
  score: z.number().int().min(0).max(100),
});

export const OverrideSchema = z
  .object({
    category_id: z.string(),
    set_at: ISODate,
  })
  .nullable();

export const AssignmentSchema = z.object({
  matches: z.array(MatchSchema).min(1).max(5),
  classified_at: ISODate,
  override: OverrideSchema,
});

export const PlaylistSnapshotSchema = z.object({
  snapshot_id: z.string(),
  fetched_at: ISODate,
  track_count: z.number().int().min(0),
});

export const LikedSongsFingerprintSchema = z
  .object({
    total: z.number().int().min(0),
    latest_added_at: z.string().nullable(),
    fetched_at: ISODate,
  })
  .nullable();

export const RunSchema = z.object({
  run_id: z.string(),
  type: z.enum(["propose", "classify"]).optional(),
  started_at: ISODate,
  completed_at: ISODate.nullable(),
  tracks_classified: z.number().int().min(0),
  tracks_total: z.number().int().min(0),
  cost_usd: z.number().min(0),
  summary: z.string(),
  skipped: z.array(z.string()).optional(),
});

export const CacheSchema = z.object({
  version: z.literal(EXPECTED_CACHE_VERSION),
  auth: AuthSchema,
  config: ConfigSchema,
  scope: ScopeSchema,
  artists: z.record(z.string(), ArtistSchema),
  tracks: z.record(z.string(), TrackSchema),
  categories: z.record(z.string(), CategorySchema),
  assignments: z.record(z.string(), AssignmentSchema),
  runs: z.array(RunSchema),
  playlist_snapshots: z.record(z.string(), PlaylistSnapshotSchema),
  liked_songs_fingerprint: LikedSongsFingerprintSchema,
});

export type Cache = z.infer<typeof CacheSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Artist = z.infer<typeof ArtistSchema>;
