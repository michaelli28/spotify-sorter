# Ears — results

Train a probe on frozen music-encoder embeddings of 30-second previews, and see how much of Claude's playlist
labelling audio can reproduce.

Evidence class for every number below: **(b) local run** — scripts executed on this machine over audio fetched
live from the official CDNs; nothing here was re-run against a live external scorer. Numbers are read from
artifacts under `ml/artifacts/`, with the file and key named. **Those artifacts were read, not re-executed for
this document**, and none of them pins a git commit or an embeddings sha (§10). A figure recomputed from source
rather than read from an artifact says so.

---

## 🧑 In Plain English

**What this does:** teaches a small model to guess which of 41 mood playlists a song belongs to by listening to a
30-second clip, using Claude's own playlist picks as the answer key.

**Why it matters:** for 1,850 of the 2,875 songs (64%) the artist carries no genre tag at all (`data/cache.json`),
so Claude had nothing but "title — artist" to go on — it never heard them. If audio can reproduce those picks, the
library can be sorted from sound instead of from a song's name.

**What's new under the hood:** two music encoders (systems that turn audio into numbers) measured head-to-head on
the same songs, and a run against a shared public test set to check the machinery against someone else's
published number.

**What we cannot say:** the original claim — "a model that listens beats a model that reads" — is **not available
from this data**. The hand-labelling was done with Claude's answers on screen and one click accepted all of them
at once, so the hand labels are copies of Claude's. That comparison is unrecoverable without re-labelling with
Claude's answers hidden.

---

## The headline

**The project is teacher–student distillation.** Claude's labels are the target, not truth. Claude agrees with
itself only ~60% of the time on the same recording, so the target is noisy.

**Audio reproduces Claude's top pick 37.8% of the time on artists the model has never seen**, against a text-only
baseline of 14.5% and a most-common-category baseline of 17.4%. The teacher agrees with itself 60.5% of the time
— which is a **floor** on what is achievable, not a ceiling (§6). Full table under Results below.

n = 2,625 recordings, 1,332 artists, 5 artist-grouped folds (`cv-oof-run.json`), over 41 categories
(`ml/train.py:42`, `data/cache.json`; the cv artifacts record no category count). The ± is the **population std
(ddof=0) across the 5 folds** (`ml/train.py:334`) — not a confidence interval, not a standard error.

**The independent check.** Running the same probe on MTG-Jamendo split 0 at the layer the MERT-v2-30s model card
used:

| metric      | this pipeline | published (card) | delta       |
| ----------- | ------------- | ---------------- | ----------- |
| macro AUROC | 0.7822        | 0.7944           | **−0.0122** |
| macro AP    | 0.16688       | 0.16677          | +0.00012    |

No tolerance was pre-registered anywhere, and both are single-seed, single-split point estimates with no interval
from a run that stopped at `best_epoch: 2` of a 20-epoch budget — so the fourth-decimal AP agreement is a
coincidence-sized margin, not a demonstrated reproduction. Source
`ml/artifacts/jamendo/probe-mert2-layer15.json` `.results["15"]` vs `.published`. 4,231 of 4,231 test tracks
embedded; `manifest.json` recorded `zero_positive_tags: []` over the 56 tags when the manifest was built (the
probe run does not re-check it), so nothing is silently dropped from the macro.

---

## What this does NOT show

**1. The gold set is circular, totally.** Every one of the 251 gold rows was answered with Claude's ranked
suggestions on screen (`assisted: true`). CONFIRMED, both halves, with zero exceptions:

- 290 of 290 track labels are _exactly_ Claude's top-5 — same five categories, every time, ticked-set size
  distribution `{5: 290}`.
- 198 of 198 assisted pair answers are exactly `(score >= 65)` — the model's own live cut-off. The one usable
  blind pair agrees too, making it 199/199 usable.
- `gold-results.json` `.blind_claim = false`, `.blind = {songs: 0, artists: 0}`. Claude's top-1 on the gold table
  is `1.0`. That is a tautology — Claude scored against copies of itself — not a result.

