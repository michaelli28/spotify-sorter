# Interview notes — SpotifySorter "Ears"

Speaking notes, not a script. Every claim here is checkable in the repo. Depth, and every caveat, lives in
`ml/RESULTS.md` — if they dig past a card, that is where the answer is.

**Say this early:** built with Claude Code — co-author on every commit, wrote most of the code. The question,
the scope and the calls were mine; the review loop was mine. `/data` and `ml/artifacts/` are gitignored, so
"checkable" means on my laptop, not from a clone.

---

## The 90-second version

**What it is.** SpotifySorter sorts my 2,875-song library into 41 mood playlists. Claude does the sorting from
title, artist and genre tags — and for 64% of songs there are no tags, so it's going on the name alone. It
never hears the music.

**The question.** Can a model that only _hears_ a 30-second clip reproduce Claude's picks? If so, the library
can be sorted from sound.

**How.** Frozen pretrained music encoders turn each preview into numbers; a small probe learns to reproduce
Claude's ranking; it's scored only on artists it has never seen. The embedding pipeline is checked against a
published benchmark, and the scoring rules were frozen before the first song was
labelled.

**What it showed.** 37.8% agreement with Claude's top pick on unseen artists, against 17.4% for always guessing
the most common playlist. The encoder choice matters: MERT-v2 beats Essentia by 8.4 points on every fold.

**What I'd want you to take away.** The measurement discipline — not the number.

---

## Decision cards

### 1. Pre-registration enforced by the scorer, not by a document

**They ask:** How do you stop yourself p-hacking your own analysis?
**Obvious move:** Compute top-1, precision@3 and recall, then pick "the headline" after seeing all three.
**What I did:** `score-gold.py` hard-exits unless a committed `gold-config.json` exists, and again if the
protocol's sha256 no longer matches the one stamped in it. `--freeze` refuses to overwrite.
**Why:** A scorer that computes every candidate headline and lets you choose afterwards pre-registers nothing.
**Cost:** I re-froze twice by deleting the config by hand. The three recorded answers never changed across
all three freezes (`git log -p ml/gold-config.json`) — but "immutable" is not the claim.
**If pushed — "what does it actually guarantee?":** Tamper-evident, not sealed. It checks the protocol's hash,
not the _ordering_ — a config frozen after the labels would validate the same. The fix is one assert:
`min(labeled_at) > frozen_at`.

### 2. Artist-grouped cross-validation, at both levels

**They ask:** What's the most common way people leak information in an evaluation?
**Situation:** 2,625 recordings across 1,332 artists; 858 have one song, the largest has 22.
**Obvious move:** Random 5-fold — or group the outer folds but split early stopping randomly, which still leaks.
**What I did:** Grouped by artist for the outer folds _and_ the inner early-stopping split; standardisation
from training-fold statistics only; dedup by ISRC so single and album copies of one recording can't straddle
folds.
**Why:** Otherwise the model memorises the artist and scores well while learning nothing about sound.
**Cost:** Lumpy folds — with 858 single-song artists, fold sizes are uneven by construction.
**If pushed — "how do you know it's leak-free?":** Grouped by construction — each artist maps to one fold. What
I haven't done is an audio near-duplicate check across folds (remasters get new ISRCs). The embeddings are on
disk; it's a few minutes.

### 3. The layer is a hyperparameter, so it's chosen on validation

**They ask:** How do you avoid fooling yourself in a model comparison?
**Situation:** MERT-v1 vs MERT-v2 on MTG-Jamendo, a public music-tagging benchmark, probed at every layer.
**Obvious move:** Best test score per encoder — which selects on test, twice.
**What I did:** Picked each encoder's layer on validation, read test once (`compare-encoders.py:39-40`).
Reported v2 − v1 = +0.0252 AUROC.
**Why:** Layer choice is a knob like any other; tuning it on test inflates both sides.
**Cost — say this before they find it:** v2's validation curve is flat. Five layers tie within 0.0005, and
their test scores put the delta anywhere from +0.013 to +0.025 — I reported the top. At the model card's own
layer it's +0.0206. One seed, no interval.
**If pushed — "so is v2 actually better?":** Direction yes, magnitude unknown. Five seeds with saved
per-track predictions would give an interval; the probe sweep takes ~7 minutes, so about an hour.

