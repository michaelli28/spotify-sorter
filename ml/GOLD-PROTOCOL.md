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

## Open questions for you — the only things I would not decide alone

**Q1. Is top-1 hit rate the right headline?** The alternative is precision@3, which is
closer to how playlists actually get used but needs no threshold either. I recommend top-1
as primary with precision@3 always reported beside it.

**Q2. Empty tick sets — include in the primary?** I recommend including them (they are a
real outcome and excluding them would flatter both models), but they add denominator
without adding discriminating power. If many gold songs come back empty, this matters, and
we will not know until you label.

**Q3. The streaming history opens a third evaluation axis.** Your export covers 94.8% of
the gold set with real play counts and skip rates. That is your revealed preference,
independent of both Claude and the audio, so it could serve as a _non-blind_ sanity check
("do the student's categories group songs you actually play together?"). I have NOT built
this and would not without your say-so — it is a different claim from the blind-label one
and could muddy it. Flagging it as available, not proposing it for the headline.
