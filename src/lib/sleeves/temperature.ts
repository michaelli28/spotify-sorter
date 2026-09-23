// The one source for a category's colour temperature. Order is the lexicon's
// tie order (dusk, charge, glow, haze); the cache schema and the sleeves both
// derive from this list.
export const TEMPERATURES = ["dusk", "charge", "glow", "haze"] as const;
export type Temperature = (typeof TEMPERATURES)[number];