**2. The 30-song relabel pass does not repair it.** CONFIRMED by code:

- The queue is **30**, not ~290 (`src/lib/labeling/schema.ts:25`, `data/labels/sample.json .relabel_track_ids`).
  Each opens 48 h after that song's own first label (`src/lib/labeling/store.ts:88-101`), so they open in a
  rolling window on 2026-09-23: the first at **04:11:05Z**, the last at **04:40:16Z**. None is open yet.
- A pass-2 row lands in **no headline tier** — `ml/score-gold.py:159-169` `continue`s out at `:169`, before
  `assisted` and `exposed` are populated at `:170-173`, and the `virgin`/`reblind`/`assisted` tiers are pass-1
  only.
- Only 21 of the 30 are inside the 251-song gold set (20 eligible); the other 9 are dropped by the filter at
  `ml/score-gold.py:147`. Best case from that pass is a 21-song self-agreement estimate.
- The server ships `suggestions` on **every** GET including relabel (`app/api/label/route.ts:117`,
  `src/lib/labeling/store.ts:208-212`); blindness is a render decision in `TrackLabeler.tsx`, not a wire guarantee.
  Evidence class **(b)**, not just code reading: `tests/e2e/label.spec.ts:138` asserts the label API emits no
  `score`/`matches`/`rank`/`bin`/`assignments` key, and it **fails** — `GET /api/label has key "score"`. That
  guard could not run between 2026-09-19 21:26 (when `ml/venv` broke `next build`, fixed in `caa8502`) and
  2026-09-22, so the assisted-labelling feature that contradicts it shipped ~27 h into that window.
- Fixed in `869724d`, before any relabel was written: `prior_exposure` was matched per-pass, so a relabel
  would have been stamped never-exposed. The match is now on the song, pinned by two tests.

**The recovery path** is re-POSTing **pass 1** with the suggestions hidden: allowed for all 100 random + 190 gold
ids with no time gate, the server stamps `prior_exposure: true` (`route.ts:249-257`), and the row lands in the
`reblind` tier which can carry the headline. Covered by a passing test,
`tests/integration/label-route.test.ts:295-308` — evidence class **(a): integration test over a mocked
filesystem**, never exercised against the real `labels.jsonl`. Capacity: 242 eligible songs / 189 artists, against
gates of 20 songs / 10 artists.

**3. The encoder delta is a point estimate with no interval.** `encoder-comparison.json` holds two scalars and no
CI; per-track logits are never saved (`ml/bench/probe-jamendo.py:502` writes five scalars per layer), so the delta
cannot be bootstrapped from what is on disk. The layer curve is also flat — layer 11 beats layer 22 by **0.00013**
validation AUROC on one seed, and layers 7–23 span 0.0070 (0.74053 at layer 13 to 0.74748 at layer 11). Had the
card layer 15 been selected, the delta would read **+0.0206** instead of +0.0252. To get a CI, re-run the probe
with per-track test logits persisted.

**4. The artist-average baseline is mis-described and mis-thresholded.**

- It is an **un-normalised sum** of rank weights over the artist's other songs (`ml/score-gold.py:350-352`), not an
  average; `ml/GOLD-PROTOCOL.md:99` says "average". Each other song adds 5+4+3+2+1, so a row totals 15 to 315
  across the 174 songs whose artist has other songs — and a flat 2,875 for the 68 that silently fall back to the
  global prior. Two score scales under one global cut.
- Its top-1 is a blend of those two models: **82.8%** (144/174) where the artist genuinely has other songs and
  **52.9%** (36/68) where it falls back. `ml/score-gold.py:619-620` logs the 174/242 count only; the accuracy
  split is neither logged nor written to `gold-results.json` — both figures here are recomputed ad hoc.
