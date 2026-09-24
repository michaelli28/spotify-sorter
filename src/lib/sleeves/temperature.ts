// The one source for a category's colour temperature. Order is the lexicon's
// tie order (dusk, charge, glow, haze); the cache schema and the sleeves both
// derive from this list.
export const TEMPERATURES = ["dusk", "charge", "glow", "haze"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

// What each colour means, in plain words, drawn from the cue words the guess
// reads (lexicon.ts). The key's legend and the Colour picker both print these.
export const TEMPERATURE_MEANINGS: Record<Temperature, string> = {
  dusk: "Dark and heavy: emo, phonk, metal, heartbreak.",
  charge: "High energy: EDM, trap, hyperpop, bass.",
  glow: "Warm and upbeat: dance, soul, Latin, summer.",
  haze: "Soft and dreamy: lo-fi, acoustic, ballads.",
};
