import { describe, expect, it } from "vitest";
import { rulerLabels } from "@/src/components/classify/CutoffRuler";

describe("rulerLabels", () => {
  // The critic's shot: 40 to 90 were labelled and the 95 end was a bare tick.
  it("labels both ends and every ten", () => {
    expect(rulerLabels(40, 95).map((l) => l.value)).toEqual([
      40, 50, 60, 70, 80, 90, 95,
    ]);
  });

  // 90 sits five steps from 95: on a short ruler the two numbers touch.
  it("drops a ten near an end when the ruler is short", () => {
    const labels = rulerLabels(40, 95);
    expect(labels.filter((l) => !l.always).map((l) => l.value)).toEqual([90]);
    expect(labels.find((l) => l.value === 95)?.always).toBe(true);
  });

  // A saved cutoff outside 40 to 95 stretches the ruler to it.
  it("never prints a ten on top of a stretched end", () => {
    expect(rulerLabels(37, 95).map((l) => l.value)).toEqual([
      37, 50, 60, 70, 80, 90, 95,
    ]);
    expect(rulerLabels(30, 95).map((l) => l.value)).toEqual([
      30, 40, 50, 60, 70, 80, 90, 95,
    ]);
  });
});
