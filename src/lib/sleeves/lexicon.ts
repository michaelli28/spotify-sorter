// Port of covers.py's cue lexicons and `temperature()`: the light a category
// plays in, read from cue words in its name (brief §4.1 step 2).
import { fnv1a32 } from "./hash";
import { TEMPERATURES, type Temperature } from "./temperature";

export const CUES: Readonly<Record<Temperature, readonly string[]>> = {
  dusk: [
    "dark",
    "moody",
    "brood",
    "melanchol",
    "heartbreak",
    "pain",
    "turmoil",
    "witch",
    "eerie",
    "gothic",
    "aggressive",
    "heavy",
    "metal",
    "phonk",
    "drift",
    "emo",
    "angst",
    "shoegaze",
  ],
  charge: [
    "edm",
    "festival",
    "anthem",
    "euphoric",
    "hyperpop",
    "glitch",
    "chaotic",
    "trap",
    "banger",
    "dubstep",
    "bass",
    "trance",
    "nightcore",
    "sped",
    "energy",
    "techno",
    "hypnotic",
    "epic",
    "cinematic",
    "synthwave",
    "stutter",
    "punk",
  ],
  glow: [
    "sunset",
    "tropical",
    "summer",
    "groov",
    "soul",
    "latin",
    "afro",
    "dance",
    "infectious",
    "slap",
    "k-pop",
    "j-pop",
    "global",
    "inspirational",
    "uplifting",
    "celebrat",
    "rock",
  ],
  haze: [
    "dream",
    "ethereal",
    "ambient",
    "lo-fi",
    "chill",
    "relax",
    "soft",
    "bedroom",
    "intimate",
    "acoustic",
    "folk",
    "piano",
    "neoclassical",
    "slowed",
    "reverb",
    "nostalg",
    "ballad",
    "classical",
    "gufeng",
    "introspect",
    "songwriter",
    "storytelling",
    "vaporwave",
  ],
};

// A cue matches where no letter a-z precedes it (a leading word boundary).
// One list per temperature, in TEMPERATURES order.
const PATTERNS: readonly (readonly RegExp[])[] = TEMPERATURES.map((t) =>
  CUES[t].map((cue) => new RegExp("(?<![a-z])" + cue.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"))),
);

/** Cue counts per temperature, in TEMPERATURES order. */
function score(text: string): number[] {
  const low = text.toLowerCase();
  return PATTERNS.map((cues) => cues.filter((re) => re.test(low)).length);
}

/**
 * Cue words in the name; the description only when the name has none; else
 * `TEMPERATURES[seed % 4]`. Ties go to the earlier of dusk, charge, glow, haze.
 */
export function guessTemperature(name: string, description: string, seed: number): Temperature {
  let s = score(name);
  if (Math.max(...s) === 0) s = score(description);
  const best = Math.max(...s);
  // indexOf finds the first, so a tie goes to the earlier temperature.
  return best === 0 ? TEMPERATURES[(seed >>> 0) % 4] : TEMPERATURES[s.indexOf(best)];
}

/** What a sleeve needs from a category. `temperature` is the owner's override. */
export interface SleeveSource {
  id: string;
  name: string;
  description?: string;
  temperature?: Temperature;
}

/** `fnv1a32(id + "|" + name)`: renaming reprints the sleeve on purpose. */
export function sleeveSeed(c: Pick<SleeveSource, "id" | "name">): number {
  return fnv1a32(`${c.id}|${c.name}`);
}

/** The owner's override, else the guess. */
export function effectiveTemperature(c: SleeveSource): Temperature {
  return (
    c.temperature ??
    guessTemperature(c.name, c.description ?? "", sleeveSeed(c))
  );
}
