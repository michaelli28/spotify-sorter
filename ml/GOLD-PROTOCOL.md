# Gold-set scoring protocol — DRAFT for Michael's approval

**Status: NOT FROZEN. Nothing below has been run.** 0 of the 251 gold songs are labelled,
so no result exists to tune this against. That is the point: once approved, this file gets
a sha256 recorded in the notes and the analysis code reads it rather than re-deciding.

The Phase 3 instruction was "fix the mapping from Claude's 41 categories to my labels
before looking at any result". Having read the label schema, **there is no category
mapping to fix** — `/label` ticks the same 41 category ids Claude ranks, so the mapping is
the identity. What actually needs fixing before results exist is the **scoring rule**:
Claude produces a _ranking_, the student produces _41 scores_, and you produce a _set_.
Comparing them requires decisions, and every one of them can be argued after the fact
unless it is written down now.

---

## 1. What each side produces

|             | output                                                              | source                                                   |
| ----------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| **You**     | a SET of ticked category ids per song (multi-label, possibly empty) | `data/labels/labels.jsonl`, `kind:"track"`, `set:"gold"` |
| **Claude**  | an ordered top-5 of 41, with scores                                 | `cache.json` assignments, the September run, `21ef60cf…` |
| **Student** | 41 real-valued scores → an induced ranking                          | `ml/train.py`, MERT-v2-30s linear probe                  |

Ties in student scores break by ascending category index — deterministic, so a rerun
cannot change a result by coin flip.

## 2. Primary metric — one number, paired

**Top-1 hit rate.** For each song, take the model's rank-1 category. Score 1 if that
category is in your ticked set, else 0. This applies identically to Claude and the
student, which is what makes the comparison fair.

The reported quantity is the **paired difference**, per song:

    d_i = student_hit_i − claude_hit_i     ∈ {−1, 0, +1}

and the headline is `mean(d)` with a **paired bootstrap resampled by ARTIST**, 10,000
resamples, 2.5th/97.5th percentiles.

Why top-1 and not something richer: it is the decision the app actually makes first, it
needs no threshold, and it is the only metric where "Claude got it right" and "the student
got it right" mean the same thing. Richer metrics follow as secondary, not headline.

## 3. Secondary metrics — pre-registered, reported every time

Reported whatever they say, including when they disagree with the primary.

1. **Precision@3** — of the model's top 3, what fraction are in your set.
2. **Recall@k where k = |your set|** — of your ticks, how many appear in the model's top k.
   Undefined for empty sets; those songs are excluded from this metric only.
3. **Playlists-per-song matched.** The app's live rule is "score ≥ 65". For the student,
   pick the threshold that yields the SAME mean playlists-per-song as Claude on the gold
   set, then compare precision and recall at equal volume. Comparing a model that assigns
   3.8 playlists per song against one that assigns 1.2 is not a comparison.

## 4. Which songs count — the decisions that move the number

