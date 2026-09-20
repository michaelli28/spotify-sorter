"""Phase 3: score the gold set, exactly the way ml/GOLD-PROTOCOL.md pre-registered.

Nothing here decides anything. The protocol's three open questions (headline
metric, empty tick sets, streaming axis) are answered ONCE, by Michael, with
`--freeze`, which stamps the answers and the sha256 of GOLD-PROTOCOL.md into
ml/gold-config.json. Scoring then refuses to run without that file, and refuses
again if the protocol has been edited since it was frozen.

That refusal is the whole point. A scorer that will happily compute top-1 and
precision@3 and let you pick afterwards is a scorer that pre-registers nothing.

    # once, before any label is scored (Michael's call, not the model's):
    venv/bin/python score-gold.py --freeze --primary top1 --empty-sets include

    # then, after labelling and after train.py has written out-of-fold scores:
    venv/bin/python train.py --oof-out oof.npz
    venv/bin/python score-gold.py --oof oof.npz

WHICH LABELS COUNT: rows are matched by `track_id in gold_set`, NOT by
`set == "gold"`. 61 of the 251 gold songs were drawn into the earlier random
sample and their rows carry `set:"random"` (or no set field at all). Filtering
on the set field would silently drop those 61 and nobody would see it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import gold_set

ML = Path(__file__).resolve().parent
ART = ML / "artifacts"
DATA = ML.parent / "data"
PROTOCOL = ML / "GOLD-PROTOCOL.md"
CONFIG = ML / "gold-config.json"

BOOTSTRAP_RESAMPLES = 10_000
BOOTSTRAP_SEED = 20260920
LIVE_SCORE_THRESHOLD = 65  # the app's actual rule, §3.3


def log(m: str = "") -> None:
    print(m, flush=True)


def sha256_of(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


# --------------------------------------------------------------------------
# pre-registration
# --------------------------------------------------------------------------


def freeze(primary: str, empty_sets: str, streaming: bool) -> None:
    if CONFIG.exists():
        raise SystemExit(
            f"{CONFIG} already exists — refusing to re-freeze. Pre-registration that can be "
            "rewritten is not pre-registration. Delete it deliberately if you truly mean to."
        )
    cfg = {
        "frozen_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "protocol_sha256": sha256_of(PROTOCOL),
        "primary_metric": primary,           # Q1
        "include_empty_sets": empty_sets == "include",  # Q2
        "streaming_axis": streaming,          # Q3
        "bootstrap": {
            "unit": "artist",
            "resamples": BOOTSTRAP_RESAMPLES,
            "seed": BOOTSTRAP_SEED,
            "interval": "percentile 2.5/97.5",
        },
    }
    CONFIG.write_text(json.dumps(cfg, indent=2) + "\n")
    log(f"froze {CONFIG}")
    log(json.dumps(cfg, indent=2))
    log(f"\nRecord this in the notes ledger: gold-config.json sha256 {sha256_of(CONFIG)}")


def load_config() -> dict:
    if not CONFIG.exists():
        raise SystemExit(
            f"{CONFIG} does not exist.\n\n"
            "GOLD-PROTOCOL.md's three open questions are unanswered, so there is no\n"
            "pre-registered scoring rule and this script will not invent one. Answer them:\n\n"
            "  venv/bin/python score-gold.py --freeze \\\n"
            "      --primary top1|precision_at_3 \\\n"
            "      --empty-sets include|exclude \\\n"
            "      [--streaming-axis]\n\n"
            "The protocol's own recommendation is --primary top1 --empty-sets include,\n"
            "with the streaming axis left off."
        )
    cfg = json.loads(CONFIG.read_text())
    now = sha256_of(PROTOCOL)
    if now != cfg["protocol_sha256"]:
        raise SystemExit(
            f"GOLD-PROTOCOL.md has changed since it was frozen.\n"
            f"  frozen: {cfg['protocol_sha256'][:16]}…\n"
            f"  now   : {now[:16]}…\n"
            "Either restore the protocol or re-freeze deliberately — but editing the rules "
            "after labels exist is the thing this check is here to stop."
        )
    return cfg


# --------------------------------------------------------------------------
# labels
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Labels:
    ticks: dict[str, set[str]]        # track_id -> ticked category ids (pass 1)
    cant_judge: set[str]
    pass2: dict[str, set[str]]        # track_id -> pass-2 ticks, the self-agreement ceiling
    empty: set[str]                   # ticked nothing — "fits none"


def read_labels(gold_ids: set[str]) -> Labels:
    path = DATA / "labels" / "labels.jsonl"
    rows = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        if d.get("kind") != "track" or d["track_id"] not in gold_ids:
            continue
        rows.append(d)
    # Append-only: within a pass the LATEST row wins (§4, the schema's own rule).
    latest: dict[tuple[str, int], dict] = {}
    for d in sorted(rows, key=lambda r: r.get("labeled_at", "")):
        latest[(d["track_id"], int(d.get("pass", 1)))] = d

    ticks, cant, p2, empty = {}, set(), {}, set()
    for (tid, pas), d in latest.items():
        cats = set(d.get("category_ids") or [])
        if pas == 2:
            p2[tid] = cats
            continue
        if d.get("cant_judge"):
            cant.add(tid)
            continue
        ticks[tid] = cats
        if not cats:
            empty.add(tid)
    return Labels(ticks=ticks, cant_judge=cant, pass2=p2, empty=empty)


# --------------------------------------------------------------------------
# rankings
# --------------------------------------------------------------------------


def rank_from_scores(scores: np.ndarray) -> np.ndarray:
    """Descending by score, ties broken by ASCENDING category index (§1), so a
    rerun cannot move a result by coin flip. np.lexsort is stable and sorts by
    the last key first: negate the score, then index ascending."""
    idx = np.arange(scores.shape[1])
    return np.lexsort((np.tile(idx, (scores.shape[0], 1)), -scores), axis=1)


def claude_rankings(g: gold_set.GoldSet, track_ids: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Claude's ordered top-5 and its raw scores, from cache.json assignments.

    Two things are checked rather than assumed, because both would quietly turn
    this into a comparison of Michael against himself:

    1. The assignments must still hash to the value sample-design.json pinned
       when the sample was drawn. `JSON.stringify` has no spaces, so the compact
       separators here are what reproduce the recorded digest — verified, not
       guessed.
    2. No gold track may carry a manual `override`. An override is Michael's own
       correction, not Claude's output; scoring it as "Claude" would score his
       labels against his labels. 0 of the 251 carry one today.
    """
    cache = json.loads((DATA / "cache.json").read_text())
    design = json.loads((DATA / "labels" / "sample-design.json").read_text())
    now = hashlib.sha256(
        json.dumps(cache["assignments"], separators=(",", ":")).encode()
    ).hexdigest()
    if now != design["assignments_sha256"]:
        raise SystemExit(
            f"cache.json assignments have changed since the sample was drawn.\n"
            f"  pinned: {design['assignments_sha256'][:16]}…\n"
            f"  now   : {now[:16]}…\n"
            "The gold set was drawn against the pinned scores; scoring against different "
            "ones compares two different runs."
        )
    overridden = [t for t in track_ids if (cache["assignments"].get(t) or {}).get("override")]
    if overridden:
        raise SystemExit(
            f"{len(overridden)} gold track(s) carry a manual override "
            f"({', '.join(overridden[:3])}…). Those are your corrections, not Claude's "
            "output — scoring them as Claude compares your labels against your labels."
        )
    ix = g.index_of()
    order = np.full((len(track_ids), 5), -1, dtype=np.int64)
    scores = np.full((len(track_ids), len(g.cat_ids)), -np.inf, dtype=np.float64)
    for i, t in enumerate(track_ids):
        ms = cache["assignments"][t]["matches"]
        for j, m in enumerate(ms[:5]):
            c = ix[m["category_id"]]
            order[i, j] = c
            scores[i, c] = float(m["score"])
    return order, scores


