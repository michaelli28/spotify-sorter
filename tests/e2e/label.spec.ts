import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CacheSchema } from "@/src/lib/cache/schema";
import { LabelRowSchema, LabelSampleSchema } from "@/src/lib/labeling/schema";

// Runs after happy-path.spec.ts in the same server data dir, so it replaces
// cache.json with its own fixture. Scores are distinctive so a leak is findable.
const DATA_DIR = process.env.SORTER_E2E_DATA_DIR;
const AT = "2026-09-19T00:00:00.000Z";
const SCORES = [93, 87, 71, 58, 44];

const cache = CacheSchema.parse({
  version: 2,
  auth: null,
  config: {
    prefix: "e2e",
    confidence_threshold: 65,
    anthropic_model: "claude-haiku-4-5-20251001",
  },
  scope: {
    included_playlist_ids: [],
    excluded_playlist_ids: [],
    include_liked_songs: true,
  },
  artists: {
    "e2e-a1": { name: "The Lamplighters", genres: ["dream pop", "shoegaze"] },
    "e2e-a2": { name: "Porch Light", genres: ["emo"] },
  },
  tracks: {
    "e2e-t1": { artist_id: "e2e-a1", title: "Lamp Light", first_seen: AT },
    "e2e-t2": { artist_id: "e2e-a2", title: "Porch Song", first_seen: AT },
    "e2e-t3": { artist_id: "e2e-a1", title: "Low Tide", first_seen: AT },
  },
  categories: {
    "e2e-c1": category("Dream Pop"),
    "e2e-c2": category("Midwest Emo"),
    "e2e-c3": category("Ambient Dark"),
  },
  assignments: {
    "e2e-t1": assigned([
      ["e2e-c1", SCORES[0]!],
      ["e2e-c3", SCORES[3]!],
    ]),
    "e2e-t2": assigned([["e2e-c2", SCORES[1]!]]),
    "e2e-t3": assigned([
      ["e2e-c3", SCORES[2]!],
      ["e2e-c1", SCORES[4]!],
    ]),
  },
  runs: [],
  playlist_snapshots: {},
  liked_songs_fingerprint: null,
});

const sample = LabelSampleSchema.parse({
  seed: "e2e",
  created_at: AT,
  random_track_ids: ["e2e-t1", "e2e-t2"],
  pairs: [{ pair_id: "p001", track_id: "e2e-t3", category_id: "e2e-c2" }],
  relabel_track_ids: ["e2e-t1"],
});

const definitions = [
  "Tick every category this song belongs in.",
  "",
  "## Dream Pop",
  "**In:** hazy, reverb-soaked pop.",
  "**Out:** noise walls go to Shoegaze.",
  "",
  "## Midwest Emo",
  "**In:** twinkly guitars, confessional vocals.",
  "**Out:** bright, fast hooks go to Pop Punk.",
  "",
  "## Ambient Dark",
  "**In:** slow, dark drones.",
  "**Out:** anything with a beat.",
  "",
].join("\n");

function category(name: string) {
  return {
    name,
    description: `${name} description`,
    spotify_playlist_id: null,
    created_at: AT,
    example_track_ids: [],
  };
}

function assigned(matches: Array<[string, number]>) {
  return {
    matches: matches.map(([category_id, score]) => ({ category_id, score })),
    classified_at: AT,
    override: null,
  };
}

function walk(v: unknown, keys: Set<string>, numbers: number[]): void {
  if (typeof v === "number") numbers.push(v);
  else if (Array.isArray(v)) for (const x of v) walk(x, keys, numbers);
  else if (v !== null && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      keys.add(k);
      walk(x, keys, numbers);
    }
  }
}

test.beforeAll(() => {
  if (!DATA_DIR) throw new Error("SORTER_E2E_DATA_DIR is unset");
  const labels = join(DATA_DIR, "labels");
  mkdirSync(labels, { recursive: true });
  writeFileSync(join(DATA_DIR, "cache.json"), JSON.stringify(cache, null, 2));
  writeFileSync(join(labels, "sample.json"), JSON.stringify(sample, null, 2));
  writeFileSync(join(labels, "definitions.md"), definitions);
  rmSync(join(labels, "labels.jsonl"), { force: true });
});

test("label: blind state, tick two, save, row on disk", async ({ page }) => {
  // The embed is a third-party page; no real network in tests.
  await page.route("https://open.spotify.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "" }),
  );
  const isLabelApi = (url: string) => new URL(url).pathname === "/api/label";
  const stateResponse = page.waitForResponse(
    (r) => isLabelApi(r.url()) && r.request().method() === "GET",
  );

  await page.goto("/label");

  const state: unknown = await (await stateResponse).json();
  const keys = new Set<string>();
  const numbers: number[] = [];
  walk(state, keys, numbers);
  for (const banned of ["score", "matches", "rank", "bin", "assignments"]) {
    expect(keys.has(banned), `GET /api/label has key "${banned}"`).toBe(false);
  }
  expect(numbers.filter((n) => SCORES.includes(n))).toEqual([]);

  await expect(page.getByRole("heading", { name: "Lamp Light" })).toBeVisible();
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(new RegExp(`\\b(${SCORES.join("|")})\\b`));

  await page.getByRole("checkbox", { name: "Ambient Dark" }).check();
  await page.getByRole("checkbox", { name: "Dream Pop" }).check();
  const saved = page.waitForResponse(
    (r) => isLabelApi(r.url()) && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Porch Song" })).toBeVisible();

  const lines = readFileSync(join(DATA_DIR!, "labels", "labels.jsonl"), "utf-8")
    .trim()
    .split("\n");
  expect(lines).toHaveLength(1);
  const row = LabelRowSchema.parse(JSON.parse(lines[0]!));
  expect(row).toMatchObject({
    kind: "track",
    track_id: "e2e-t1",
    pass: 1,
    // Cache order, not the order they were ticked or shown in.
    category_ids: ["e2e-c1", "e2e-c3"],
    cant_judge: false,
    definitions_sha256: createHash("sha256").update(definitions).digest("hex"),
  });
  expect(Number.isInteger(row.elapsed_ms)).toBe(true);
  expect(Date.parse(row.labeled_at)).not.toBeNaN();
});