| case                                             | decision                        | why                                                                                                       |
| ------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cant_judge`                                     | **excluded entirely**           | no ground truth exists                                                                                    |
| you ticked **nothing** ("fits none")             | **included** in the primary     | both models score 0, so it is a real outcome; it cannot discriminate, so the count is reported separately |
| no Deezer preview (6 songs)                      | **excluded from the primary**   | the student has no audio; scoring it would measure coverage, not listening                                |
| wrong-version audio, >3s duration flag (3 songs) | **excluded from the primary**   | the student heard a different recording                                                                   |
| relabelled songs (2nd pass ≥48 h later)          | **first label** is ground truth | the second measures YOUR self-agreement, reported as a second ceiling                                     |
| multiple rows for one song                       | **latest row wins**             | matches the schema's stated rule                                                                          |

That leaves **242 of 251** as the primary denominator. Both exclusions are reported with
their counts every time the headline is quoted.

**Also reported: the intention-to-treat variant.** All 251 songs, with the student falling
back to Claude wherever it has no usable audio. That is the number that describes the
system you would actually ship, and it will be slightly smaller than the primary. Quoting
only the favourable one is exactly the move this file exists to prevent.

## 5. Ablations — all on artists the student never trained on

Without these, "isn't it just the artist?" has no answer.

1. **Audio-only** — the student as trained. The claim.
2. **Text-only** — the same probe architecture on a CLAP _text_ embedding of the string
   `"<title> — <artist>"`. CLAP shares one space between text and audio, so this is the
   closest possible like-for-like: same data, same probe, same loss, text instead of sound.
   **Measured already against the teacher (2026-09-20), and it changes how to read this.**
   Text-only scores 14.5% top-1 against a 17.4% prior, while audio scores 37.8%. That is
   not a broken baseline — it is artist-grouping working as intended. The CLAP-text nearest
   neighbour shares the _artist_ 40.2% of the time, and its apparent category signal
   collapses from 39.6% to **13.9%** once the neighbour is forced to be a different artist
   (chance 5.8%). Nearly all of the text signal is artist identity, and artist-grouped CV
   removes it by design.

   **Consequence for the write-up:** do not say "text carries no information". Say "on an
   artist the model has never heard, a title carries little beyond who sings it". And note
   that **Claude is itself the real text-only baseline** — for the 1,850 no-genre songs its
   whole input was that same string — so the head-to-head against Claude already _is_ an
   audio-versus-text comparison. The CLAP-text probe is the controlled version: same
   targets, same architecture, modality the only difference.

3. **Artist-average** — predict the average of the Claude labels of that artist's OTHER
   songs. Undefined for the 884 single-song artists; those fall back to the global prior,
   and the split of defined/undefined is reported.
4. **Global prior** — always predict the most common category. The floor.

## 6. The confidence interval

Bootstrap resampled by **artist**, not by song: songs by one artist are not independent,
and treating 27 iann dior songs as 27 independent observations overstates the sample.
10,000 resamples, percentile interval, seed recorded.

Paired, so per-song difficulty cancels — a song both models get right contributes 0 either
way. The precision therefore comes from the songs where the two DISAGREE, not from n. At
242 songs a single percentage carries about ±6.3 points; the paired difference can be
tighter, and grouping by artist widens it again. Both are reported.

**If the interval crosses zero, that is the result, and it gets said plainly.**

## 7. What will NOT be claimed

- Not "the student is more accurate than Claude" — only "agrees with Michael's blind
  labels more often, on no-genre songs, on unseen artists, with this CI".
- Not any number without the subset (no-genre), the CI, and the ablations.
- Not a result on genre-tagged songs as though it were the same claim. Those are reported
  too, and **little or no difference there is the expected outcome, not a failure**.

---

## Decisions taken 2026-09-20, before any label was scored

All three were answered by Michael on 2026-09-20 and frozen into `ml/gold-config.json`
together with this file's sha256. The scorer refuses to run without that file, and refuses
again if this file changes after it. No label had been read by any scoring code when these
were chosen, and no score had been computed.

| | question | decision |
| --- | --- | --- |
| **Q1** | headline metric | **top-1 hit rate**, with precision@3 always reported beside it |
| **Q2** | empty tick sets ("fits none") | **excluded** from the primary denominator, counted and reported separately |
| **Q3** | streaming history as a third axis | **yes** — specified in §8 below |

Q2 note: excluding empty sets keeps the denominator to songs that can discriminate between
the two models. The count of empty sets is reported every time the headline is quoted, and
the primary is also recomputed WITH them included as a robustness line, so the choice is
visible rather than load-bearing.

## 7b. Assisted labelling — added 2026-09-21, and what it costs

Michael asked to see the model's suggestions while labelling, with an "Accept
suggestions" button, and confirmed the request after the cost was set out. The `/label`
page now shows Claude's ranked categories and their scores on the two TRACK queues.

**The cost, stated once, plainly.** A song answered with the model's own ranking on
screen cannot serve as a blind label in a comparison against that model. Wherever a
suggestion is accepted, the label is partly a copy of the thing being measured, so the
model scores against itself. This is not noise — noise widens a confidence interval and
the bootstrap handles it. This is circularity, and it makes the quantity unmeasurable
rather than merely uncertain.

**What is done about it, mechanically, not by discipline:**

- Every row carries `assisted: true|false`, set from whether the suggestions were
  actually on screen for that song. Defaults false, so every row written before
  2026-09-21 remains correctly marked blind.
- The page has a per-song **Hide** control. Hiding makes that song blind again — but
  once they have been displayed for a song, the row stays `assisted` even if hidden
  before saving, because it cannot be un-seen.
- `score-gold.py` computes the section 2 headline **from blind rows only**. Assisted
  rows are excluded from it and reported separately. If there are no blind rows at all,
  the script refuses to present the result as a blind comparison and prints why.
- The **pairs** task remains blind absolutely. Score bins are still never served, and a
  static tripwire plus an integration test both enforce that the pairs queue carries no
  suggestions, no scores and no bins. A yes/no answer about one named category with that
  category's score visible would simply be the answer read back.
- The **relabel** pass (self-agreement ceiling) is assisted too, matching pass 1. Mixing
  conditions across the two passes would conflate "changed my mind" with "had help the
  first time". Note the consequence: if suggestions are accepted wholesale on both
  passes, self-agreement approaches 100% and measures the button, not the judgement.

**What can still be claimed if every gold row ends up assisted:** the ablations remain
readable against each other (student vs text-only vs artist-average vs prior all face the
same labels), and section 8 is untouched because it never used labels. What is lost is
the headline — "the student agrees with Michael's blind labels more often than Claude
does" — because Claude's agreement is no longer independent of Claude.

## 8. Third axis — revealed preference (non-blind, secondary, never the headline)

Claude and the student are both judged against Michael's blind labels. The streaming export
is a different kind of evidence: what he actually played, independent of both. It answers a
narrower question — **do a model's categories group songs that get listened to alike?**

**Data.** Per-track play count, total ms played and skip count from the Extended Streaming
History export, via `ml/streaming-history.py --per-track-out`. 238 of the 251 gold songs
appear in the export (94.8%); the remaining 13 are excluded from this axis only, and that
count is reported with the result.

**Statistic.** For a model's top-1 category assignment over the gold songs, the
between-category share of variance (η²) of two listening measures:

1. `log1p(play count)`
2. skip rate (`skips / plays`), computed only for tracks with at least 5 plays, since a
   skip rate over 2 plays is noise

**Null.** Permute the category assignment across songs 10,000 times, preserving category
sizes, seed recorded. Report the observed η², the null distribution's 95th percentile, and
the permutation p-value. Computed identically for Claude, the student, text-only,
artist-average and the global prior — comparability across models is the entire point.

**What this is not.** Four caveats, reported every time this axis is quoted:

- It is **not blind**. Michael's listening is his own behaviour, not a held-out judgement.
- It is **descriptive, not a truth test**. A category scheme can track listening without
  being the right mood scheme, and vice versa.
- It is **confounded by artist** — 193 artists across 251 songs, and play counts cluster
  hard by artist, so some of any η² is artist identity rather than category structure.
- It **cannot move the headline**. The claim remains the blind-label top-1 comparison in
  §2. If this axis and the headline disagree, that is reported as a disagreement, not
  resolved in favour of whichever is nicer.