# --------------------------------------------------------------------------
# metrics
# --------------------------------------------------------------------------


def top1_hit(order: np.ndarray, truth: list[set[int]]) -> np.ndarray:
    return np.array([1.0 if order[i, 0] in truth[i] else 0.0 for i in range(len(truth))])


def precision_at_3(order: np.ndarray, truth: list[set[int]]) -> np.ndarray:
    return np.array([len(set(order[i, :3].tolist()) & truth[i]) / 3.0 for i in range(len(truth))])


def recall_at_k(order: np.ndarray, truth: list[set[int]]) -> np.ndarray:
    """k = |truth|. Undefined for empty sets — those come back as NaN and are
    excluded from this metric only (§3.2)."""
    out = np.full(len(truth), np.nan)
    for i, s in enumerate(truth):
        if s:
            out[i] = len(set(order[i, : len(s)].tolist()) & s) / len(s)
    return out


METRICS = {
    "top1": top1_hit,
    "precision_at_3": precision_at_3,
    "recall_at_k": recall_at_k,
}


def paired_bootstrap(
    d: np.ndarray, artists: list[str], resamples: int, seed: int
) -> tuple[float, float, float]:
    """Resample ARTISTS with replacement, not songs (§6). Songs by one artist
    are not independent; treating them as independent narrows the interval by
    pretending there is more evidence than there is."""
    ok = ~np.isnan(d)
    d, artists = d[ok], [a for a, k in zip(artists, ok) if k]
    by: dict[str, list[int]] = {}
    for i, a in enumerate(artists):
        by.setdefault(a, []).append(i)
    keys = sorted(by)
    idx = [np.array(by[k]) for k in keys]
    rng = np.random.default_rng(seed)
    means = np.empty(resamples)
    for b in range(resamples):
        pick = rng.integers(0, len(keys), len(keys))
        means[b] = d[np.concatenate([idx[p] for p in pick])].mean()
    return float(np.nanmean(d)), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def volume_matched_threshold(student: np.ndarray, target_per_song: float) -> float:
    """§3.3: compare at equal volume. Find the student score cut that yields the
    same mean playlists-per-song Claude produces at its live score>=65 rule."""
    flat = np.sort(student.ravel())[::-1]
    want = int(round(target_per_song * student.shape[0]))
    want = min(max(want, 1), len(flat))
    return float(flat[want - 1])