### 4. Frozen encoders and a linear probe

**They ask:** Why not fine-tune?
**What I did:** Froze every encoder; trained a layer-weighting plus a linear head. That makes the encoder the
only variable, which is the actual question.
**Why:** 2,625 rows and 41 categories is far too little to fine-tune a large pretrained encoder without it memorising artists.
**What it showed:** MERT-v2 37.8% vs Essentia 29.3% — +8.4 points, ahead on every fold (5.9 to 10.5), paired
t ≈ 10. The one comparison in the project that is unambiguous.
**Cost / if pushed — "did you test more capacity?":** Not properly. A 2-layer net scored 36.5% vs 37.8%, but it
inherited the linear probe's settings, so that's an undertrained MLP, not a capacity result. I wouldn't claim
capacity isn't the bottleneck.

### 5. Plackett-Luce over the teacher's ordering

**They ask:** Why that loss function?
**Situation:** Claude returns a strictly ordered top-5 of the 41 categories per song.
**Obvious move:** 41 independent yes/no heads with binary cross-entropy.
**What I did:** A hand-derived Plackett-Luce loss — each pick scored against the categories not yet picked.
**Why:** Binary heads throw the order away and treat every unlisted category as a confident "no", a claim the
teacher never made.
**Cost:** No library implementation, so the gradient had to be right by hand. A self-test checks the loss and
every gradient against a hand calculation to 1e-5 (`plackett_luce.py:97-110`).
**If pushed — "did it earn its complexity?":** I don't know — there's no BCE run to compare. It's the ablation
I'd run first.

### 6. Keep the experiment's design out of the thing being measured

**They ask:** How do you stop the labelling tool from biasing the labels?
**Situation:** The estimator needs each pair's score bin and sampling probability. The person labelling must
never see them.
**What I did:** They live in a separate `sample-design.json` that no route or component imports — only the
offline scorers read it — and the design records the hash of the assignments it was drawn from, so scoring hard-exits if they change underneath it.
**Why:** If the UI can reach it, eventually it will render it.
**Cost:** Two files that must stay in sync, checked by hash rather than by construction.
**If pushed — "is the UI itself blind?":** Only at render time. The server still sends suggestions and the page
hides them. Wire-level blindness would be a GET that omits them — I'd make that change before trusting it.

### 7. One verdict per pair, not the track's ranked five

**They ask:** Give me an example of resisting code reuse.
**Situation:** Suggestions were wanted on the yes/no pairs queue too. Reusing the track payload was two lines.
**What I did:** A separate type carrying exactly `{score, verdict}`. Bulk-accept can only ever emit `yes` or
`no` — "can't judge" means a human looked, so the type makes it impossible to emit automatically.
**Why:** A pair asks one question about one category. The ranked five would leak four more categories into
the answer.
**Cost:** Two suggestion builders that can drift if the cache shape changes.

### 8. Stream, embed, discard — and hash before retry

**They ask:** Walk me through an infrastructure decision.
**Situation:** 49.2 GB of benchmark audio in 100 parts, one laptop, and licence terms that make keeping the
audio a problem.
**Obvious move:** Download everything, then embed in a second pass.
**What I did:** One part at a time: download, verify sha256 against the official manifest, stream through the
encoder, delete. Peak disk is about one part, ~500 MB.
**Why — the part worth telling:** The integrity check existed _before_ any retry logic. When the sweep died at
part 97 of 100, 9.5 hours in, on a truncated transfer, adding a retry was four lines and safe — because a
truncated file could never pass the hash. A retry without a content check turns flaky networks into corrupt
data.
**It paid off:** The next 13-hour sweep hit 6 transfer failures (five CDN 403s, one timeout) across 4 parts,
recovered all of them, and finished 100/100.
**Debugging beat, same commit:** The first run died on memory. Instead of re-running, I worked it out: the
longest track (3,931 s) returned 9.7 GB of hidden states in one pass. Median track is small, so it only bit on
the tail — which is exactly how it passed the smoke test. Micro-batching capped it at 590 MB.

---

## Times I was wrong

### 1. A safety rule that blocked its own recovery path

