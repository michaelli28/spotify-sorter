"""Calibration: when the model says 85, how often is it actually right?

The 200 pairs were drawn stratified across eight pre-registered score bins, so
the sample is deliberately NOT representative — the rare high-score pairs are
massively over-sampled relative to the 99,900 pairs the model never ranked. Every
estimate here is therefore inverse-probability weighted: a pair drawn with
probability p stands for 1/p pairs in the population. Averaging the raw answers
instead would report the sample's design back rather than the library.

    venv/bin/python score-pairs.py

WHAT ASSISTED ROWS DO TO THIS. A pair answered with the model's own score on
screen measures the threshold, not the judgement: accept the suggestion and the
answer is "yes" exactly when the score cleared the cut, so every bin above the
cut reads 100% and every bin below reads 0%. That is not calibration, it is the
score read back. This script computes from BLIND rows only and refuses to call
an assisted result a calibration measurement — the same rule score-gold.py
applies to the headline.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ML = Path(__file__).resolve().parent
ART = ML / "artifacts"
DATA = ML.parent / "data"

BOOTSTRAP_RESAMPLES = 10_000
BOOTSTRAP_SEED = 20260921
# Below this many blind pairs there is nothing to estimate: one pair reports
# 100% with no interval, which reads like a finding and is not one.
MIN_BLIND = 10
# ...and the same floor has to apply to EVERY number printed, not once to the
# total. A global floor lets six bins of n=1 print "100% [nan, nan]" the moment
# the total clears 10 — the exact failure this constant exists to prevent, only
# now wearing the calibration label. Distinct TRACKS, not pairs, because the
# interval is resampled by track.
MIN_PER_NUMBER_TRACKS = 8
# Display order, low to high. "not_top5" is the model's implicit "no".
BIN_ORDER = [
    "not_top5", "lt55", "55-64", "65-69", "70-74", "75-79", "80-84", "85plus",
]
# The bins at or above the app's live score>=65 rule.
ABOVE_THRESHOLD = {"65-69", "70-74", "75-79", "80-84", "85plus"}


def log(m: str = "") -> None:
    print(m, flush=True)


def load() -> tuple[dict, dict, dict]:
    design = json.loads((DATA / "labels" / "sample-design.json").read_text())
    by_pair = {p["pair_id"]: p for p in design["pairs"]}
    bins = {b["id"]: b for b in design["bins"]}

    answers: dict[str, dict] = {}
    for line in (DATA / "labels" / "labels.jsonl").read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        if d.get("kind") != "pair":
            continue
        # Append-only, latest row per pair wins (the schema's own rule).
        answers[d["pair_id"]] = d
    return by_pair, bins, answers


def ipw_rate(rows: list[dict]) -> float:
    """Inverse-probability-weighted share of "yes". Each pair stands for 1/p
    pairs, so a pair drawn from the 99,900-strong not_top5 stratum counts about
    126x a pair drawn from 85plus."""
    w = np.array([1.0 / r["inclusion_prob"] for r in rows])
    y = np.array([1.0 if r["answer"] == "yes" else 0.0 for r in rows])
    return float((w * y).sum() / w.sum()) if w.sum() else float("nan")


def n_tracks(rows: list[dict]) -> int:
    return len({r["track_id"] for r in rows})


def bootstrap_rate(rows: list[dict], resamples: int, seed: int) -> tuple[float, float]:
    """Resampled by TRACK, not by pair: several pairs can share a song, and
    treating them as independent would narrow the interval by pretending there
    is more evidence than there is."""
    by_track: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_track[r["track_id"]].append(r)
    keys = sorted(by_track)
    if len(keys) < 2:
        return float("nan"), float("nan")
    # A zero-width interval is not a 95% interval, it is 0% coverage. It happens
    # whenever every resample lands on the same value (all-yes, all-no, or one
    # track), and printing it as "[100.0, 100.0]" is the most confident-looking
    # output this script can produce from the least evidence.
    groups = [by_track[k] for k in keys]
    rng = np.random.default_rng(seed)
    out = np.empty(resamples)
    for b in range(resamples):
        pick = rng.integers(0, len(keys), len(keys))
        drawn = [r for p in pick for r in groups[p]]
        out[b] = ipw_rate(drawn)
    lo = float(np.nanpercentile(out, 2.5))
    hi = float(np.nanpercentile(out, 97.5))
    if not np.isfinite(lo) or not np.isfinite(hi) or hi - lo < 1e-12:
        return float("nan"), float("nan")
    return lo, hi


def fmt_ci(lo: float, hi: float) -> str:
    """NaN endpoints mean the bootstrap had nothing to resample. Say that
    instead of rendering nan as if it were a bound."""
    if not np.isfinite(lo) or not np.isfinite(hi):
        return f"{'no interval':>16}"
    return f"[{lo*100:>6.1f},{hi*100:>6.1f}]"


def main() -> None:
    by_pair, bins, answers = load()
    if not answers:
        raise SystemExit(
            "No pair labels yet. Label them at /label (Pairs tab), then re-run."
        )

    rows, skipped_cj, assisted_n = [], 0, 0
    for pid, a in answers.items():
        design = by_pair.get(pid)
        if design is None:
            raise SystemExit(f"labelled pair {pid} is not in the pre-registered draw")
        if a.get("assisted"):
            assisted_n += 1
        if a["answer"] == "cant_judge":
            skipped_cj += 1
            continue
        rows.append({
            "pair_id": pid,
            "track_id": a["track_id"],
            "answer": a["answer"],
            "bin_id": design["bin_id"],
            "inclusion_prob": design["inclusion_prob"],
            "assisted": bool(a.get("assisted")),
        })

    blind = [r for r in rows if not r["assisted"]]
    log(f"answered pairs: {len(answers)} | usable {len(rows)} "
        f"| cant_judge {skipped_cj} excluded | assisted {assisted_n}")

    if len(blind) < MIN_BLIND:
        log(
            f"\n  !! ONLY {len(blind)} BLIND PAIR(S), need {MIN_BLIND}. Nearly every answer was\n"
            "     given with the model's own score on screen, so this is not a calibration\n"
            "     measurement — accepting the suggestion makes the answer 'yes' exactly when\n"
            "     the score cleared the cut, forcing every bin above it to 100% and every bin\n"
            "     below to 0%. The table below is the assisted rows, showing precisely that\n"
            "     happening. Do not quote it as calibration."
        )
        use, is_calibration = rows, False
    else:
        use, is_calibration = blind, True
        if len(blind) < len(rows):
            log(f"  using {len(blind)} blind pairs; {len(rows)-len(blind)} assisted excluded")

    log(f"\n{'bin':>9}  {'n':>3}  {'pop pairs':>9}  {'precision':>9}  {'95% CI':>16}")
    per_bin = defaultdict(list)
    for r in use:
        per_bin[r["bin_id"]].append(r)
    table = []
    thin: list[str] = []
    for b in BIN_ORDER:
        rs = per_bin.get(b, [])
        if not rs:
            log(f"{b:>9}  {0:>3}  {bins[b]['population_pairs']:>9,}  {'—':>9}")
            continue
        nt = n_tracks(rs)
        if nt < MIN_PER_NUMBER_TRACKS:
            thin.append(b)
            log(f"{b:>9}  {len(rs):>3}  {bins[b]['population_pairs']:>9,}  "
                f"{'—':>9}  {f'only {nt} track(s)':>16}")
            table.append({"bin": b, "n": len(rs), "n_tracks": nt,
                          "population_pairs": bins[b]["population_pairs"],
                          "precision": None, "ci95": None, "too_thin": True})
            continue
        rate = ipw_rate(rs)
        lo, hi = bootstrap_rate(rs, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED)
        log(f"{b:>9}  {len(rs):>3}  {bins[b]['population_pairs']:>9,}  "
            f"{rate*100:>8.1f}%  {fmt_ci(lo, hi)}")
        table.append({"bin": b, "n": len(rs), "n_tracks": nt,
                      "population_pairs": bins[b]["population_pairs"],
                      "precision": rate, "ci95": [lo, hi], "too_thin": False})
    if thin:
        log(f"  ({len(thin)} bin(s) too thin to estimate: {', '.join(thin)})")

    # The number the app's behaviour actually rests on.
    above = [r for r in use if r["bin_id"] in ABOVE_THRESHOLD]
    present = {r["bin_id"] for r in above}
    missing = sorted(ABOVE_THRESHOLD - present)
    # ipw_rate self-normalises, so its denominator tracks the strata actually
    # present. Printing the full 10,565 beside it would claim coverage the
    # estimate does not have — and the bin most likely to be missing early is
    # 65-69, the one sitting on the threshold and the likeliest to be weakest.
    covered = sum(bins[b]["population_pairs"] for b in present)
    agg = None
    if above and n_tracks(above) >= MIN_PER_NUMBER_TRACKS and not missing:
        rate = ipw_rate(above)
        lo, hi = bootstrap_rate(above, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED)
        log(f"\nprecision at the app's live rule (score >= 65), IPW over "
            f"{covered:,} population pairs:")
        log(f"  {rate*100:.1f}%  {fmt_ci(lo, hi)}   n={len(above)}"
            + ("" if is_calibration else "   [ASSISTED — the score read back, not calibration]"))
        agg = {"precision": rate, "ci95": [lo, hi], "n": len(above),
               "population_covered": covered}
    elif above:
        why = (f"{len(missing)} of the 5 bands have no data ({', '.join(missing)})"
               if missing else f"only {n_tracks(above)} distinct track(s)")
        log(f"\nprecision at the app's live rule (score >= 65): NOT REPORTED — {why}.")
        log(f"  The estimand is precision over all {sum(bins[b]['population_pairs'] for b in ABOVE_THRESHOLD):,}"
            f" pairs above the cut; these rows cover {covered:,}, so an aggregate here")
        log("  would be a different quantity wearing the headline's name.")
        agg = {"precision": None, "reason": why, "population_covered": covered,
               "missing_bins": missing, "n": len(above)}

    # Monotonicity: calibration's one falsifiable shape claim. Only over bins
    # that actually produced an estimate — "monotonic: yes" across one bin says
    # nothing and reads like it says something.
    estimable = [b for b in BIN_ORDER
                 if per_bin.get(b) and n_tracks(per_bin[b]) >= MIN_PER_NUMBER_TRACKS]
    if len(estimable) < 2:
        log(f"\nmonotonic across bins: not testable ({len(estimable)} estimable bin(s))")
        drops = []
    else:
        seen = [(b, ipw_rate(per_bin[b])) for b in estimable]
        drops = [(a[0], c[0]) for a, c in zip(seen, seen[1:]) if c[1] < a[1] - 1e-9]
        log(f"\nmonotonic across {len(estimable)} estimable bins: "
            f"{'yes' if not drops else 'NO — ' + ', '.join(f'{x}>{y}' for x, y in drops)}")
    if is_calibration and drops:
        log("  A higher score band scoring worse than a lower one is the interesting\n"
            "  failure here — it means the score is not ordering what it claims to.")

    out = {
        "is_calibration": is_calibration,
        "counts": {"answered": len(answers), "usable": len(rows), "blind": len(blind),
                   "assisted": assisted_n, "cant_judge": skipped_cj},
        "bootstrap": {"unit": "track", "resamples": BOOTSTRAP_RESAMPLES,
                      "seed": BOOTSTRAP_SEED},
        "bins": table,
        "above_threshold": agg,
        "min_tracks_per_number": MIN_PER_NUMBER_TRACKS,
    }
    (ART / "pair-calibration.json").write_text(json.dumps(out, indent=2))
    log(f"\nwrote {ART / 'pair-calibration.json'}")


def self_test() -> None:
    """Hand-checked, in the style of plackett_luce.py."""
    # Two pairs, one drawn at p=0.5 (weight 2) saying no, one at p=0.1
    # (weight 10) saying yes: 10/(2+10) = 0.8333, NOT the unweighted 0.5.
    rows = [
        {"answer": "no", "inclusion_prob": 0.5, "track_id": "a"},
        {"answer": "yes", "inclusion_prob": 0.1, "track_id": "b"},
    ]
    got = ipw_rate(rows)
    assert abs(got - 10 / 12) < 1e-12, got
    log(f"IPW weighting                     OK  ({got:.4f} vs unweighted 0.5000)")

    assert ipw_rate([{"answer": "yes", "inclusion_prob": 0.3, "track_id": "a"}]) == 1.0
    assert ipw_rate([{"answer": "no", "inclusion_prob": 0.3, "track_id": "a"}]) == 0.0
    log("degenerate all-yes / all-no       OK")

    # Pairs sharing a track must not count as independent evidence.
    same = [{"answer": "yes" if i % 2 else "no", "inclusion_prob": 0.5,
             "track_id": "t"} for i in range(20)]
    diff = [{"answer": "yes" if i % 2 else "no", "inclusion_prob": 0.5,
             "track_id": f"t{i}"} for i in range(20)]
    lo_s, hi_s = bootstrap_rate(same, 500, 1)
    lo_d, hi_d = bootstrap_rate(diff, 500, 1)
    assert np.isnan(lo_s), "one track = one group = no resampling signal"
    assert hi_d > lo_d, (lo_d, hi_d)
    log(f"track grouping respected          OK  (20 pairs on 1 track -> no CI)")

    # A degenerate resample distribution must not surface as a tight interval.
    allyes = [{"answer": "yes", "inclusion_prob": 0.5, "track_id": f"t{i}"}
              for i in range(12)]
    lo, hi = bootstrap_rate(allyes, 500, 1)
    assert np.isnan(lo) and np.isnan(hi), (lo, hi)
    assert fmt_ci(lo, hi).strip() == "no interval"
    log("zero-width interval refused       OK  (all-yes -> 'no interval', not [100,100])")

    mixed = [{"answer": "yes" if i % 3 else "no", "inclusion_prob": 0.5,
              "track_id": f"t{i}"} for i in range(12)]
    lo2, hi2 = bootstrap_rate(mixed, 2000, 1)
    assert np.isfinite(lo2) and hi2 > lo2, (lo2, hi2)
    log(f"a real interval still prints      OK  ([{lo2*100:.1f}, {hi2*100:.1f}])")

    assert n_tracks(mixed) == 12 and n_tracks(allyes[:3] + allyes[:3]) == 3
    log("n_tracks counts distinct tracks    OK")
    log("\nall self-tests passed")


if __name__ == "__main__":
    import sys
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
