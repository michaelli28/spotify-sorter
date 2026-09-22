# Amendments to GOLD-PROTOCOL.md — post-hoc

Everything in this file was written **after labels existed**. That is the whole reason it
is a separate file: `GOLD-PROTOCOL.md` is the pre-registration, and a pre-registration you
can edit is not one.

**Why not append to the protocol itself.** `ml/score-gold.py:107` refuses to score when
`GOLD-PROTOCOL.md`'s sha256 no longer matches the one frozen in `gold-config.json`, and
`--freeze` refuses to overwrite an existing config. Appending would therefore have forced a
third re-freeze of a document already re-frozen twice. The protocol stays byte-identical;
amendments live here.

No amendment below changes a scoring rule. Not the primary metric, not the bins, not
Q1/Q2/Q3, not the weighting, not the bootstrap. If one ever does, it is not an amendment —
it is a new protocol, and it needs a new freeze.

---

## A1. The study is a distillation, not a blind comparison — 2026-09-21

**What changed:** the claim. Not the rules.

The protocol was written to answer "does a model that listens agree with Michael's blind
labels more often than a model that only reads titles?" §7b and §7c already record why that
question died: suggestions were put on screen, Accept-all shipped, and every gold row is
`assisted: true`. Claude is scored against copies of itself.

Michael's instruction on 2026-09-21 was to treat Claude's guesses as the target rather than
argue about whether they are right. That is a different and answerable question:

> **Can 30 seconds of audio reproduce the judgement Claude made from a title?**

Claude's labels are the **target**, not ground truth. The distinction is not pedantry — it
is measured. Claude, labelling the same recording twice, agrees with itself about 60% of the
time, so "Claude is correct" is not an assumption this project is entitled to make, and the
word _perfect_ is measurably false.

**What this buys.** The gold set stops being load-bearing. Phase 2 already measures
agreement-with-Claude on thousands of recordings held out **by artist**, which is far more
evidence than 251 songs could ever have provided. The headline moves there.

**What it costs, stated plainly.** A distillation result cannot tell you the categories are
_good_. It tells you they are _recoverable from audio_. Any claim that the student
understands mood better than the teacher is unsupported by anything in this repo.

**Status of the gold set under this framing:** secondary. It remains a circular measurement
and is reported as one.

## A2. 100% is the wrong reference — and so is 60.5% — 2026-09-21

A student scoring 37.8% is not "37.8% of the way to correct": the target is a noisy teacher,
not truth, so 100% is not the reference. **An earlier version of this section then made the
opposite error**, dividing by the 60.5% self-agreement figure and calling the result "62% of
the ceiling". That is backwards, and the correction is the more interesting fact.

Model the recorded label for a song as a draw from Claude's own distribution `p` over the 41
categories. Then:

- self-agreement between two independent draws is `E[Σp²]` — measured at **0.605**
- the best score any predictor could achieve against a single drawn label is `E[max p]`

Since `Σp² ≤ max p` holds pointwise, **`E[max p] ≥ 0.605`**. The self-agreement number bounds
the achievable maximum from _below_. It is a floor, not a ceiling, and dividing by it
overstates how much of the available signal the student captured.

ASSUMED refinement, not measured: treating each disagreeing pair as an even split between two
categories gives `E[max p] ≈ 0.605 + 0.395/2 = 0.8025`, which would put 37.8% at roughly
**47%** of achievable rather than 62%. The rigorous claim is only the inequality; the 0.8025
depends on that two-support assumption.

**Rule for quoting:** state 37.8% against its baselines (17.4% prior, 14.5% text-only) and
say the teacher self-agrees 60.5%. Do not present any ratio of the two as a fraction of a
ceiling.

## A3. No blind anchor is obtainable from the relabel pass as built — 2026-09-21

An earlier draft of this file claimed the **30-song relabel pass** (`RELABEL_TRACKS = 30`,
`src/lib/labeling/schema.ts:25`) could still buy a blind anchor. **That was wrong**, and the
correction matters more than the original claim: three separate things in the shipped code
each independently prevent it.

1. **Gold songs cannot be relabelled at all.** `app/api/label/route.ts:221-222` rejects
   `set:"gold"` with `pass != 1` — "The gold set has no pass 2". The relabel queue is a
   seeded subset of the 100 **random** tracks, and the API serves no other ids (`:230`).
2. **A pass-2 row never reaches the tier logic.** `ml/score-gold.py:159-169` routes pass-2
   rows into `p2`/`assisted_p2` and `continue`s **before** `assisted`, `exposed` and `cant`
   are populated — those are set only on the pass-1 branch. The `virgin`/`reblind`/
   `assisted` split at `:527-530` reads `lab.assisted` and `lab.exposed`, so no relabel can
   move a song out of the assisted tier. Its only effect is the self-agreement line.
3. **The row it writes would be dishonest.** _(Fixed in `869724d` — see below.)_ `app/api/label/route.ts:250-255` derives
   exposure with `exposedBefore`, which matches on `r.pass === input.pass`. For a pass-2
   row that inspects prior **pass-2** rows only — there are none — so it writes
   `prior_exposure: false` for a song that was demonstrably answered with the guesses on
   screen during pass 1. The strongest and least true of the three labels, written
   automatically, into an append-only file.

Point 3 was fixed in `869724d` before any relabel was written: exposure now matches on the
song, not the pass, and two tests pin both directions. Points 1 and 2 stand.

**Consequence for the record:** this study has no blind stratum and no supported way to
obtain one without a code change plus an amended analysis. `score-gold.py` already reports
this honestly — `0 never-exposed | 0 relabelled after exposure | 242 answered with the
guesses on screen`. Treat the gold table as an internal ablation, never as a comparison.

## A4. Known drift in the frozen text — 2026-09-21

§7c of `GOLD-PROTOCOL.md` says it "was written on 2026-09-22". It was written on
2026-09-21 (the file's own freeze stamp is `2026-09-21T05:46:35+00:00`). Recorded here
rather than corrected, because correcting it would change the sha and trip the guard described at
the top of this file. The date is wrong; nothing that depends on it is.
