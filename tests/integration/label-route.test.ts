// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { GET, POST } from "@/app/api/label/route";
import {
  LabelRowSchema,
  RELABEL_DELAY_MS,
  type LabelSample,
} from "@/src/lib/labeling/schema";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const T0 = "2026-09-01T10:00:00.000Z";
// Distinctive model scores: none of these may reach the label page.
const SCORES = [93, 87, 71];

function fixtureCache() {
  const category = (name: string) => ({
    name,
    description: `${name} description`,
    spotify_playlist_id: null,
    created_at: T0,
    example_track_ids: [],
  });
  const track = (title: string, artist_id: string) => ({
    artist_id,
    title,
    first_seen: T0,
  });
  const assignment = {
    matches: [
      { category_id: "c_dream", score: SCORES[0] },
      { category_id: "c_rock", score: SCORES[1] },
      { category_id: "c_lofi", score: SCORES[2] },
    ],
    classified_at: T0,
    override: null,
  };
  return {
    version: 2,
    auth: null,
    config: {
      prefix: "x",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    artists: {
      ar_1: { name: "Artist One", genres: ["shoegaze"] },
      ar_2: { name: "Artist Two", genres: ["lo-fi beats"] },
    },
    tracks: {
      t_a: track("Alpha", "ar_1"),
      t_b: track("Bravo", "ar_2"),
      t_c: track("Charlie", "ar_1"),
      t_d: track("Delta", "ar_2"),
    },
    categories: {
      c_dream: category("Dream Pop"),
      c_rock: category("Indie & Alternative Rock"),
      c_lofi: category("Lo-Fi Hip Hop"),
    },
    assignments: {
      t_a: assignment,
      t_b: assignment,
      t_c: assignment,
      t_d: assignment,
    },
    runs: [],
    playlist_snapshots: {},
    liked_songs_fingerprint: null,
  };
}

const SAMPLE: LabelSample = {
  seed: "seed",
  created_at: T0,
  random_track_ids: ["t_b", "t_a"],
  pairs: [
    { pair_id: "p001", track_id: "t_d", category_id: "c_lofi" },
    { pair_id: "p002", track_id: "t_c", category_id: "c_dream" },
  ],
  relabel_track_ids: ["t_a"],
};

const DEFINITIONS = `<!-- DRAFT -->
Tick every category this song belongs in.

## Dream Pop
**In:** hazy.
**Out:** Shoegaze is louder.

## Indie & Alternative Rock
**In:** guitars.
**Out:** Pop Punk is faster.

## Lo-Fi Hip Hop
**In:** dusty beats.
**Out:** Chillstep has wobble.
`;
const SHA = createHash("sha256").update(DEFINITIONS).digest("hex");

const labelsDir = () => join(dir, "labels");
const labelsFile = () => join(labelsDir(), "labels.jsonl");

const GOLD = {
  seed: "gold-seed",
  created_at: T0,
  pool: { no_genre: 2, already_sampled: 0, eligible: 2 },
  track_ids: ["t_c", "t_d"],
};

async function seed(
  opts: {
    sample?: boolean;
    definitions?: string | null;
    labels?: object[];
    gold?: boolean;
  } = {},
) {
  await writeFile(join(dir, "cache.json"), JSON.stringify(fixtureCache()));
  await mkdir(labelsDir(), { recursive: true });
  if (opts.sample !== false)
    await writeFile(join(labelsDir(), "sample.json"), JSON.stringify(SAMPLE));
  if (opts.definitions !== null)
    await writeFile(
      join(labelsDir(), "definitions.md"),
      opts.definitions ?? DEFINITIONS,
    );
  if (opts.gold)
    await writeFile(
      join(labelsDir(), "gold-sample.json"),
      JSON.stringify(GOLD),
    );
  if (opts.labels)
    await writeFile(
      labelsFile(),
      opts.labels.map((l) => JSON.stringify(l) + "\n").join(""),
    );
}

function post(body: unknown, site?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (site) headers["sec-fetch-site"] = site;
  return new Request("http://127.0.0.1:3000/api/label", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function trackInput(over: Record<string, unknown> = {}) {
  return {
    kind: "track",
    track_id: "t_a",
    pass: 1,
    category_ids: ["c_dream", "c_rock"],
    cant_judge: false,
    elapsed_ms: 4200,
    definitions_sha256: SHA,
    ...over,
  };
}

function pass1Row(track_id: string, labeled_at: string) {
  return { ...trackInput({ track_id }), set: "random", labeled_at };
}

async function writtenLines(): Promise<unknown[]> {
  const raw = await readFile(labelsFile(), "utf-8").catch(() => "");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function walk(value: unknown, visit: (key: string | null, v: unknown) => void) {
  visit(null, value);
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      visit(k, v);
      walk(v, visit);
    }
}

describe("GET /api/label", () => {
  it("returns the label state", async () => {
    await seed({ labels: [pass1Row("t_a", T0)] });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.definitions_sha256).toBe(SHA);
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual([
      "Dream Pop",
      "Indie & Alternative Rock",
      "Lo-Fi Hip Hop",
    ]);
    expect(body.categories[0].definition).toBe(
      "**In:** hazy.\n**Out:** Shoegaze is louder.",
    );
    // suggestions are asserted by shape here; their contents have their own
    // tests, and pinning fixture scores in this one would just make it brittle.
    expect(body.random).toEqual([
      {
        track_id: "t_b",
        title: "Bravo",
        artist_name: "Artist Two",
        genres: ["lo-fi beats"],
        done: false,
        suggestions: expect.any(Array),
      },
      {
        track_id: "t_a",
        title: "Alpha",
        artist_name: "Artist One",
        genres: ["shoegaze"],
        done: true,
        suggestions: expect.any(Array),
      },
    ]);
    expect(body.pairs.map((p: { pair_id: string }) => p.pair_id)).toEqual([
      "p001",
      "p002",
    ]);
    expect(body.pairs[0]).toMatchObject({
      track_id: "t_d",
      category_id: "c_lofi",
      title: "Delta",
      done: false,
    });
    expect(body.relabel).toEqual([
      expect.objectContaining({
        track_id: "t_a",
        done: false,
        opens_at: new Date(Date.parse(T0) + RELABEL_DELAY_MS).toISOString(),
      }),
    ]);
  });

  // Since 2026-09-21 the TRACK queues carry the model's suggestions, by
  // request. This test now pins where that stops: the pairs queue, and the
  // sample design, stay blind.
  it("keeps the pairs queue blind while the track queues carry suggestions", async () => {
    await seed({ labels: [pass1Row("t_a", T0)] });
    const body = (await (await GET()).json()) as {
      random: Array<{ suggestions?: unknown }>;
      pairs: unknown[];
    };
    expect(body.random[0]!.suggestions).toBeDefined();

    const keys = new Set<string>();
    walk(body.pairs, (k) => {
      if (k !== null) keys.add(k);
    });
    for (const banned of ["suggestions", "score", "matches", "rank", "bin"])
      expect(keys.has(banned)).toBe(false);
    expect(JSON.stringify(body.pairs)).not.toMatch(
      /"(suggestions|score|matches|rank|bin)"/,
    );
  });

  it("never serves the sample design's score bins anywhere", async () => {
    await seed({ labels: [pass1Row("t_a", T0)] });
    const body: unknown = await (await GET()).json();
    const keys = new Set<string>();
    walk(body, (k) => {
      if (k !== null) keys.add(k);
    });
    for (const banned of ["bin", "bin_id", "inclusion_prob", "population_pairs"])
      expect(keys.has(banned)).toBe(false);
  });

  it("404s with no_sample when sample.json is missing", async () => {
    await seed({ sample: false });
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_sample" });
  });

  it("404s with no_definitions when definitions.md is missing", async () => {
    await seed({ definitions: null });
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_definitions" });
  });

  it("422s with bad_definitions when a category heading is missing", async () => {
    await seed({ definitions: "## Dream Pop\nx\n## Vaporwave\ny\n" });
    const res = await GET();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("bad_definitions");
    expect(body.message).toContain("Lo-Fi Hip Hop");
    expect(body.message).toContain("Vaporwave");
  });

  it("fails loudly on a malformed labels.jsonl", async () => {
    await seed();
    await writeFile(labelsFile(), '{"kind":\n');
    await expect(GET()).rejects.toThrow(/line 1/);
  });
});

describe("POST /api/label", () => {
  it("appends a pass-1 track label stamped with labeled_at", async () => {
    await seed();
    const before = Date.now();
    const res = await POST(post(trackInput()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const lines = await writtenLines();
    expect(lines).toHaveLength(1);
    const row = lines[0] as Record<string, unknown>;
    expect(LabelRowSchema.safeParse(row).success).toBe(true);
    // "set" and "assisted" are defaulted by the schema when the page leaves
    // them out. "assisted" defaulting to false is what keeps every row written
    // before the suggestions existed correctly marked as blind.
    expect(Object.keys(row).sort()).toEqual(
      [...Object.keys(trackInput()), "set", "assisted", "labeled_at"].sort(),
    );
    expect(row.assisted).toBe(false);
    expect(row).toMatchObject(trackInput());
    const at = Date.parse(row.labeled_at as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());

    const state = await (await GET()).json();
    expect(state.random[1]).toMatchObject({ track_id: "t_a", done: true });
  });

  it("accepts a can't-judge label with no categories", async () => {
    await seed();
    const res = await POST(
      post(trackInput({ track_id: "t_b", cant_judge: true, category_ids: [] })),
    );
    expect(res.status).toBe(200);
    expect(await writtenLines()).toEqual([
      expect.objectContaining({ track_id: "t_b", cant_judge: true }),
    ]);
  });

  it("adds the pair's track and category from the sample", async () => {
    await seed();
    const res = await POST(
      post({
        kind: "pair",
        pair_id: "p002",
        answer: "no",
        elapsed_ms: 800,
        definitions_sha256: SHA,
        // A client can't choose these: the sample decides.
        track_id: "t_a",
        category_id: "c_rock",
      }),
    );
    expect(res.status).toBe(200);
    const [row] = (await writtenLines()) as Array<Record<string, unknown>>;
    expect(LabelRowSchema.safeParse(row).success).toBe(true);
    expect(row).toMatchObject({
      kind: "pair",
      pair_id: "p002",
      answer: "no",
      track_id: "t_c",
      category_id: "c_dream",
    });
    expect(Object.keys(row!).sort()).toEqual(
      [
        "kind",
        "pair_id",
        "answer",
        "elapsed_ms",
        "definitions_sha256",
        "track_id",
        "category_id",
        "labeled_at",
      ].sort(),
    );
  });

  it("blocks cross-site posts before reading the body", async () => {
    await seed();
    const res = await POST(post(trackInput(), "cross-site"));
    expect(res.status).toBe(403);
    expect(await writtenLines()).toEqual([]);
  });

  it("400s on a body that isn't JSON or doesn't match the schema", async () => {
    await seed();
    for (const body of [
      "not json",
      trackInput({ elapsed_ms: -1 }),
      trackInput({ cant_judge: true }),
      trackInput({ category_ids: ["c_dream", "c_dream"] }),
      { kind: "pair", pair_id: "p001", answer: "maybe" },
    ]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("bad_body");
    }
    expect(await writtenLines()).toEqual([]);
  });

  it("400s on a pass-1 track outside the random set", async () => {
    await seed();
    const res = await POST(post(trackInput({ track_id: "t_c" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("not_in_sample");
  });

  it("400s on a pass-2 track outside the relabel set", async () => {
    const old = new Date(Date.now() - RELABEL_DELAY_MS * 2).toISOString();
    await seed({ labels: [pass1Row("t_b", old)] });
    const res = await POST(post(trackInput({ track_id: "t_b", pass: 2 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("not_in_sample");
  });

  it("400s on an unknown pair_id", async () => {
    await seed();
    const res = await POST(
      post({
        kind: "pair",
        pair_id: "p999",
        answer: "yes",
        elapsed_ms: 1,
        definitions_sha256: SHA,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("not_in_sample");
  });

  it("400s on a category that isn't in the cache", async () => {
    await seed();
    const res = await POST(
      post(trackInput({ category_ids: ["c_dream", "c_gone"] })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_category");
    expect(await writtenLines()).toEqual([]);
  });

  it("409s when definitions.md changed since the page loaded", async () => {
    await seed();
    const res = await POST(
      post(trackInput({ definitions_sha256: "b".repeat(64) })),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "definitions_changed" });
    expect(await writtenLines()).toEqual([]);
  });

  it("422s when a category was renamed after the page loaded", async () => {
    await seed();
    const { definitions_sha256 } = await (await GET()).json();
    // A merge keeps c_dream's id but renames it; definitions.md is untouched,
    // so the file hash still matches while c_dream's meaning has moved.
    const cache = fixtureCache();
    await writeFile(
      join(dir, "cache.json"),
      JSON.stringify({
        ...cache,
        categories: {
          ...cache.categories,
          c_dream: { ...cache.categories.c_dream, name: "Dreamy Shoegaze" },
        },
      }),
    );
    for (const body of [
      trackInput({ category_ids: ["c_dream"], definitions_sha256 }),
      {
        kind: "pair",
        pair_id: "p002",
        answer: "yes",
        elapsed_ms: 1,
        definitions_sha256,
      },
    ]) {
      const res = await POST(post(body));
      expect(res.status).toBe(422);
      const err = await res.json();
      expect(err.error).toBe("bad_definitions");
      expect(err.message).toContain("Dreamy Shoegaze");
    }
    expect(await writtenLines()).toEqual([]);
  });

  it("404s when there is no sample", async () => {
    await seed({ sample: false });
    const res = await POST(post(trackInput()));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_sample" });
  });

  describe("48 h relabel gate", () => {
    const hoursAgo = (h: number) =>
      new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
    const pass2 = () => post(trackInput({ track_id: "t_a", pass: 2 }));

    it("403s before any pass-1 label exists", async () => {
      await seed();
      const res = await POST(pass2());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "relabel_not_open" });
    });

    it("403s 47 h after the first pass-1 label", async () => {
      await seed({
        labels: [pass1Row("t_a", hoursAgo(47)), pass1Row("t_b", hoursAgo(72))],
      });
      const res = await POST(pass2());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "relabel_not_open" });
      expect(await writtenLines()).toHaveLength(2);
    });

    it("opens from the earliest pass-1 label, even if a later one exists", async () => {
      await seed({
        labels: [pass1Row("t_a", hoursAgo(49)), pass1Row("t_a", hoursAgo(1))],
      });
      const res = await POST(pass2());
      expect(res.status).toBe(200);
      const lines = (await writtenLines()) as Array<Record<string, unknown>>;
      expect(lines).toHaveLength(3);
      expect(lines[2]).toMatchObject({ track_id: "t_a", pass: 2 });
    });
  });
});

describe("the gold set", () => {
  it("is empty in the state until its own sample exists", async () => {
    await seed();
    expect((await (await GET()).json()).gold).toEqual([]);
  });

  it("is served as its own list and accepts a pass-1 label", async () => {
    await seed({ gold: true });
    const state = await (await GET()).json();
    expect(state.gold.map((g: { track_id: string }) => g.track_id)).toEqual([
      "t_c",
      "t_d",
    ]);
    // Assisted since 2026-09-21: the gold queue carries the model's ranked
    // suggestions, which is exactly what makes these rows non-blind.
    expect(state.gold[0].suggestions?.length).toBeGreaterThan(0);

    const res = await POST(
      post(trackInput({ track_id: "t_c", set: "gold" })),
    );
    expect(res.status).toBe(200);
    const [row] = (await writtenLines()) as Array<Record<string, unknown>>;
    expect(row).toMatchObject({ track_id: "t_c", set: "gold", pass: 1 });
    expect((await (await GET()).json()).gold[0]).toMatchObject({ done: true });
  });

  it("refuses a song from the other draw, and a second pass", async () => {
    await seed({ gold: true });
    const wrongSet = await POST(
      post(trackInput({ track_id: "t_a", set: "gold" })),
    );
    expect(wrongSet.status).toBe(400);
    expect((await wrongSet.json()).error).toBe("not_in_sample");

    const pass2 = await POST(
      post(trackInput({ track_id: "t_c", set: "gold", pass: 2 })),
    );
    expect(pass2.status).toBe(400);
    expect(await writtenLines()).toEqual([]);
  });

  it("refuses a gold song posted as a random-set label", async () => {
    await seed({ gold: true });
    const res = await POST(post(trackInput({ track_id: "t_c" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("not_in_sample");
  });
});
