// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  CUES,
  effectiveTemperature,
  guessTemperature,
} from "@/src/lib/sleeves/lexicon";
import { fnv1a32 } from "@/src/lib/sleeves/hash";
import { TEMPERATURES } from "@/src/lib/sleeves/temperature";

describe("guessTemperature", () => {
  it("reads cue words in the name", () => {
    expect(guessTemperature("Emo Rap Heartbreak", "", 0)).toBe("dusk");
    expect(guessTemperature("EDM Festival Anthems", "", 0)).toBe("charge");
    expect(guessTemperature("Tropical House Sunset", "", 0)).toBe("glow");
    expect(guessTemperature("Bedroom Pop Intimacy", "", 0)).toBe("haze");
  });

  it("matches on a leading word boundary only, case-insensitive", () => {
    // "drift" must not match inside "adrift"; "SOFT" matches "soft".
    expect(guessTemperature("Adrift", "", 1)).toBe(TEMPERATURES[1]);
    expect(guessTemperature("SOFT songs", "", 0)).toBe("haze");
    // A cue may be a word prefix: "melanchol" matches "Melancholia".
    expect(guessTemperature("Melancholia", "", 3)).toBe("dusk");
  });

  it("treats hyphenated cues literally", () => {
    expect(guessTemperature("Lo-Fi Beats", "", 0)).toBe("haze");
    expect(guessTemperature("K-Pop Hits", "", 0)).toBe("glow");
  });

  it("falls back to the description only when the name has no cue", () => {
    expect(guessTemperature("Mixed Bag", "dark and moody", 2)).toBe("dusk");
    expect(guessTemperature("Soft Mix", "dark and moody", 2)).toBe("haze");
  });

  it("falls back to the seed when neither has a cue", () => {
    for (const seed of [0, 1, 2, 3, 4, 4294967295]) {
      expect(guessTemperature("Mixed Bag", "stuff", seed)).toBe(
        TEMPERATURES[seed % 4],
      );
    }
  });

  it("breaks ties in the order dusk, charge, glow, haze", () => {
    // One dusk cue (dark) and one haze cue (dream): dusk wins.
    expect(guessTemperature("Dark Dream", "", 0)).toBe("dusk");
    // One charge (trap) and one glow (soul): charge wins.
    expect(guessTemperature("Soul Trap", "", 0)).toBe("charge");
  });

  it("counts cues, so two beat one", () => {
    // haze: dream + ethereal (2) vs dusk: dark (1).
    expect(guessTemperature("Dark Dream Ethereal", "", 0)).toBe("haze");
  });

  it("has the brief's lexicons", () => {
    expect(Object.keys(CUES)).toEqual([...TEMPERATURES]);
    expect(CUES.dusk).toContain("shoegaze");
    expect(CUES.charge).toContain("punk");
    expect(CUES.glow).toContain("celebrat");
    expect(CUES.haze).toContain("vaporwave");
    expect(Object.values(CUES).reduce((n, cues) => n + cues.length, 0)).toBe(
      18 + 22 + 17 + 23,
    );
  });
});

describe("effectiveTemperature", () => {
  const cat = { id: "abc", name: "Mixed Bag", description: "" };

  it("is the guess when there is no override", () => {
    const seed = fnv1a32("abc|Mixed Bag");
    expect(effectiveTemperature(cat)).toBe(TEMPERATURES[seed % 4]);
  });

  it("is the owner's override when there is one", () => {
    for (const t of TEMPERATURES) {
      expect(effectiveTemperature({ ...cat, temperature: t })).toBe(t);
    }
  });

  it("treats a missing description as empty", () => {
    expect(effectiveTemperature({ id: "x", name: "Dark Stuff" })).toBe("dusk");
  });
});