- The "collapse at equal volume" compares different denominators: at the matched cut of 68.0, **163 of 242 songs
  select nothing at all** and are dropped, so the artist-average figure is a mean over the 79 that remain while
  the student's is a mean over 239. Both are means of per-song precision _fractions_ (`ml/score-gold.py:300-312`),
  not hit counts — the 79 fractions happen to sum to 26.0, but only **11** of those 79 songs are fully right. The
  global prior scores over all 242 and beats artist-average (table below). ASSUMED cause: a single global score
  cut is mis-specified for an un-normalised score (§3.3 was pre-registered for the student, not for this
  baseline). Not evidence that artist identity carries no signal.

**5. The text-only headline is epoch-dependent, and both values sit under the prior.** 14.5% ± 1.7 at 500 epochs,
**15.8% ± 1.9** at 600 (`cv-oof-run-600ep.json`); every text-only metric differs between the runs, and the quoted
14.5% is the lower of the two. Both are below the trivial 17.4% majority prior, so text-only is not "the baseline
to beat". MERT-v2 is bit-identical across both runs — ASSUMED cause: early stopping halts it well before epoch 500
(`ml/train.py:211-221`); no artifact records the stopping epoch, so this is unproven.

**6. "Ceiling" is the wrong word — 60.5% is a floor.** CONFIRMED, and it inverts a claim made elsewhere in
this project's notes. Model the recorded label for a song as a draw from Claude's distribution `p`. Then
self-agreement between two draws is `E[Σp²]` = 0.605, while the best any predictor could score against a
single drawn label is `E[max p]`. Since `Σp² ≤ max p` pointwise, **`E[max p] ≥ 0.605`** — the self-agreement
number bounds the achievable maximum from _below_. ASSUMED refinement: treating each disagreeing pair as an
even split between two categories estimates `E[max p] ≈ 0.605 + 0.395/2 = 0.8025`, so 37.8% is nearer **47%**
of achievable than the 62% that dividing by 60.5% suggests. Do not say "62% of the ceiling".

**7. The teacher self-agreement figure is directional, and it is not a re-labelling experiment.** 60.5% is symmetric
(`top1_identical`); 89.1% is one-way (representative's top-1 inside the twin's top-3) and 84.9% the other way —
that reverse figure and the recording count below are recomputed from `data/cache.json`, not stored
(`.teacher_ceiling` carries only `pairs`, `top1_identical`, `top1_in_other_top3`). It is 119 pairs over **116**
recordings, not 119 recordings — the same recording appearing twice under two Spotify ids during the normal
labelling run. Titles are byte-identical on **106 of the 119** pairs, so what differs across a pair is request
position, not title context; this does not bound title-context-invariant reproducibility. The code comments said
"119 recordings"; corrected in `97de3fe`.

**8. "Coverage 100%" is tracks, not clips.** All 4,231 test tracks are embedded, so the macro is unaffected, but
the probe and the manifest disagree on clip counts (test 29,284 vs 29,290; train 68,619 vs 68,663; validation
24,892 vs 24,903).

**9. The published baseline was not re-derived.** `0.7944093942642212` / `0.16676680743694305` exist only as
hard-coded constants at `ml/bench/probe-jamendo.py:78`, sourced in the docstring to MARBLE's `marble_results.json`.
That upstream file is not in this repo; only the constant's flow into the artifacts was verified.

**10. No artifact pins its inputs.** No cv-\*.json records a git commit, an embeddings sha, or a `data/cache.json`
hash (`ml/train.py:274` calls `load()` without `require_sha`).

---

## Results

### Teacher agreement, 5-fold artist-grouped CV

Artist-grouped everywhere — outer folds and the inner early-stopping split (`ml/train.py:275`, `:311`), verified
empirically (`artists split across folds (must be 0): 0`). Feature standardisation uses train-fold stats only.

