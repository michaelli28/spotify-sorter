// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  DefinitionsError,
  definitionsSha256,
  parseDefinitions,
} from "@/src/lib/labeling/definitions";

const CATEGORIES = [
  { id: "c_dream", name: "Dream Pop" },
  { id: "c_rock", name: "Indie & Alternative Rock" },
  { id: "c_lofi", name: "Lo-Fi Hip Hop" },
];

const MD = `<!-- DRAFT: Michael edits this. -->
Tick every category this song belongs in.
Mood alone doesn't decide.

## Lo-Fi Hip Hop
**In:** dusty beats.
**Out:** Chillstep has wobble bass.

## Dream Pop
**In:** hazy vocals.

**Out:** Shoegaze is louder.
##   Indie & Alternative Rock
Guitars.
`;

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a throw");
}

describe("parseDefinitions", () => {
  it("returns definitions in the given category order, ignoring the intro", () => {
    const defs = parseDefinitions(MD, CATEGORIES);
    expect(defs.map((d) => d.id)).toEqual(["c_dream", "c_rock", "c_lofi"]);
    expect(defs[0]).toEqual({
      id: "c_dream",
      name: "Dream Pop",
      definition: "**In:** hazy vocals.\n\n**Out:** Shoegaze is louder.",
    });
    expect(defs[1]!.definition).toBe("Guitars.");
    expect(defs[2]!.definition).toBe(
      "**In:** dusty beats.\n**Out:** Chillstep has wobble bass.",
    );
    expect(JSON.stringify(defs)).not.toMatch(/DRAFT|Mood alone/);
  });

  it("accepts CRLF line endings", () => {
    const md =
      "## Dream Pop\r\nA\r\n## Indie & Alternative Rock\r\nB\r\n## Lo-Fi Hip Hop\r\nC\r\n";
    expect(parseDefinitions(md, CATEGORIES).map((d) => d.definition)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("keeps ### subheadings inside the owning section", () => {
    const md =
      "## Dream Pop\nA\n### Sub\nmore\n## Indie & Alternative Rock\nB\n## Lo-Fi Hip Hop\nC";
    expect(parseDefinitions(md, CATEGORIES)[0]!.definition).toBe(
      "A\n### Sub\nmore",
    );
  });

  it("lists every missing category and every unknown heading in one error", () => {
    const md = "## Dream pop\nA\n## Lo-Fi Hip Hop\nC\n## Vaporwave\nD\n";
    const err = errorOf(() => parseDefinitions(md, CATEGORIES));
    expect(err).toBeInstanceOf(DefinitionsError);
    expect(err.message).toContain('"Dream Pop"');
    expect(err.message).toContain('"Indie & Alternative Rock"');
    expect(err.message).toContain('"Dream pop"');
    expect(err.message).toContain('"Vaporwave"');
    expect(err.message).not.toContain('"Lo-Fi Hip Hop"');
  });

  it("matches names exactly (case and punctuation), after trimming", () => {
    const md =
      "## Dream Pop\nA\n## Indie and Alternative Rock\nB\n## Lo-Fi Hip Hop\nC";
    const err = errorOf(() => parseDefinitions(md, CATEGORIES));
    expect(err.message).toMatch(/unknown.*"Indie and Alternative Rock"/i);
    expect(err.message).toMatch(/missing.*"Indie & Alternative Rock"/i);
  });

  it("rejects a category heading that appears twice", () => {
    const md =
      "## Dream Pop\nA\n## Indie & Alternative Rock\nB\n## Lo-Fi Hip Hop\nC\n## Dream Pop\nD";
    expect(() => parseDefinitions(md, CATEGORIES)).toThrow(
      /duplicate.*"Dream Pop"/i,
    );
  });
});

describe("definitionsSha256", () => {
  it("is the sha256 hex of the markdown as utf-8", () => {
    const md = "## Indie & Alternative Rock\nné\n";
    expect(definitionsSha256(md)).toBe(
      createHash("sha256").update(Buffer.from(md, "utf-8")).digest("hex"),
    );
    expect(definitionsSha256(md + " ")).not.toBe(definitionsSha256(md));
  });
});