# --------------------------------------------------------------------------
# baselines that need no model
# --------------------------------------------------------------------------


def artist_average_scores(g: gold_set.GoldSet, track_ids: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """§5.3: predict from the Claude labels of that artist's OTHER songs.
    Returns scores and a bool mask of where it was defined."""
    cache = json.loads((DATA / "cache.json").read_text())
    ix = g.index_of()
    by_artist: dict[str, list[str]] = {}
    for t, tr in cache["tracks"].items():
        by_artist.setdefault(tr["artist_id"], []).append(t)

    prior = np.zeros(len(g.cat_ids))
    for t in cache["tracks"]:
        prior[ix[cache["assignments"][t]["matches"][0]["category_id"]]] += 1

    out = np.zeros((len(track_ids), len(g.cat_ids)))
    defined = np.zeros(len(track_ids), dtype=bool)
    for i, t in enumerate(track_ids):
        others = [o for o in by_artist[g.artist_of[t]] if o != t]
        if not others:
            out[i] = prior
            continue
        defined[i] = True
        for o in others:
            for rank, m in enumerate(cache["assignments"][o]["matches"][:5]):
                out[i, ix[m["category_id"]]] += 5 - rank
    return out, defined


def global_prior_scores(g: gold_set.GoldSet, n: int) -> np.ndarray:
    cache = json.loads((DATA / "cache.json").read_text())
    ix = g.index_of()
    prior = np.zeros(len(g.cat_ids))
    for t in cache["tracks"]:
        prior[ix[cache["assignments"][t]["matches"][0]["category_id"]]] += 1
    return np.tile(prior, (n, 1))


# --------------------------------------------------------------------------


# --------------------------------------------------------------------------
# section 8 — revealed preference (non-blind, secondary, never the headline)
# --------------------------------------------------------------------------


def load_per_track() -> dict:
    p = ART / "streaming-per-track.json"
    if not p.exists():
        raise SystemExit(
            f"{p} missing. Run `venv/bin/python streaming-history.py` first — it needs the "
            "Extended Streaming History export in ~/Downloads."
        )
    return json.loads(p.read_text())


def eta_squared(vals: np.ndarray, groups: np.ndarray, k: int) -> float:
    """Between-category share of total variance. 0 means the categories say
    nothing about the measure; 1 means the measure is constant within each."""
    mu = vals.mean()
    ss_tot = float(((vals - mu) ** 2).sum())
    if ss_tot == 0.0:
        return 0.0
    cnt = np.bincount(groups, minlength=k).astype(np.float64)
    sums = np.bincount(groups, weights=vals, minlength=k)
    nz = cnt > 0
    means = np.zeros(k)
    means[nz] = sums[nz] / cnt[nz]
    return float((cnt * (means - mu) ** 2).sum() / ss_tot)


def permutation_eta(vals, groups, k, resamples, seed):
    """Null: shuffle the category assignment across songs, preserving category
    sizes. That is the right null here — it asks whether THESE categories carry
    listening structure, holding how many songs each one got."""
    obs = eta_squared(vals, groups, k)
    rng = np.random.default_rng(seed)
    g = groups.copy()
    null = np.empty(resamples)
    for b in range(resamples):
        rng.shuffle(g)
        null[b] = eta_squared(vals, g, k)
    p = (1 + int((null >= obs).sum())) / (resamples + 1)
    return obs, float(np.percentile(null, 95)), p


def streaming_axis(g, ids, orders, cfg):
    """GOLD-PROTOCOL.md section 8. Reported with its four caveats, every time."""
    per = load_per_track()
    k = len(g.cat_ids)
    res = cfg["bootstrap"]["resamples"]
    seed = cfg["bootstrap"]["seed"]

    played = [i for i, t in enumerate(ids) if t in per]
    skippable = [i for i in played if per[ids[i]]["plays"] >= 5]
    log(f"\n=== section 8: revealed preference (NON-BLIND, secondary) ===")
    log(f"  {len(played)}/{len(ids)} scored songs appear in the export; "
        f"{len(skippable)} have the >=5 plays a skip rate needs")
    if len(played) < 20:
        log("  too few played songs to say anything — skipping")
        return []

    measures = {
        "log1p(plays)": (
            played,
            np.log1p(np.array([per[ids[i]]["plays"] for i in played], dtype=np.float64)),
        ),
        "skip rate": (
            skippable,
            np.array(
                [per[ids[i]]["skips"] / per[ids[i]]["plays"] for i in skippable],
                dtype=np.float64,
            ),
        ),
    }

    rows = []
    for mname, (idx, vals) in measures.items():
        if len(idx) < 20:
            log(f"  {mname}: only {len(idx)} songs qualify — skipped")
            continue
        log(f"\n  {mname}  (n={len(idx)})")
        log(f"    {'model':24s} {'eta^2':>7} {'null p95':>9} {'p':>7}")
        for name, order in orders:
            groups = order[idx, 0].astype(np.int64)
            obs, p95, pval = permutation_eta(vals, groups, k, res, seed)
            flag = "" if pval < 0.05 else "   (not distinguishable from chance)"
            log(f"    {name:24s} {obs:7.4f} {p95:9.4f} {pval:7.4f}{flag}")
            rows.append({"measure": mname, "model": name, "n": len(idx),
                         "eta2": obs, "null_p95": p95, "p": pval})

    log("\n  Caveats, and they travel with this number wherever it is quoted:")
    log("   - NOT blind. This is Michael's own listening, not a held-out judgement.")
    log("   - Descriptive, not a truth test. Categories can track listening without")
    log("     being the right mood scheme, and the right scheme need not track listening.")
    log(f"   - Confounded by artist: {len(set(g.artist_of[t] for t in ids))} artists over "
        f"{len(ids)} songs, and play counts cluster hard by artist.")
    log("   - Cannot move the headline. If this and the blind-label result disagree, that")
    log("     is reported as a disagreement, not resolved in favour of the nicer one.")
    return rows


def report(name: str, order, truth, artists, cfg, baseline_d=None):
    row = {"model": name}
    for key, fn in METRICS.items():
        v = fn(order, truth)
        row[key] = float(np.nanmean(v))
        row[f"{key}_n"] = int((~np.isnan(v)).sum())
    if baseline_d is not None:
        d = METRICS[cfg["primary_metric"]](order, truth) - baseline_d
        m, lo, hi = paired_bootstrap(d, artists, cfg["bootstrap"]["resamples"], cfg["bootstrap"]["seed"])
        row["paired_delta"] = m
        row["ci95"] = [lo, hi]
        row["crosses_zero"] = lo <= 0.0 <= hi
    return row


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--freeze", action="store_true", help="answer the protocol's open questions")
    ap.add_argument("--primary", choices=["top1", "precision_at_3"])
    ap.add_argument("--empty-sets", choices=["include", "exclude"])
    ap.add_argument("--streaming-axis", action="store_true")
    ap.add_argument("--oof", default="oof.npz", help="npz from train.py --oof-out")
    ap.add_argument("--config", default="mert2-30s", help="which student config in the npz")
    ap.add_argument("--text-config", default="TEXT-ONLY (clap text)")
    ap.add_argument("--out", default="gold-results.json")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()

    if a.self_test:
        return self_test()
    if a.freeze:
        if not a.primary or not a.empty_sets:
            raise SystemExit("--freeze needs --primary and --empty-sets")
        return freeze(a.primary, a.empty_sets, a.streaming_axis)

    cfg = load_config()
    g = gold_set.load()
    lab = read_labels(set(g.track_ids))

    log(f"gold set {len(g.track_ids)} | eligible {len(g.eligible)} | excluded {len(g.excluded)}")
    log(f"labelled: {len(lab.ticks)} pass-1, {len(lab.cant_judge)} cant_judge, "
        f"{len(lab.empty)} empty ticks, {len(lab.pass2)} pass-2")
    if not lab.ticks:
        raise SystemExit(
            "0 gold songs have a pass-1 track label. Phase 3 cannot start.\n"
            "Label them at /label, then re-run."
        )

    # §4: primary denominator
    ids = [t for t in g.eligible if t in lab.ticks and t not in lab.cant_judge]
    if not cfg["include_empty_sets"]:
        ids = [t for t in ids if t not in lab.empty]
    log(f"primary denominator: {len(ids)} songs, {len(set(g.artist_of[t] for t in ids))} artists")

    ix = g.index_of()
    truth = [{ix[c] for c in lab.ticks[t]} for t in ids]
    artists = [g.artist_of[t] for t in ids]

    claude_order, claude_scores = claude_rankings(g, ids)
    base_d = METRICS[cfg["primary_metric"]](claude_order, truth)

    z = np.load(ART / a.oof, allow_pickle=False)
    isrc_rows = {s: i for i, s in enumerate(z["isrc"].tolist())}
    rows = np.array([isrc_rows[g.isrc_of[t]] for t in ids])

    orders = [("claude", claude_order)]
    table = [report("claude", claude_order, truth, artists, cfg)]
    for label, key in (("student (audio)", a.config), ("text-only (CLAP text)", a.text_config)):
        k = f"scores__{key}"
        if k not in z:
            log(f"  ! {label}: '{key}' not in {a.oof} — run train.py --only \"{key}\" --oof-out")
            continue
        o = rank_from_scores(z[k][rows])
        orders.append((label, o))
        table.append(report(label, o, truth, artists, cfg, base_d))

    aa, defined = artist_average_scores(g, ids)
    aa_order = rank_from_scores(aa)
    orders.append(("artist-average", aa_order))
    table.append(report("artist-average", aa_order, truth, artists, cfg, base_d))
    log(f"  artist-average defined for {int(defined.sum())}/{len(ids)} songs "
        f"(rest fall back to the global prior)")
    prior_order = rank_from_scores(global_prior_scores(g, len(ids)))
    orders.append(("global prior", prior_order))
    table.append(report("global prior", prior_order, truth, artists, cfg, base_d))

    log(f"\n{'model':24s} {'top1':>7} {'p@3':>7} {'rec@k':>7}   paired Δ vs claude "
        f"[{cfg['primary_metric']}]")
    for r in table:
        d = ""
        if "paired_delta" in r:
            d = (f"  {r['paired_delta']*100:+6.1f} pts  "
                 f"[{r['ci95'][0]*100:+5.1f}, {r['ci95'][1]*100:+5.1f}]"
                 f"{'  CROSSES ZERO' if r['crosses_zero'] else ''}")
        log(f"{r['model']:24s} {r['top1']*100:6.1f}% {r['precision_at_3']*100:6.1f}% "
            f"{r['recall_at_k']*100:6.1f}%{d}")

    # §4: intention-to-treat — all 251, student falls back to Claude with no audio.
    itt_ids = [t for t in g.track_ids if t in lab.ticks and t not in lab.cant_judge]
    if not cfg["include_empty_sets"]:
        itt_ids = [t for t in itt_ids if t not in lab.empty]
    log(f"\nintention-to-treat denominator: {len(itt_ids)} songs "
        f"({len([t for t in itt_ids if t in g.excluded])} fall back to Claude)")

    # self-agreement ceiling from the pass-2 relabels
    both = [t for t in lab.pass2 if t in lab.ticks]
    if both:
        same = sum(1 for t in both if lab.pass2[t] == lab.ticks[t])
        log(f"your own self-agreement (pass 1 vs pass 2, n={len(both)}): "
            f"{same/len(both)*100:.1f}% identical sets")

    streaming = streaming_axis(g, ids, orders, cfg) if cfg.get("streaming_axis") else []

    payload = {
        "config": cfg,
        "streaming_axis": streaming,
        "gold": {"n": len(g.track_ids), "eligible": len(g.eligible), "excluded": g.excluded},
        "denominator": {"primary": len(ids), "itt": len(itt_ids),
                        "artists": len(set(artists))},
        "labels": {"pass1": len(lab.ticks), "cant_judge": len(lab.cant_judge),
                   "empty": len(lab.empty), "pass2": len(lab.pass2)},
        "table": table,
    }
    (ART / a.out).write_text(json.dumps(payload, indent=2))
    log(f"\nwrote {ART / a.out}")


# --------------------------------------------------------------------------


def self_test() -> None:
    """Hand-checked arithmetic, in the style of plackett_luce.py. Runs without
    any label existing, which is the only way to test this before Phase 3."""
    # ranking with a deliberate tie: cats 1 and 3 both score 9.
    s = np.array([[1.0, 9.0, 5.0, 9.0]])
    order = rank_from_scores(s)
    assert order[0].tolist() == [1, 3, 2, 0], order[0].tolist()
    log("tie-break by ascending index      OK")

    order = np.array([[2, 0, 1, 3], [3, 1, 0, 2]])
    truth = [{2, 1}, {0}]
    assert top1_hit(order, truth).tolist() == [1.0, 0.0]
    log("top-1 hit                         OK")
    # row 0: top3 = {2,0,1}, truth {2,1} -> 2/3. row 1: top3 = {3,1,0}, truth {0} -> 1/3.
    assert np.allclose(precision_at_3(order, truth), [2 / 3, 1 / 3])
    log("precision@3                       OK")
    # row 0: k=2, top2={2,0}, truth {2,1} -> 1/2. row 1: k=1, top1={3}, truth {0} -> 0.
    assert np.allclose(recall_at_k(order, truth), [0.5, 0.0])
    log("recall@k                          OK")
    # empty truth set -> NaN, excluded from that metric only
    assert np.isnan(recall_at_k(np.array([[0, 1, 2, 3]]), [set()])[0])
    log("recall@k undefined on empty set   OK")

    # A paired difference of exactly +1 everywhere must bootstrap to [1, 1].
    d = np.ones(20)
    arts = [f"a{i//2}" for i in range(20)]
    m, lo, hi = paired_bootstrap(d, arts, 200, 7)
    assert (m, lo, hi) == (1.0, 1.0, 1.0), (m, lo, hi)
    log("paired bootstrap, degenerate case OK")

    # Artist resampling must be coarser than song resampling: 10 artists of 2
    # identical songs each gives a WIDER interval than 20 independent songs.
    rng = np.random.default_rng(0)
    d2 = np.repeat(rng.normal(0, 1, 10), 2)
    _, lo_a, hi_a = paired_bootstrap(d2, [f"a{i//2}" for i in range(20)], 2000, 7)
    _, lo_s, hi_s = paired_bootstrap(d2, [f"s{i}" for i in range(20)], 2000, 7)
    assert (hi_a - lo_a) > (hi_s - lo_s), (hi_a - lo_a, hi_s - lo_s)
    log(f"artist grouping widens the CI     OK  ({hi_a-lo_a:.3f} > {hi_s-lo_s:.3f})")

    # volume matching: 4 songs x 5 cats, want 2.0 per song -> cut at the 8th best
    st = np.arange(20, dtype=float).reshape(4, 5)
    assert volume_matched_threshold(st, 2.0) == 12.0, volume_matched_threshold(st, 2.0)
    log("volume-matched threshold          OK")

    # --- section 8 statistic, hand-checked ---
    # perfect separation: mu=3, ss_tot=16, ss_between=2*(1-3)^2+2*(5-3)^2=16 -> 1.0
    assert eta_squared(np.array([1.0, 1, 5, 5]), np.array([0, 0, 1, 1]), 2) == 1.0
    # same spread inside both groups: both group means are 3 -> ss_between=0 -> 0.0
    assert eta_squared(np.array([1.0, 5, 1, 5]), np.array([0, 0, 1, 1]), 2) == 0.0
    # a constant measure has no variance to apportion
    assert eta_squared(np.array([2.0, 2, 2, 2]), np.array([0, 0, 1, 1]), 2) == 0.0
    log("eta^2 hand arithmetic             OK")

    vals = np.array([1.0] * 10 + [9.0] * 10)
    sep = np.array([0] * 10 + [1] * 10)
    obs, p95, pv = permutation_eta(vals, sep, 2, 500, 1)
    assert obs == 1.0 and pv < 0.01, (obs, pv)
    mixed = np.array([0, 1] * 10)
    obs2, _, pv2 = permutation_eta(vals, mixed, 2, 500, 1)
    assert obs2 < 0.01 and pv2 > 0.5, (obs2, pv2)
    log(f"permutation null separates        OK  (p={pv:.4f} vs {pv2:.3f})")

    g = gold_set.load()
    assert len(g.track_ids) == 251 and len(g.eligible) == 242, (len(g.track_ids), len(g.eligible))
    log(f"gold set 251 / eligible 242       OK")
    log("\nall self-tests passed")


if __name__ == "__main__":
    main()