| model                                        | top-1           | top-1 in top-3               | per-fold top-1                   |
| -------------------------------------------- | --------------- | ---------------------------- | -------------------------------- |
| MERT-v2-30s (24×1024)                        | **37.8% ± 2.2** | 61.0% ± 2.3                  | 38.9 / 36.0 / 40.2 / 39.2 / 34.5 |
| TEXT-ONLY (CLAP text), 500 ep                | 14.5% ± 1.7     | 31.8%                        | —                                |
| TEXT-ONLY (CLAP text), 600 ep                | 15.8% ± 1.9     | 32.6%                        | —                                |
| prior (most common category)                 | 17.4%           | 38.9%                        | —                                |
| teacher self-agreement (119 pairs / 116 recs) | 60.5% (a floor, §6)           | 89.1% one-way, 84.9% reverse | —                                |

`ml/artifacts/cv-oof-run.json`, `cv-oof-run-600ep.json`.

### Gold set — ASSISTED, not a blind comparison

| model                                  | top-1 (n=242) | precision at equal volume | songs the precision covers |
| -------------------------------------- | ------------- | ------------------------- | -------------------------- |
| Claude (teacher)                       | 1.000         | —                         | —                          |
| student (audio, held-out artist)       | 75.2%         | 59.2% (cut 1.88)          | 239 of 242                 |
| artist-average (sum of teacher labels) | 74.4%         | 32.9% (cut 68.0)          | **79 of 242**              |
| global prior                           | —             | 44.5%                     | 242 of 242                 |

`ml/artifacts/gold-results.json` `.table[]`, `.volume_matched[]`. Equal volume = the single global cut that files
the same 3.9959 playlists/song that Claude's live `score >= 65` rule files — except the global prior, whose scores
are identical on every row, so it cannot land below 4.0 and files marginally more. Gold set: 251 songs (190
gold-sample + 61 no-genre random), 242 eligible, 193 artists over the 251 / 189 over the 242. Student scores come
from `oof.npz` — every row scored by the fold that never saw its artist (`ml/train.py:263-266`).

### Encoder comparison — MERT-v1-95M vs MERT-v2-30s

