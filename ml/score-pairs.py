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
    groups = [by_track[k] for k in keys]
    rng = np.random.default_rng(seed)
    out = np.empty(resamples)
    for b in range(resamples):
        pick = rng.integers(0, len(keys), len(keys))
        drawn = [r for p in pick for r in groups[p]]
        out[b] = ipw_rate(drawn)
    return float(np.nanpercentile(out, 2.5)), float(np.nanpercentile(out, 97.5))


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
    for b in BIN_ORDER:
        rs = per_bin.get(b, [])
        if not rs:
            log(f"{b:>9}  {0:>3}  {bins[b]['population_pairs']:>9,}  {'—':>9}")
            continue
        rate = ipw_rate(rs)
        lo, hi = bootstrap_rate(rs, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED)
        log(f"{b:>9}  {len(rs):>3}  {bins[b]['population_pairs']:>9,}  "
            f"{rate*100:>8.1f}%  [{lo*100:>6.1f},{hi*100:>6.1f}]")
        table.append({"bin": b, "n": len(rs), "population_pairs": bins[b]["population_pairs"],
                      "precision": rate, "ci95": [lo, hi]})

    # The number the app's behaviour actually rests on.
    above = [r for r in use if r["bin_id"] in ABOVE_THRESHOLD]
    if above:
        rate = ipw_rate(above)
        lo, hi = bootstrap_rate(above, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED)
        log(f"\nprecision at the app's live rule (score >= 65), IPW over "
            f"{sum(bins[b]['population_pairs'] for b in ABOVE_THRESHOLD):,} population pairs:")
        log(f"  {rate*100:.1f}%  [{lo*100:.1f}, {hi*100:.1f}]   n={len(above)}"
            + ("" if is_calibration else "   [ASSISTED — the score read back, not calibration]"))

    # Monotonicity: calibration's one falsifiable shape claim.
    seen = [(b, ipw_rate(per_bin[b])) for b in BIN_ORDER if per_bin.get(b)]
    drops = [(a[0], c[0]) for a, c in zip(seen, seen[1:]) if c[1] < a[1] - 1e-9]
    log(f"\nmonotonic across bins: {'yes' if not drops else 'NO — ' + ', '.join(f'{x}>{y}' for x, y in drops)}")
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
    log("\nall self-tests passed")


if __name__ == "__main__":
    import sys
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
