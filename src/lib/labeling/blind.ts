import { readGoldSample, readLabels, readSample } from "./store";

export interface BlindTrackIds {
  ids: ReadonlySet<string>;
  /** "missing" = no sample.json, so nothing is hidden. */
  sample: "present" | "missing";
}

// Songs in the pre-registered labelling sample. Lists the redesign adds (home
// crate records, diff arrivals) drop these so the labeller never meets them
// beside a category. A malformed sample throws: better a failed list than one
// that quietly shows every sampled song.
export async function blindTrackIds(): Promise<BlindTrackIds> {
  const sample = await readSample();
  if (!sample) return { ids: new Set(), sample: "missing" };
  return {
    ids: new Set([
      ...sample.random_track_ids,
      ...sample.relabel_track_ids,
      ...sample.pairs.map((p) => p.track_id),
    ]),
    sample: "present",
  };
}

export async function filterBlind(ids: readonly string[]): Promise<string[]> {
  const { ids: blind } = await blindTrackIds();
  return ids.filter((id) => !blind.has(id));
}

// True while any queued label item (random, gold, pairs, relabel) has no label.
// Done-ness comes only from the sample files and labels.jsonl, by the same rule
// buildLabelState marks items done (pass 1 for random and gold, pass 2 for
// relabel, pair_id for pairs). It never reads definitions or category names,
// so renaming or deleting a category after the study ends can't reopen it.
// No sample = no study = false. A file it can't read or parse = true.
export async function isLabelStudyOpen(): Promise<boolean> {
  try {
    const sample = await readSample();
    if (!sample) return false;
    const [gold, labels] = await Promise.all([readGoldSample(), readLabels()]);
    const labelled = (pass: 1 | 2) =>
      new Set(
        labels.flatMap((r) =>
          r.kind === "track" && r.pass === pass ? [r.track_id] : [],
        ),
      );
    const pass1 = labelled(1);
    const pass2 = labelled(2);
    const pairs = new Set(
      labels.flatMap((r) => (r.kind === "pair" ? [r.pair_id] : [])),
    );
    return (
      [...sample.random_track_ids, ...(gold?.track_ids ?? [])].some(
        (id) => !pass1.has(id),
      ) ||
      sample.relabel_track_ids.some((id) => !pass2.has(id)) ||
      sample.pairs.some((p) => !pairs.has(p.pair_id))
    );
  } catch {
    return true;
  }
}