Layer chosen on **validation**, read once on test (`ml/bench/compare-encoders.py:39`, comment: "Selected on
validation. Never on test."). Corroboration that this was not test-peeking: the test-AUROC argmax is a different
layer for both encoders (v1 layer 6, v2 layer 17), and neither was reported.

| encoder     | layers    | selected layer | val AUROC | test AUROC  | test AP |
| ----------- | --------- | -------------- | --------- | ----------- | ------- |
| MERT-v1-95M | 13 × 768  | 7              | 0.7410    | 0.7616      | 0.1333  |
| MERT-v2-30s | 24 × 1024 | 11             | 0.7475    | 0.7869      | 0.1629  |
| delta       |           |                |           | **+0.0252** | +0.0296 |

`ml/artifacts/jamendo/encoder-comparison.json`. Identical test split for both — `.coverage` is dict-equal across
the two probe files (4,231/4,231 tracks, 29,284 clips), and `.protocol` is byte-identical. The script hard-exits
on a partial sweep. Re-running `bench/compare-encoders.py` rewrote the artifact byte-for-byte identically.

### Benchmark reproduction — MTG-Jamendo split 0, top-56 tags

Deltas in The headline above. Layer 15 = the card's `hidden_state_index`; test set 4,231 tracks / 29,284 clips.

Protocol (`ml/bench/probe-jamendo.py`): hidden 512, dropout 0.2, lr 1e-3, batch 32, max 20 epochs,
ReduceLROnPlateau(max, 0.5, 3), early-stop patience 10, seed 1234, CPU. Train per clip, evaluate per file by
averaging clip **logits** before the metric — that asymmetry is the reproducibility detail.

Layer 15 is the card's layer, used for card comparison. This project's own validation-based selection picks layer
11 for MERT-v2 (see above); layer 15 ranks **11th of 24** on validation (0.74326, against 0.74748 at layer 11) —
inside the flat band, not near the top of it. Both are true, they answer different questions. `mert1` deliberately
has no published-number entry: two conflicting published values (76.4 in MARBLE Table 4 vs 77.5 in M2D-CLAP
Table III) plus a genuine hidden-state off-by-one (13 states for 12 layers).

### Build health

Re-run 2026-09-21 at `f5ee7de`:

| check              | result                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `npx vitest run`   | 381 passed / 63 files, 0 failed                                                             |
| `npx tsc --noEmit` | exit 0, no output                                                                           |
| `npm run lint`     | **broken** — `next lint` under Next 16.3.0-canary.19: "Invalid project directory ... /lint" |
| `npx eslint .`     | 14 errors / 78 warnings; 13 errors / 5 warnings excluding the gitignored `ml/venv`          |

Working invocation: `npx eslint . --ignore-pattern 'ml/venv/**' --ignore-pattern 'coverage/**'`. All 8
error-bearing tracked files have zero commits since `4af7d53`.

---

## How to reproduce

Read the headline numbers back (no compute):

```bash
cd /Users/possible/Documents/SpotifySorter/ml
jq '{n_recordings, n_artists, teacher_ceiling,
     prior: .baselines["prior (most common category)"].top1_agree,
     mert2: .results["mert2-30s"].mean_std,
     text:  .results["TEXT-ONLY (clap text)"].mean_std.top1_agree,
     epochs: .config.epochs}' artifacts/cv-oof-run.json
jq '{student_top1: .table[1].top1, artist_avg_top1: .table[3].top1,
     vol: [.volume_matched[] | {model, cut, precision, per_song}],
     blind_claim, blind, assisted: .labels.assisted_pass1}' artifacts/gold-results.json
jq '{claimed_auroc: .results["15"].test_auroc, claimed_ap: .results["15"].test_ap,
     best_epoch: .results["15"].best_epoch, published, coverage}' \
  artifacts/jamendo/probe-mert2-layer15.json
# layer ranking on validation — layer 15 comes out 11th
jq -r '[.results | to_entries | sort_by(-.value.val_auroc)[].key] | to_entries
       | map("\(.key+1): layer \(.value)") | join("  ")' \
  artifacts/jamendo/probe-mert2-alllayers.json
```

Dataset stats, artist-grouped split integrity, teacher ceiling (read-only, ~20s):

```bash
cd /Users/possible/Documents/SpotifySorter/ml && ./venv/bin/python dataset.py
```

Gold-set membership (251 / 242 / 193) and the circularity, recomputed from source rather than read from the
artifact:

```bash
cd /Users/possible/Documents/SpotifySorter
ml/venv/bin/python ml/gold_set.py
ml/venv/bin/python - <<'EOF'
import json, collections
rows=[json.loads(l) for l in open('data/labels/labels.jsonl') if l.strip()]
print(collections.Counter((r.get('kind'), r.get('assisted','<none>')) for r in rows))
asg=json.loads(open('data/cache.json').read())['assignments']
latest={}
for r in sorted([x for x in rows if x.get('kind')=='track'], key=lambda r:r['labeled_at']):
    latest[(r['track_id'], int(r.get('pass',1)))]=r
eq=sum(set(r['category_ids'])=={m['category_id'] for m in asg[t]['matches'][:5]} for (t,p),r in latest.items())
print('track labels == claude top5:', eq, 'of', len(latest))
EOF
```

Encoder comparison (deterministic from the two probe JSONs; rewrites `encoder-comparison.json` in place):

```bash
cd /Users/possible/Documents/SpotifySorter/ml && venv/bin/python bench/compare-encoders.py
```

Sweep integrity — part counts, duplicate ids, clip totals, embedding shapes:

```bash
cd /Users/possible/Documents/SpotifySorter/ml/artifacts/jamendo
ls emb/mert1-*.npz | wc -l; ls emb/mert2-*.npz | wc -l; du -sh emb
for f in sweep-mert1.log sweep-mert2.log; do
  echo "$f: $(grep -cE '^part [0-9]+:' $f) part lines, $(grep -c 'sha256 mismatch' $f) sha mismatches"
done
```

Full regeneration (destructive — overwrites the artifacts under verification):

```bash
# Phase 2 headline, ~6 min CPU; overwrites cv-oof-run.json and oof.npz
cd /Users/possible/Documents/SpotifySorter/ml && ./venv/bin/python train.py --device cpu \
  --epochs 500 --folds 5 --only "mert2-30s,TEXT-ONLY (clap text)" --out cv-oof-run.json --oof-out oof.npz

# Jamendo probes; needs the ~122k embedded clips under artifacts/jamendo/emb/, CPU, slow
./venv/bin/python bench/probe-jamendo.py --encoder mert2 --layer 15 --device cpu \
  --out artifacts/jamendo/probe-mert2-layer15.json
./venv/bin/python bench/probe-jamendo.py --encoder mert2 --layer all --device cpu \
  --out artifacts/jamendo/probe-mert2-alllayers.json

# Gold table; overwrites gold-results.json
./venv/bin/python score-gold.py --oof oof.npz
```

Build checks:

```bash
cd /Users/possible/Documents/SpotifySorter
npx vitest run; npx tsc --noEmit; echo "tsc exit=$?"
npx eslint . --ignore-pattern 'ml/venv/**' --ignore-pattern 'coverage/**'
```

---

## Data and artifacts

**SpotifySorter corpus.** 2,875 Spotify tracks → 2,744 with a usable preview, collapsing onto **2,625 distinct
recordings** (many-to-one via ISRC). Misses: 88 no preview, 41 not found on Deezer, 2 with no ISRC from Spotify.
Under the stricter duration audit: 2,706, 43 duration-flagged, 0 ISRC mismatches. `ml/artifacts/coverage.json`,
`embeddings.meta.json` (`.recordings = 2625`, `.tracks_mapped = 2744`).

**MTG-Jamendo sweep.** Both encoders complete, 100/100 parts each.

|                 | value                        |
| --------------- | ---------------------------- |
| tracks embedded | 18,486 (0 duplicate ids)     |
| clips           | 126,305                      |
| on disk         | 7.6 GiB                      |
| MERT-v1 arrays  | 13 × 768, float16 (2.2 GiB)  |
| MERT-v2 arrays  | 24 × 1024, float16 (5.4 GiB) |

The sweep is a **superset of split 0**: the manifest's split-0 counts are 17,982 tracks / 122,856 chunks, so 504
embedded tracks and 3,449 chunks sit outside the benchmark split. Every tar is sha256-checked before decoding —
CONFIRMED structurally (`ml/bench/embed-jamendo.py:75`, `:99-106`: no return path reaches the encoder without a
digest match) and by 0 `sha256 mismatch` lines in either sweep log. Caveat: no log prints a positive "verified"
line, and the MERT-v2 part-00 tar was embedded in an earlier run whose log is not on disk. `artifacts/jamendo/tmp/`
is empty, so the tars are gone; re-checking digests locally means re-downloading ~50 GB.

**Labels.** `data/labels/labels.jsonl`, 491 rows: 291 track rows (290 distinct track ids — one id appears twice,
both pass 1) and 200 pair rows. 489 carry `assisted: true`; the 2 that do not (`p001`, `p002`) predate the field
and default to blind, which is how `pair-calibration.json` reports `blind: 1`. 0 pass-2 rows exist. 39 of the 290
labelled track ids are outside the gold set and are dropped by the scorer.

**Gitignored, i.e. not in the repo:** everything under `ml/artifacts/` (`ml/.gitignore:4`) — embeddings, probe
JSONs, cv runs, `oof.npz`, the 7.6 GiB Jamendo sweep — and all of `data/` (`.gitignore:45`), including
`cache.json` and `labels.jsonl`. `ml/venv/` too (`ml/.gitignore:5`). Tracked: the scripts, `GOLD-PROTOCOL.md`,
and this file. The artifacts are reproducible from the scripts plus `data/cache.json`; their sha256 is recorded in
the notes ledger instead.

Post-hoc changes to the frozen protocol live in `ml/GOLD-PROTOCOL-AMENDMENTS.md`, which says why they are not
in the protocol itself.
