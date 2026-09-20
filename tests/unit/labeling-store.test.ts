// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendLabel,
  buildLabelState,
  readDefinitionsFile,
  readLabels,
  readSample,
  relabelOpensAt,
} from "@/src/lib/labeling/store";
import {
  RELABEL_DELAY_MS,
  type LabelRow,
  type LabelSample,
} from "@/src/lib/labeling/schema";
import type { Cache } from "@/src/lib/cache";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const labelsFile = () => join(dir, "labels", "labels.jsonl");
const SHA = "a".repeat(64);
const T0 = "2026-09-20T10:00:00.000Z";

function trackRow(over: Partial<LabelRow> = {}): LabelRow {
  return {
    kind: "track",
    track_id: "t_a",
    pass: 1,
    category_ids: ["c_dream"],
    cant_judge: false,
    elapsed_ms: 1200,
    definitions_sha256: SHA,
    set: "random",
    labeled_at: T0,
    ...over,
  } as LabelRow;
}

function pairRow(over: Partial<LabelRow> = {}): LabelRow {
  return {
    kind: "pair",
    pair_id: "p001",
    answer: "yes",
    elapsed_ms: 900,
    definitions_sha256: SHA,
    track_id: "t_c",
    category_id: "c_rock",
    labeled_at: T0,
    ...over,
  } as LabelRow;
}

describe("readSample / readDefinitionsFile", () => {
  it("return null when the file is missing", async () => {
    expect(await readSample()).toBeNull();
    expect(await readDefinitionsFile()).toBeNull();
  });

  it("parse sample.json and return definitions.md verbatim", async () => {
    const sample: LabelSample = {
      seed: "s",
      created_at: T0,
      random_track_ids: ["t_a"],
      pairs: [{ pair_id: "p001", track_id: "t_c", category_id: "c_rock" }],
      relabel_track_ids: ["t_a"],
    };
    await mkdir(join(dir, "labels"), { recursive: true });
    await writeFile(join(dir, "labels", "sample.json"), JSON.stringify(sample));
    await writeFile(join(dir, "labels", "definitions.md"), "## A\r\nx\n");
    expect(await readSample()).toEqual(sample);
    expect(await readDefinitionsFile()).toBe("## A\r\nx\n");
  });

  it("throws on a sample.json that doesn't match the schema", async () => {
    await mkdir(join(dir, "labels"), { recursive: true });
    await writeFile(join(dir, "labels", "sample.json"), '{"seed":"s"}');
    await expect(readSample()).rejects.toThrow();
  });
});

describe("labels.jsonl", () => {
  it("is empty when the file is missing", async () => {
    expect(await readLabels()).toEqual([]);
  });

  it("round-trips appended rows", async () => {
    await appendLabel(trackRow());
    await appendLabel(pairRow());
    expect(await readLabels()).toEqual([trackRow(), pairRow()]);
    const raw = await readFile(labelsFile(), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.split("\n")).toHaveLength(3);
  });

  it("throws with the line number on a line that isn't JSON", async () => {
    await mkdir(join(dir, "labels"), { recursive: true });
    await writeFile(
      labelsFile(),
      JSON.stringify(trackRow()) + "\n" + '{"kind":"track",' + "\n",
    );
    await expect(readLabels()).rejects.toThrow(/line 2/);
  });

  it("throws with the line number on a line that fails the schema", async () => {
    await mkdir(join(dir, "labels"), { recursive: true });
    const bad = { ...trackRow(), labeled_at: "yesterday" };
    await writeFile(
      labelsFile(),
      [trackRow(), pairRow(), bad].map((r) => JSON.stringify(r)).join("\n") +
        "\n",
    );
    await expect(readLabels()).rejects.toThrow(/line 3/);
  });

  it("throws on a blank line instead of skipping it", async () => {
    await mkdir(join(dir, "labels"), { recursive: true });
    await writeFile(
      labelsFile(),
      JSON.stringify(trackRow()) + "\n\n" + JSON.stringify(pairRow()) + "\n",
    );
    await expect(readLabels()).rejects.toThrow(/line 2/);
  });

  it("serializes concurrent appends into N intact lines, in call order", async () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      trackRow({
        track_id: `t_${i}`,
        category_ids: Array.from({ length: 40 }, (_, j) => `c_${i}_${j}`),
      }),
    );
    await Promise.all(rows.map((r) => appendLabel(r)));
    const lines = (await readFile(labelsFile(), "utf-8")).trimEnd().split("\n");
    expect(lines).toHaveLength(60);
    expect(lines.map((l) => JSON.parse(l).track_id)).toEqual(
      rows.map((r) => r.track_id),
    );
    expect(await readLabels()).toEqual(rows);
  });

  it("rejects an invalid row without writing it", async () => {
    const bad = { ...trackRow(), cant_judge: true } as LabelRow;
    await expect(appendLabel(bad)).rejects.toThrow();
    expect(await readLabels()).toEqual([]);
  });

  it("keeps appending after a failed append", async () => {
    // A file where the labels directory should be makes the append fail.
    await writeFile(join(dir, "labels"), "not a dir");
    await expect(appendLabel(trackRow())).rejects.toThrow();
    await rm(join(dir, "labels"));
    await appendLabel(pairRow());
    expect(await readLabels()).toEqual([pairRow()]);
  });
});