**Wrong belief:** "Once you've seen the model's guesses you can't un-see them — so the 'assisted' flag should
only ever ratchet up."
**What happened:** The reasoning was right; the consequence wasn't. It made any re-label impossible to count,
so the only way back to a clean measurement was blocked by the rule meant to protect it. Caught when a claim
that re-labelling was done got checked against the file instead of accepted.
**Fix — a mechanism, not a reminder:** One flag was carrying two facts. Split into `assisted` (guesses on screen
_at answer time_) and `prior_exposure` (seen earlier, answered later with them hidden), the second derived
server-side from history.
**Lesson:** When a boolean keeps needing special cases, it's usually two booleans.

### 2. A usability fix that opened an integrity hole

**Wrong belief:** That remembering "this person saw the suggestions" inside the component was enough.
**What would have shipped:** Accept → Save → Hide → Back → Save, all normal UI, wrote a second row marked
_not_ assisted — and since the latest row wins, it silently erased the honest one.
**What caught it:** An adversarial review of the write path. No test covered Back-then-re-save.
**The irony:** The session-level Hide button, added two commits earlier to make blind labelling practical, is
what made it reachable.
**Fix:** Track "seen" at session level, above the component that remounts, and read it from the save handler.

### 3. Two metrics that were dead code with passing tests

**Wrong belief:** That "the output has the field" means "the metric was computed".
**What would have shipped:** One pre-registered metric had a helper, a reference and a passing self-test — and
was never called. Another printed a denominator and computed nothing.
**Why it's the dangerous shape:** A missing metric announces itself. One with a helper, a test and a JSON key
doesn't. The test proved the function was correct, never that it was reached.
**Rule I took away:** Test that the number reaches the output, not just that the function is right.

### 4. What I'd do differently: a smaller instrument

I built 1,125 lines of scoring code against 523 for the model it measures, including a weighted estimator over
10,565 population pairs for a 200-pair sample. A 50-song blind set with no suggestions feature would have
answered the question and survived the failure that complicated this one. Rigour scales with what the data can
support, not with how much machinery you can write.

---

## If they bring up the labels

Only if asked — `RESULTS.md` states it plainly, so don't be caught out.

To label faster, I had Claude's suggestions on screen with an Accept-all button. That makes the hand labels
partly copies of Claude's picks, so they can't serve as an independent judge of Claude. The system records it
on every row (`assisted: true`) and the scorer refuses to call that result blind — it prints
`NO BLIND ROWS … the headline claim CANNOT BE MADE from this data`. That's why the headline is the
distillation result instead: agreement with Claude as the target, which never needed those labels. If I redid
it: suggestions on the random queue only, the gold set kept blind.

---

## Numbers I can defend

| Number       | What it measures                                              | Say in the same breath                                                                 |
| ------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **37.8%**    | Audio-only model matches Claude's top pick, on unseen artists | Agreement with Claude, not correctness. ±2.2 is fold spread, not a CI. Prior is 17.4%. |
| **+8.4 pts** | MERT-v2 vs Essentia, same folds                               | Ahead on every fold, t ≈ 10. The unambiguous comparison.                               |
| **60.5%**    | Claude agreeing with itself on 119 duplicate pairs            | A floor on what's achievable, not a ceiling — a perfect student could beat it.         |
| **0.7822**   | MERT-v2 on MTG-Jamendo, card's layer                          | Published 0.7944. One seed; checks the embedding setup, not the student.               |
| **+0.0252**  | MERT-v2 over MERT-v1, layer picked on validation              | Top of a +0.013 to +0.025 range across tied layers. No interval.                       |

Never say: "Claude is correct", "62% of the ceiling", "capacity was tested", "I hand-labelled 251 songs".

---

## Questions to ask them

1. How does your team handle a scoring rule that turns out wrong _after_ results exist — amend in place,
   or version the protocol? I chose a separate amendments file so the frozen hash stayed valid.
2. Where's your line on rigour versus velocity? I spent most of a day of laptop time encoding a benchmark to avoid citing two
   conflicting published numbers, then ran a probe that takes minutes on a single seed. Which half would your
   team push back on?
3. When a feature request degrades a measurement — even one you asked for yourself — what's the norm: build it
   and make the caveat automatic, or push back and take the delay?
