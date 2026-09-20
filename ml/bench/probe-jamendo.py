"""S12 half A, step 3: the MARBLE-faithful linear probe on MTG-Jamendo mood/theme.

Reproduces the number on the MERT-v2-30s model card: macro AUROC 0.7944 /
macro AP 0.16677 on split-0 test, from `marble_results.json`
(representation.mode="fixed_layer", layer=16, hidden_state_index=15,
learning_rate=0.001, probe_seed=1234).

Protocol, taken from MARBLE v2's own configs and datamodule rather than from
memory:
  - Features: ONE fixed hidden-state layer, time-averaged over frames
    (TimeAvgPool). Layer 16 is index 15. `--layer all` sweeps every layer, which
    is the honest way to show that index 15 is genuinely the card's layer and
    not an off-by-one — see the OFF-BY-ONE note below.
  - Probe: MLPDecoder — Linear(d, 512) -> ReLU -> Dropout(0.2) -> Linear(512, 56).
  - Loss: BCEWithLogitsLoss over the 56 binary tags.
  - Optimiser: Adam, lr 1e-3, batch 32, max 20 epochs.
  - Scheduler: ReduceLROnPlateau(mode=max, factor=0.5, patience=3) on val macro
    AUROC. Early stopping: patience 10 on the same quantity.
  - TRAINING is per 30 s clip: every clip of a track carries that track's labels.
    EVALUATION is per FILE: a track's clip LOGITS are averaged before the metric.
    That asymmetry is the single most important detail for reproducibility.
  - Metrics: macro ROC-AUC and macro average precision over all 56 tags.

OFF-BY-ONE, the one that would quietly cost a day: `hidden_states` from a HF
model usually has n_layers + 1 entries (the embedding output, then each layer).
embed-jamendo.py asserts MERT-v2 returns exactly 24, so this file's axis is
already 0..23 with no embedding-output entry, and index 15 maps to the card's
"layer 16". If that assumption is ever wrong the sweep makes it visible instead
of silent: the best layer would land at 14 or 16 rather than 15.

TAG ORDER: taken from manifest.json's `tags56` and checked against its recorded
sha256 before anything is built. It is the order of `moodtheme_split.txt`, NOT
the 59-tag `moodtheme.txt` — that file still holds ambiental/horror/mellow, so
using it shifts every index after "advertising" and lands macro AUROC near 0.50,
which looks exactly like a model that failed to learn.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import average_precision_score, roc_auc_score

BENCH = Path(__file__).resolve().parent
ART = BENCH.parent / "artifacts" / "jamendo"
EMB = ART / "emb"
SPLITS = ("train", "validation", "test")

# MARBLE v2 MTGMood constants. Changing any of these makes the result no longer
# comparable with the published number, so they are named, not inlined.
HIDDEN = 512
DROPOUT = 0.2
LR = 1e-3
BATCH = 32
MAX_EPOCHS = 20
SCHED_FACTOR = 0.5
SCHED_PATIENCE = 3
EARLYSTOP_PATIENCE = 10
PROBE_SEED = 1234
# Published numbers are PER ENCODER. Attaching MERT-v2-30s's 0.7944 to a mert1
# run would invite exactly the wrong comparison from whoever reads the JSON next,
# and the off-by-one verdict would be worse than wrong: MERT-v1-95M is a 12-layer
# HubertModel whose 13 hidden states DO include the embedding output, so its axis
# genuinely is offset by one relative to MERT-v2's.
CARDS = {
    "mert2": {"auroc": 0.7944093942642212, "ap": 0.16676680743694305, "layer_index": 15},
}
CARD_LAYER_INDEX = CARDS["mert2"]["layer_index"]  # the default --layer


def log(m: str) -> None:
    print(m, flush=True)


# --------------------------------------------------------------------------
# data
# --------------------------------------------------------------------------


def load_tags() -> list[str]:
    manifest = json.loads((ART / "manifest.json").read_text())
    tags = manifest["tags56"]
    got = hashlib.sha256("\n".join(tags).encode()).hexdigest()
    if got != manifest["tags56_sha256"]:
        raise SystemExit(
            f"tag-order sha mismatch: {got[:16]} != {manifest['tags56_sha256'][:16]}. "
            "Refusing to run — a wrong tag order looks like a failed model."
        )
    if len(tags) != 56:
        raise SystemExit(f"expected 56 tags, manifest has {len(tags)}")
    return tags


def read_split(name: str) -> list[dict]:
    """One row per track. `key` is the bare numeric id, which is how
    embed-jamendo.py names tracks (PATH `48/948.mp3` -> member `48/948.low.mp3`
    -> id `948`). Verified unique across all 17,982 split rows."""
    rows = []
    with (ART / f"split0-{name}.tsv").open() as fh:
        rd = csv.reader(fh, delimiter="\t")
        hdr = next(rd)
        idx = {k: i for i, k in enumerate(hdr)}
        for r in rd:
            if not r:
                continue
            rows.append(
                {
                    "key": r[idx["PATH"]].split("/")[1].removesuffix(".mp3"),
                    "artist": r[idx["ARTIST_ID"]],
                    "tags": [t for t in r[len(hdr) - 1 :] if t],
                }
            )
    return rows


def load_embeddings(encoder: str, layers: list[int]) -> tuple[dict, int]:
    """Read every part present and keep ONLY the requested layers, and keep them
    in the stored float16. Measured at full scale (122,856 clips x 1024): one
    layer is 0.25 GB in fp16 against 0.50 GB in fp32, and all 24 are 6.0 GB
    against 12.1 GB — and build()'s concatenate transiently doubles whichever it
    is, so casting here would peak near 24 GB with the sweep also resident.
    train_one_layer casts the ONE layer it needs.

    Returns {bare_id: float32 array [n_clips, len(layers), d]} and the layer count
    the encoder actually produced.
    """
    # NOT f"{encoder}-*.npz": embed-jamendo.py writes each part through
    # `mert2-NN.npz.part`, and np.savez_compressed appends `.npz` to that, so the
    # live file is `mert2-NN.npz.part.npz` — which `*` happily matches across the
    # dots. Globbing it mid-write raises BadZipFile, and a run killed during those
    # ~1.6 s leaves the stale temp behind to break every later probe run. The part
    # index is always two digits, so pin it.
    parts = sorted(EMB.glob(f"{encoder}-[0-9][0-9].npz"))
    if not parts:
        raise SystemExit(f"no embeddings at {EMB}/{encoder}-*.npz — run embed-jamendo.py first")
    out: dict[str, np.ndarray] = {}
    n_layers_seen = None
    for p in parts:
        try:
            z = np.load(p, allow_pickle=False)
        except Exception as e:  # name the file: "not a zip file" alone is useless
            raise SystemExit(f"{p.name} is unreadable ({type(e).__name__}: {e}) — "
                             "if the sweep was killed mid-write, delete it and re-run that part")
        ids, counts, emb = z["track_id"], z["chunk_counts"], z["emb"]
        if n_layers_seen is None:
            n_layers_seen = emb.shape[1]
        elif emb.shape[1] != n_layers_seen:
            raise SystemExit(f"{p.name} has {emb.shape[1]} layers, expected {n_layers_seen}")
        if int(counts.sum()) != emb.shape[0]:
            raise SystemExit(f"{p.name}: chunk_counts sum {counts.sum()} != {emb.shape[0]} rows")
        bad = [l for l in layers if l >= emb.shape[1]]
        if bad:
            raise SystemExit(f"layer(s) {bad} out of range; {encoder} has {emb.shape[1]}")
        sel = np.ascontiguousarray(emb[:, layers, :])  # stays float16
        off = 0
        for tid, c in zip(ids.tolist(), counts.tolist()):
            out[tid] = sel[off : off + c]
            off += c
        del emb, sel, z
    return out, int(n_layers_seen)


def build(split_rows, embs, tags):
    """Inner-join a split against whatever has been embedded so far.

    The tars carry all 18,486 mood/theme tracks but the splits keep 17,982 — the
    504 whose only tags were the three dropped ones are in the audio and NOT in
    any split, so this join is genuinely inner in both directions.
    """
    tag_ix = {t: i for i, t in enumerate(tags)}
    clips, track_of, Y, keys, artists = [], [], [], [], []
    unknown = set()
    for ti, r in enumerate(x for x in split_rows if x["key"] in embs):
        v = embs[r["key"]]
        clips.append(v)
        track_of.append(np.full(v.shape[0], len(keys), dtype=np.int64))
        y = np.zeros(len(tags), dtype=np.float32)
        for t in r["tags"]:
            if t in tag_ix:
                y[tag_ix[t]] = 1.0
            else:
                unknown.add(t)
        Y.append(y)
        keys.append(r["key"])
        artists.append(r["artist"])
    if not keys:
        raise SystemExit("inner join produced 0 tracks — embeddings and splits do not overlap")
    return {
        "X": np.concatenate(clips),                  # [n_clips, n_sel_layers, d]
        "track_of": np.concatenate(track_of),        # [n_clips] -> track row
        "Y": np.stack(Y),                            # [n_tracks, 56]
        "keys": keys,
        "artists": artists,
        "unknown_tags": sorted(unknown),
        "n_total": len(split_rows),
    }


# --------------------------------------------------------------------------
# probe
# --------------------------------------------------------------------------


class MLPDecoder(nn.Module):
    def __init__(self, d_in: int, n_out: int = 56):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_in, HIDDEN), nn.ReLU(), nn.Dropout(DROPOUT), nn.Linear(HIDDEN, n_out)
        )

    def forward(self, x):
        return self.net(x)


def file_level(logits: np.ndarray, track_of: np.ndarray, n_tracks: int) -> np.ndarray:
    """Average clip LOGITS into one row per track — MARBLE's file-level
    aggregation. Sigmoid afterwards is a no-op for both metrics (they are
    rank-based and sigmoid is monotone), so it is deliberately not applied.
    Averaging probabilities instead of logits would be a different, lower number.
    """
    out = np.zeros((n_tracks, logits.shape[1]), dtype=np.float64)
    np.add.at(out, track_of, logits)
    counts = np.bincount(track_of, minlength=n_tracks).astype(np.float64)[:, None]
    return out / np.maximum(counts, 1)


_WARNED: set[str] = set()


def macro_scores(y_true: np.ndarray, y_score: np.ndarray, warn_key: str = "") -> tuple[float, float]:
    """Macro over the 56 tags. Columns with no positives are undefined for
    ROC-AUC, so they are dropped from the average and the caller is told how
    many — silently averaging them in would inflate or deflate the headline.
    Warned once per split, not once per epoch."""
    keep = (y_true.sum(0) > 0) & (y_true.sum(0) < len(y_true))
    if not keep.all() and warn_key not in _WARNED:
        _WARNED.add(warn_key)
        log(f"    ! {int((~keep).sum())}/56 tag(s) degenerate in {warn_key or 'this split'}, "
            "excluded from the macro average")
    yt, ys = y_true[:, keep], y_score[:, keep]
    return (
        float(roc_auc_score(yt, ys, average="macro")),
        float(average_precision_score(yt, ys, average="macro")),
    )


def train_one_layer(data, li: int, device: str, epochs: int, verbose: bool):
    torch.manual_seed(PROBE_SEED)
    np.random.seed(PROBE_SEED)

    tr, va, te = data["train"], data["validation"], data["test"]
    d = tr["X"].shape[2]

    # .astype returns a C-contiguous fp32 copy of just this layer (0.5 GB at full
    # scale), leaving the 6 GB fp16 store untouched.
    Xtr = torch.from_numpy(tr["X"][:, li, :].astype(np.float32))
    Ytr = torch.from_numpy(tr["Y"][tr["track_of"]])  # clip-level labels
    Xva = torch.from_numpy(va["X"][:, li, :].astype(np.float32)).to(device)
    Xte = torch.from_numpy(te["X"][:, li, :].astype(np.float32)).to(device)

    model = MLPDecoder(d).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(
        opt, mode="max", factor=SCHED_FACTOR, patience=SCHED_PATIENCE
    )
    lossf = nn.BCEWithLogitsLoss()

    def infer(X, split):
        model.eval()
        outs = []
        with torch.no_grad():
            for s in range(0, len(X), 4096):
                outs.append(model(X[s : s + 4096]).float().cpu().numpy())
        lg = np.concatenate(outs)
        return file_level(lg, split["track_of"], len(split["keys"]))

    best = {"auroc": -1.0, "epoch": -1, "state": None}
    since = 0
    n = len(Xtr)
    for ep in range(1, epochs + 1):
        model.train()
        perm = torch.randperm(n)
        tot = 0.0
        for s in range(0, n, BATCH):
            ix = perm[s : s + BATCH]
            xb, yb = Xtr[ix].to(device), Ytr[ix].to(device)
            opt.zero_grad()
            loss = lossf(model(xb), yb)
            loss.backward()
            opt.step()
            tot += loss.item() * len(ix)
        va_auroc, va_ap = macro_scores(va["Y"], infer(Xva, va), "validation")
        sched.step(va_auroc)
        if va_auroc > best["auroc"]:
            best = {
                "auroc": va_auroc,
                "epoch": ep,
                "state": {k: v.detach().clone() for k, v in model.state_dict().items()},
            }
            since = 0
        else:
            since += 1
        if verbose:
            log(
                f"    epoch {ep:2d}  train_loss {tot/n:.4f}  val_auroc {va_auroc:.4f}  "
                f"val_ap {va_ap:.4f}  lr {opt.param_groups[0]['lr']:.2e}"
                f"{'  *' if best['epoch'] == ep else ''}"
            )
        if since >= EARLYSTOP_PATIENCE:
            log(f"    early stop at epoch {ep} (no val gain for {EARLYSTOP_PATIENCE})")
            break

    model.load_state_dict(best["state"])
    te_auroc, te_ap = macro_scores(te["Y"], infer(Xte, te), "test")
    va_auroc, va_ap = macro_scores(va["Y"], infer(Xva, va), "validation")
    return {
        "test_auroc": te_auroc,
        "test_ap": te_ap,
        "val_auroc": va_auroc,
        "val_ap": va_ap,
        "best_epoch": best["epoch"],
    }


# --------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--encoder", default="mert2")
    ap.add_argument(
        "--layer",
        default=str(CARD_LAYER_INDEX),
        help="hidden-state index, or 'all' to sweep every layer (slower, more memory)",
    )
    ap.add_argument("--device", default="auto")
    ap.add_argument("--epochs", type=int, default=MAX_EPOCHS)
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--out", default=None, help="write results JSON here")
    a = ap.parse_args()

    dev = a.device
    if dev == "auto":
        dev = "mps" if torch.backends.mps.is_available() else "cpu"

    card = CARDS.get(a.encoder)
    if card is None:
        log(f"note: no published MARBLE result for {a.encoder!r} — reporting measured "
            "numbers only, with no delta and no layer verdict.")

    tags = load_tags()
    log(f"tags: {len(tags)} in manifest order (sha verified)")

    # peek at layer count with a cheap single-layer load, then widen if needed
    probe_layers = [0]
    _, n_layers = load_embeddings(a.encoder, probe_layers)
    layers = list(range(n_layers)) if a.layer == "all" else [int(a.layer)]
    log(f"encoder {a.encoder}: {n_layers} layers; probing {layers if len(layers)<5 else 'all'}")

    embs, _ = load_embeddings(a.encoder, layers)
    log(f"embedded tracks available: {len(embs):,}")

    data = {}
    for s in SPLITS:
        rows = read_split(s)
        data[s] = build(rows, embs, tags)
        b = data[s]
        pct = 100 * len(b["keys"]) / b["n_total"]
        log(
            f"  {s:11s} {len(b['keys']):6,}/{b['n_total']:,} tracks ({pct:5.1f}%), "
            f"{len(b['track_of']):7,} clips, {int(b['Y'].sum()):,} positives"
        )
        if b["unknown_tags"]:
            raise SystemExit(f"{s}: tags outside the 56: {b['unknown_tags'][:5]}")
    del embs

    cov = len(data["test"]["keys"]) / data["test"]["n_total"]
    partial = cov < 0.999
    if partial:
        log(
            f"\n  ! PARTIAL SWEEP: {cov*100:.1f}% of split-0 test is embedded. Parts are "
            "assigned by track id, so this is a random subsample of tracks — the number is "
            "honest but has wider error bars than the published one and is NOT a full "
            "reproduction. Macro AP in particular is INFLATED here: rare tags lose all their "
            "positives first and drop out of the average, and they are exactly the low-AP ones."
        )

    results = {}
    t0 = time.time()
    for li in layers:
        tag = f"layer {li}" + (" (card)" if card and li == card["layer_index"] else "")
        log(f"\n=== {tag} ===")
        results[li] = train_one_layer(data, layers.index(li), dev, a.epochs, not a.quiet)
        r = results[li]
        log(
            f"  -> test macro AUROC {r['test_auroc']:.4f}  macro AP {r['test_ap']:.4f}  "
            f"(best epoch {r['best_epoch']})"
        )

    log(f"\n{'layer':>6}  {'test AUROC':>10}  {'test AP':>8}  {'val AUROC':>9}  {'epoch':>5}")
    for li in sorted(results):
        r = results[li]
        mark = "  <- card layer" if card and li == card["layer_index"] else ""
        log(
            f"{li:>6}  {r['test_auroc']:>10.4f}  {r['test_ap']:>8.4f}  "
            f"{r['val_auroc']:>9.4f}  {r['best_epoch']:>5}{mark}"
        )

    if card and card["layer_index"] in results:
        r = results[card["layer_index"]]
        log(
            f"\npublished {a.encoder:11s}: AUROC {card['auroc']:.4f}  AP {card['ap']:.4f}"
            f"\nthis reproduction     : AUROC {r['test_auroc']:.4f}  AP {r['test_ap']:.4f}"
            f"\ndelta                 : {r['test_auroc']-card['auroc']:+.4f}      "
            f"{r['test_ap']-card['ap']:+.4f}"
            + ("   [partial sweep — not a full reproduction]" if partial else "")
        )
    if a.layer == "all":
        top = sorted(results, key=lambda k: -results[k]["val_auroc"])[:3]
        log(f"\ntop 3 layers by VAL auroc: {top}")
        ci = card["layer_index"] if card else None
        if ci is None:
            log(f"  No published layer for {a.encoder!r} — nothing to compare this against.")
        elif partial:
            log(
                "  Partial sweep — the layer curve is noise at this coverage and says nothing "
                f"about whether index {ci} is the card's layer. Re-run when the sweep completes "
                "before reading anything into it."
            )
        elif top[0] == ci:
            log("  Matches the card's index — no off-by-one in the hidden-state axis.")
        else:
            # An argmax over 24 layers is only meaningful if the curve has a peak.
            # On this task layers 7-23 sit inside ~0.005 val AUROC, so the winner is
            # decided by seed noise, and reporting it as a disagreement with the card
            # would be reading structure into a flat line.
            gap = results[top[0]]["val_auroc"] - results[ci]["val_auroc"]
            spread = max(r["val_auroc"] for r in results.values()) - min(
                r["val_auroc"] for r in results.values()
            )
            if gap < 0.01:
                log(
                    f"  Card says {ci}, which trails the best by only {gap:.4f} val AUROC "
                    f"(whole-curve spread {spread:.4f}). One seed cannot separate those, so "
                    "this is a flat curve, NOT a disagreement with the card and not an "
                    "off-by-one — the layer choice barely matters on this task."
                )
            else:
                log(
                    f"  Card says {ci}; the best beats it by {gap:.4f} val AUROC. A best at "
                    f"{ci-1} or {ci+1} would suggest the hidden_states axis is offset by one; "
                    "further away is a real disagreement with the card."
                )

    log(f"\ntotal {(time.time()-t0)/60:.1f} min on {dev}")

    if a.out:
        payload = {
            "encoder": a.encoder,
            "device": dev,
            "protocol": {
                "hidden": HIDDEN, "dropout": DROPOUT, "lr": LR, "batch": BATCH,
                "max_epochs": a.epochs, "seed": PROBE_SEED,
                "sched": f"ReduceLROnPlateau(max,{SCHED_FACTOR},{SCHED_PATIENCE})",
                "earlystop_patience": EARLYSTOP_PATIENCE,
                "eval": "file-level mean of clip logits",
            },
            "coverage": {
                s: {"tracks": len(data[s]["keys"]), "of": data[s]["n_total"],
                    "clips": int(len(data[s]["track_of"]))}
                for s in SPLITS
            },
            "partial_sweep": partial,
            "published": card,  # None when this encoder has no MARBLE entry
            "results": {str(k): v for k, v in results.items()},
        }
        Path(a.out).write_text(json.dumps(payload, indent=2))
        log(f"wrote {a.out}")


if __name__ == "__main__":
    sys.exit(main())
