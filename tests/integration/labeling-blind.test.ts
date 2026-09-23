// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  blindTrackIds,
  filterBlind,
  isLabelStudyOpen,
} from "@/src/lib/labeling/blind";

// Every per-song list the redesign ADDS drops the labelling sample's songs, and
// the review sheet hides "Mostly" while any label item is still queued.

const ISO = "2026-09-20T00:00:00.000Z";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-blind-"));
  process.env.SORTER_DATA_DIR = dir;
  await mkdir(join(dir, "labels"), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const sample = {
  seed: "s",
  created_at: ISO,
  random_track_ids: ["r1", "r2"],
  relabel_track_ids: ["r1"],
  pairs: [{ pair_id: "p1", track_id: "q1", category_id: "c1" }],
};

const put = (name: string, body: string) =>
  writeFile(join(dir, "labels", name), body, "utf-8");

async function seedStudy(labels: object[] = []) {
  await put("sample.json", JSON.stringify(sample));
  await put("definitions.md", "Intro\n\n## Night Drive\nAfter dark.\n");
  await put(
    "labels.jsonl",
    labels.map((l) => JSON.stringify(l) + "\n").join(""),
  );
  const track = (title: string) => ({
    artist_id: "a1",
    title,
    first_seen: ISO,
  });
  await writeFile(
    join(dir, "cache.json"),
    JSON.stringify({
      version: 2,
      auth: null,
      config: {
        prefix: "✨",
        confidence_threshold: 65,
        anthropic_model: "claude-haiku-4-5-20251001",
      },
      scope: {
        included_playlist_ids: [],
        excluded_playlist_ids: [],
        include_liked_songs: true,
      },
      artists: { a1: { name: "Artist", genres: [] } },
      tracks: { r1: track("R1"), r2: track("R2"), q1: track("Q1") },
      categories: {
        c1: {
          name: "Night Drive",
          description: "",
          spotify_playlist_id: null,
          created_at: ISO,
          example_track_ids: [],
        },
      },
      assignments: {},
      runs: [],
      playlist_snapshots: {},
      liked_songs_fingerprint: null,
    }),
    "utf-8",
  );
}

const trackLabel = (track_id: string, pass: 1 | 2) => ({
  kind: "track",
  track_id,
  pass,
  category_ids: ["c1"],
  cant_judge: false,
  elapsed_ms: 1000,
  definitions_sha256: "x",
  labeled_at: ISO,
});
const pairLabel = (pair_id: string) => ({
  kind: "pair",
  pair_id,
  answer: "yes",
  elapsed_ms: 1000,
  definitions_sha256: "x",
  track_id: "q1",
  category_id: "c1",
  labeled_at: ISO,
});
const everythingDone = [
  trackLabel("r1", 1),
  trackLabel("r2", 1),
  pairLabel("p1"),
  trackLabel("r1", 2),
];

describe("blindTrackIds", () => {
  it("collects random, relabel and pair track ids from sample.json", async () => {
    await put("sample.json", JSON.stringify(sample));
    const blind = await blindTrackIds();
    expect(blind.sample).toBe("present");
    expect([...blind.ids].sort()).toEqual(["q1", "r1", "r2"]);
  });

  it("is empty, and says so, when there is no sample", async () => {
    const blind = await blindTrackIds();
    expect(blind.sample).toBe("missing");
    expect(blind.ids.size).toBe(0);
  });

  it("throws on a malformed sample rather than hiding nothing", async () => {
    await put("sample.json", JSON.stringify({ seed: "s" }));
    await expect(blindTrackIds()).rejects.toThrow();
  });

  // The gold set is labelled blind on /label too (isLabelStudyOpen counts it),
  // so a gold song under its category on home would show the model's answer.
  it("also hides the gold set's songs", async () => {
    await put("sample.json", JSON.stringify(sample));
    await put(
      "gold-sample.json",
      JSON.stringify({
        seed: "g",
        created_at: ISO,
        pool: { no_genre: 2, already_sampled: 0, eligible: 2 },
        track_ids: ["g1", "g2"],
      }),
    );
    const blind = await blindTrackIds();
    expect([...blind.ids].sort()).toEqual(["g1", "g2", "q1", "r1", "r2"]);
    expect(await filterBlind(["x1", "g1", "x2", "g2"])).toEqual(["x1", "x2"]);
  });

  it("throws on a malformed gold sample rather than hiding nothing", async () => {
    await put("sample.json", JSON.stringify(sample));
    await put("gold-sample.json", JSON.stringify({ seed: "g" }));
    await expect(blindTrackIds()).rejects.toThrow();
  });
});

describe("filterBlind", () => {
  it("drops sampled songs and keeps the rest in order", async () => {
    await put("sample.json", JSON.stringify(sample));
    expect(await filterBlind(["x3", "r1", "x1", "q1", "x2", "r2"])).toEqual([
      "x3",
      "x1",
      "x2",
    ]);
  });

  it("passes everything through when there is no sample", async () => {
    expect(await filterBlind(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("isLabelStudyOpen", () => {
  it("is closed when there is no study at all", async () => {
    expect(await isLabelStudyOpen()).toBe(false);
  });

  it("is open while nothing has been labelled", async () => {
    await seedStudy();
    expect(await isLabelStudyOpen()).toBe(true);
  });

  it("is closed once tracks, pairs and relabels are all done", async () => {
    await seedStudy(everythingDone);
    expect(await isLabelStudyOpen()).toBe(false);
  });

  it("stays open while one pair is left", async () => {
    await seedStudy(everythingDone.filter((l) => l.kind !== "pair"));
    expect(await isLabelStudyOpen()).toBe(true);
  });

  it("stays open while the 48 h relabel is still queued", async () => {
    await seedStudy(everythingDone.slice(0, 3));
    expect(await isLabelStudyOpen()).toBe(true);
  });

  it("stays open while a gold song is unlabelled", async () => {
    await seedStudy(everythingDone);
    await put(
      "gold-sample.json",
      JSON.stringify({
        seed: "g",
        created_at: ISO,
        pool: { no_genre: 1, already_sampled: 0, eligible: 1 },
        track_ids: ["r2", "q1"],
      }),
    );
    // r2 has a pass-1 label; q1 was only ever answered as a pair.
    expect(await isLabelStudyOpen()).toBe(true);
  });

  // Done-ness lives in the sample files and labels.jsonl only. The owner's
  // first edit in the review sheet after the study ends must not bring it back.
  async function editCategories(
    edit: (c: Record<string, { name: string }>) => object,
  ) {
    const path = join(dir, "cache.json");
    const cache = JSON.parse(await readFile(path, "utf-8"));
    await writeFile(
      path,
      JSON.stringify({ ...cache, categories: edit(cache.categories) }),
    );
  }

  it("stays closed when a category is renamed after the study ends", async () => {
    await seedStudy(everythingDone);
    await editCategories((c) => ({
      c1: { ...c.c1, name: "Late Drive" },
    }));
    expect(await isLabelStudyOpen()).toBe(false);
  });

  it("stays closed when a pair's category is deleted after the study ends", async () => {
    await seedStudy(everythingDone);
    await editCategories(() => ({}));
    expect(await isLabelStudyOpen()).toBe(false);
  });

  it("stays closed when definitions.md no longer matches the categories", async () => {
    await seedStudy(everythingDone);
    await put("definitions.md", "## Renamed\nx\n");
    expect(await isLabelStudyOpen()).toBe(false);
  });

  it("stays closed with a cache from another version", async () => {
    await seedStudy(everythingDone);
    await writeFile(join(dir, "cache.json"), JSON.stringify({ version: 99 }));
    expect(await isLabelStudyOpen()).toBe(false);
  });

  it("says open when it can't tell (labels.jsonl is corrupt)", async () => {
    await seedStudy(everythingDone);
    await put("labels.jsonl", "{not json\n");
    expect(await isLabelStudyOpen()).toBe(true);
  });

  it("says open when it can't tell (sample.json is malformed)", async () => {
    await seedStudy(everythingDone);
    await put("sample.json", JSON.stringify({ seed: "s" }));
    expect(await isLabelStudyOpen()).toBe(true);
  });

  it("says open when it can't tell (gold-sample.json is malformed)", async () => {
    await seedStudy(everythingDone);
    await put("gold-sample.json", "{not json");
    expect(await isLabelStudyOpen()).toBe(true);
  });
});