describe("relabelOpensAt", () => {
  it("is the earliest pass-1 labeled_at per track plus the delay", () => {
    const later = "2026-09-21T10:00:00.000Z";
    const opens = relabelOpensAt([
      trackRow({ labeled_at: later }),
      trackRow({ labeled_at: T0 }),
      trackRow({ track_id: "t_b", pass: 2, labeled_at: T0 }),
      pairRow(),
    ]);
    expect(opens.get("t_a")).toBe(
      new Date(Date.parse(T0) + RELABEL_DELAY_MS).toISOString(),
    );
    expect(opens.has("t_b")).toBe(false);
    expect(opens.has("t_c")).toBe(false);
  });
});

describe("buildLabelState", () => {
  const cache: Pick<Cache, "tracks" | "artists" | "categories"> = {
    tracks: {
      t_a: { artist_id: "ar_1", title: "Alpha", first_seen: T0 },
      t_b: { artist_id: "ar_2", title: "Bravo", first_seen: T0 },
      t_c: { artist_id: "ar_gone", title: "Charlie", first_seen: T0 },
    },
    artists: {
      ar_1: { name: "Artist One", genres: ["shoegaze", "dream pop"] },
      ar_2: { name: "Artist Two", genres: [] },
    },
    categories: {
      c_dream: {
        name: "Dream Pop",
        description: "desc",
        spotify_playlist_id: null,
        created_at: T0,
        example_track_ids: ["t_a"],
      },
      c_rock: {
        name: "Indie & Alternative Rock",
        description: "desc",
        spotify_playlist_id: "pl_1",
        created_at: T0,
        example_track_ids: [],
      },
    },
  };
  const sample: LabelSample = {
    seed: "s",
    created_at: T0,
    random_track_ids: ["t_b", "t_a"],
    pairs: [{ pair_id: "p001", track_id: "t_c", category_id: "c_rock" }],
    relabel_track_ids: ["t_a"],
  };
  const definitions =
    "intro\n## Indie & Alternative Rock\nGuitars.\n## Dream Pop\nHaze.\n";

  function build(labels: LabelRow[], over: Partial<typeof cache> = {}) {
    return buildLabelState({
      ...cache,
      ...over,
      sample,
      definitions,
      definitionsSha: SHA,
      labels,
    });
  }

  it("builds items in sample order with titles, artists and genres", () => {
    const state = build([]);
    expect(state.definitions_sha256).toBe(SHA);
    expect(state.categories).toEqual([
      { id: "c_dream", name: "Dream Pop", definition: "Haze." },
      {
        id: "c_rock",
        name: "Indie & Alternative Rock",
        definition: "Guitars.",
      },
    ]);
    expect(state.random).toEqual([
      {
        track_id: "t_b",
        title: "Bravo",
        artist_name: "Artist Two",
        genres: [],
        done: false,
      },
      {
        track_id: "t_a",
        title: "Alpha",
        artist_name: "Artist One",
        genres: ["shoegaze", "dream pop"],
        done: false,
      },
    ]);
    expect(state.pairs).toEqual([
      {
        pair_id: "p001",
        category_id: "c_rock",
        track_id: "t_c",
        title: "Charlie",
        artist_name: "",
        genres: [],
        done: false,
      },
    ]);
    expect(state.relabel).toEqual([
      {
        track_id: "t_a",
        title: "Alpha",
        artist_name: "Artist One",
        genres: ["shoegaze", "dream pop"],
        done: false,
        opens_at: null,
      },
    ]);
  });

  it("marks done per mode and opens the relabel window 48 h after pass 1", () => {
    const pass1 = build([trackRow({ track_id: "t_a", pass: 1 })]);
    expect(pass1.random.map((r) => r.done)).toEqual([false, true]);
    expect(pass1.relabel[0]!.done).toBe(false);
    expect(pass1.relabel[0]!.opens_at).toBe(
      new Date(Date.parse(T0) + RELABEL_DELAY_MS).toISOString(),
    );
    expect(pass1.pairs[0]!.done).toBe(false);

    const all = build([
      trackRow({ track_id: "t_a", pass: 1 }),
      trackRow({ track_id: "t_a", pass: 2 }),
      pairRow(),
    ]);
    expect(all.relabel[0]!.done).toBe(true);
    expect(all.pairs[0]!.done).toBe(true);
  });

  it("does not count a pass-2 row as a pass-1 label", () => {
    const state = build([trackRow({ track_id: "t_a", pass: 2 })]);
    expect(state.random.map((r) => r.done)).toEqual([false, false]);
    expect(state.relabel[0]).toMatchObject({ done: true, opens_at: null });
  });

  it("throws when a sampled track is missing from the cache", () => {
    const { t_c: _gone, ...tracks } = cache.tracks;
    expect(() => build([], { tracks })).toThrow(/t_c/);
  });

  it("throws when a pair names a category the cache doesn't have", () => {
    const { c_rock: _gone, ...categories } = cache.categories;
    expect(() => build([], { categories })).toThrow();
  });

  it("only accepts tracks, artists and categories from the cache", () => {
    buildLabelState({
      ...cache,
      sample,
      definitions,
      definitionsSha: SHA,
      labels: [],
      // @ts-expect-error model output must not be passable into the page state
      assignments: {},
    });
  });
});
