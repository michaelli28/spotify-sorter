// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Static tripwire for the labeling study.
//
// It used to ban ALL model output from every file that serves or renders the
// label page. On 2026-09-21 Michael asked for the model's suggestions on the
// TRACK queues, so that ban is now scoped rather than absolute:
//
//   - the sample DESIGN (score bins) is still banned everywhere, with no
//     exceptions, because the PAIRS task is only worth anything blind;
//   - the classification output may be read in exactly one file, the route that
//     builds the suggestions, and nowhere else. Anywhere else is a leak.
const ROOT = process.cwd();
const DIRS = ["app/label", "app/api/label", "src/components/label"];
const FILES = ["src/lib/labeling/store.ts", "src/lib/labeling/definitions.ts"];

// The one file allowed to read the model's own output, by name.
const SUGGESTION_SOURCE = "app/api/label/route.ts";

// Banned everywhere, no exceptions: the pairs task depends on it.
const BANNED_ALWAYS: Array<[string, RegExp]> = [
  ["sampleDesignPath / SampleDesign", /sampleDesign/i],
  ["sample-design", /sample-design/i],
];

// Banned everywhere except SUGGESTION_SOURCE.
const BANNED_EXCEPT_SOURCE: Array<[string, RegExp]> = [
  ["assignments", /assignments/i],
  [".matches", /\.matches\b/],
];

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const scanned = [
  ...DIRS.flatMap((d) => filesUnder(join(ROOT, d))),
  ...FILES.map((f) => join(ROOT, f)),
];

describe("label page blindness tripwire", () => {
  it("scans the server files that must exist", () => {
    for (const f of FILES) expect(existsSync(join(ROOT, f))).toBe(true);
    expect(scanned.some((f) => f.includes(join("app", "api", "label")))).toBe(
      true,
    );
  });

  it.each(scanned.map((f) => [relative(ROOT, f), f]))(
    "%s never references the sample design (pairs stay blind)",
    (_name, path) => {
      const text = readFileSync(path, "utf-8");
      const hits = BANNED_ALWAYS.filter(([, re]) => re.test(text)).map(
        ([n]) => n,
      );
      expect(hits).toEqual([]);
    },
  );

  it.each(
    scanned
      .filter((f) => relative(ROOT, f) !== SUGGESTION_SOURCE)
      .map((f) => [relative(ROOT, f), f]),
  )("%s never reads the model's classification output", (_name, path) => {
    const text = readFileSync(path, "utf-8");
    const hits = BANNED_EXCEPT_SOURCE.filter(([, re]) => re.test(text)).map(
      ([n]) => n,
    );
    expect(hits).toEqual([]);
  });

  it("the one allowed source really is the route, and it really does read them", () => {
    const text = readFileSync(join(ROOT, SUGGESTION_SOURCE), "utf-8");
    expect(text).toMatch(/assignments/);
  });
});
