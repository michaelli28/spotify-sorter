// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Static tripwire for the blind labeling study: nothing that serves or renders
// the label page may mention model output or the sample design (score bins).
const ROOT = process.cwd();
const DIRS = ["app/label", "app/api/label", "src/components/label"];
const FILES = ["src/lib/labeling/store.ts", "src/lib/labeling/definitions.ts"];
const BANNED: Array<[string, RegExp]> = [
  ["assignments", /assignments/i],
  [".matches", /\.matches\b/],
  ["sampleDesignPath / SampleDesign", /sampleDesign/i],
  ["sample-design", /sample-design/i],
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
    "%s never references model output or the sample design",
    (_name, path) => {
      const text = readFileSync(path, "utf-8");
      const hits = BANNED.filter(([, re]) => re.test(text)).map(([n]) => n);
      expect(hits).toEqual([]);
    },
  );
});
