"""S1 "Ears" Phase 2: train the student on frozen embeddings, grouped by artist.

WHAT IS BEING MEASURED HERE. Checkpoint B asks only "can a model that listens
reproduce Claude's ranking on artists it has never heard?". It is NOT the
headline claim — that needs Michael's blind labels and lives in Phase 3. A high
number here means the audio carries the teacher's signal; it does not mean the
student is right, because the teacher is often wrong.

THE CEILING MATTERS MORE THAN THE SCORE. Claude classified 119 recordings twice
and agreed with its own top-1 only 60.5% of the time. No student can exceed that
by imitation, so every number below is printed next to it. A student at 40% has
covered two thirds of the reproducible signal, not 40% of the truth.

THE LAYER SOFTMAX. MERT hands back one vector per transformer layer (13 for v1,
24 for v2). Different layers carry different things — lower layers sit closer to
acoustics, higher ones closer to structure — and which layer you pick moves
published benchmark numbers by points. Rather than guess, the student learns one
weight per layer through a softmax and takes the weighted sum. The learned
weights are reported, because "which layer did it use" is a real finding.

HONEST SPLITTING. Folds are grouped by artist, and the early-stopping split
inside each training fold is grouped by artist too. An inner split that ignored
artists would leak the same artist into model selection and quietly inflate
everything downstream.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from dataset import Dataset, grouped_folds, load, teacher_self_agreement
from plackett_luce import plackett_luce_loss

ART = Path(__file__).resolve().parent / "artifacts"
N_CAT = 41
SEED = 20260919
# Swept on the inner split per fold. The range is wide on purpose: the useful
# values here are 1-100, far above the 1e-2 that is conventional for a probe.
WD_GRID = [1.0, 5.0, 20.0, 60.0]


class Student(nn.Module):
    """Linear probe, or a 2-layer net, on frozen embeddings.

    `specs` is a list of (block name, shape). A (L, D) block gets its own
    learned softmax over the L layers; a (D,) block is used as-is. Blocks are
    pooled, concatenated, then read by one head.
    """

    def __init__(
        self,
        specs: list[tuple[str, tuple[int, ...]]],
        hidden: int = 0,
        aux_dim: int = 0,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.specs = specs
        self.layer_logits = nn.ParameterDict()
        total = 0
        for name, shape in specs:
            if len(shape) == 2:
                self.layer_logits[name] = nn.Parameter(torch.zeros(shape[0]))
                total += shape[1]
            else:
                total += shape[0]
        self.drop = nn.Dropout(dropout)
        if hidden:
            self.head = nn.Sequential(
                nn.Linear(total, hidden), nn.GELU(), nn.Dropout(dropout), nn.Linear(hidden, N_CAT)
            )
        else:
            self.head = nn.Linear(total, N_CAT)
        self.aux = nn.Linear(total, aux_dim) if aux_dim else None

    def pool(self, xs: dict[str, torch.Tensor]) -> torch.Tensor:
        parts = []
        for name, shape in self.specs:
            x = xs[name]
            if len(shape) == 2:
                w = torch.softmax(self.layer_logits[name], dim=0)
                x = (x * w[None, :, None]).sum(1)
            parts.append(x)
        return torch.cat(parts, dim=1)

    def forward(self, xs: dict[str, torch.Tensor]):
        z = self.drop(self.pool(xs))
        return self.head(z), (self.aux(z) if self.aux is not None else None)

    def layer_weights(self) -> dict[str, list[float]]:
        return {
            k: torch.softmax(v.detach(), dim=0).cpu().numpy().round(4).tolist()
            for k, v in self.layer_logits.items()
        }


def standardise(train: np.ndarray, *others: np.ndarray):
    """Z-score using TRAIN statistics only. Fitting on everything would leak the
    held-out fold's distribution into the model that is about to be judged on it."""
    axes = tuple(range(train.ndim - 1))
    mu = train.mean(axis=axes, keepdims=True)
    sd = train.std(axis=axes, keepdims=True) + 1e-6
    return [(a - mu) / sd for a in (train, *others)]


def metrics(scores: torch.Tensor, ranking: torch.Tensor) -> dict[str, float]:
    """All against Claude's ranking, which is an imitation target, not truth."""
    top1 = ranking[:, 0]
    pred = scores.argmax(1)
    order = scores.argsort(dim=1, descending=True)
    in3 = (order[:, :3] == top1[:, None]).any(1)
    in5 = (order[:, :5] == top1[:, None]).any(1)
    rank_of_top1 = (order == top1[:, None]).float().argmax(1) + 1

    # NDCG@5 over the teacher's 5, graded 5..1 by position.
    gains = torch.tensor([5.0, 4.0, 3.0, 2.0, 1.0], device=scores.device)
    disc = 1.0 / torch.log2(torch.arange(5, device=scores.device).float() + 2)
    ideal = float((gains * disc).sum())
    pos = torch.full_like(scores, -1.0)
    pos.scatter_(1, ranking, gains.expand(ranking.shape[0], 5))
    got = pos.gather(1, order[:, :5]).clamp(min=0.0)
    ndcg = float(((got * disc).sum(1) / ideal).mean())

    return {
        "top1_agree": float((pred == top1).float().mean()),
        "top1_in_top3": float(in3.float().mean()),
        "top1_in_top5": float(in5.float().mean()),
        "mean_rank_of_teacher_top1": float(rank_of_top1.float().mean()),
        "ndcg@5": ndcg,
        "pl_loss": float(plackett_luce_loss(scores, ranking)),
    }


def run_fold(
    ds: Dataset,
    blocks: list[str],
    tr: np.ndarray,
    va: np.ndarray,
    te: np.ndarray,
    device: str,
    hidden: int,
    aux_weight: float,
    epochs: int,
    lr: float,
    wd: float,
) -> tuple[dict[str, float], dict[str, list[float]], dict[str, float]]:
    """Train once at a given weight decay. Caller sweeps wd on the inner split.

    Regularisation is the whole game here, not a detail. 41 categories, ~1,750
    training rows and up to 2,816 features means an unregularised probe reaches
    50% on train while FALLING below the majority-class baseline on held-out
    artists. Measured on this data: MERT-v2 goes 27.6% -> 37.3% top-1 as weight
    decay rises from 0.001 to 20.
    """
    xs_tr, xs_va, xs_te, specs = {}, {}, {}, []
    for b in blocks:
        a = ds.blocks[b]
        s_tr, s_va, s_te = standardise(a[tr], a[va], a[te])
        xs_tr[b] = torch.tensor(s_tr, dtype=torch.float32, device=device)
        xs_va[b] = torch.tensor(s_va, dtype=torch.float32, device=device)
        xs_te[b] = torch.tensor(s_te, dtype=torch.float32, device=device)
        specs.append((b, a.shape[1:]))

    y_tr = torch.tensor(ds.ranking[tr], device=device)
    y_va = torch.tensor(ds.ranking[va], device=device)
    y_te = torch.tensor(ds.ranking[te], device=device)

    aux_dim = 0
    if aux_weight > 0:
        aux_dim = ds.blocks["ess_mood"].shape[1]
        a_tr = torch.tensor(ds.blocks["ess_mood"][tr], dtype=torch.float32, device=device)

    torch.manual_seed(SEED)
    model = Student(specs, hidden=hidden, aux_dim=aux_dim).to(device)
    # Weight decay belongs on the head's weight matrices and nowhere else.
    # Applied to the layer logits it shrinks them toward zero, and zero logits
    # are a UNIFORM softmax — so the "learned layer weighting" would be pulled
    # back to a plain average by the very regularisation that makes the probe
    # generalise. Biases are excluded for the usual reason.
    decay, no_decay = [], []
    for n_, p_ in model.named_parameters():
        (no_decay if ("layer_logits" in n_ or n_.endswith("bias")) else decay).append(p_)
    opt = torch.optim.AdamW(
        [
            {"params": decay, "weight_decay": wd},
            {"params": no_decay, "weight_decay": 0.0},
        ],
        lr=lr,
    )

    best, best_state, patience = float("inf"), None, 0
    for ep in range(epochs):
        model.train()
        opt.zero_grad()
        out, aux = model(xs_tr)
        loss = plackett_luce_loss(out, y_tr)
        if aux is not None:
            # Teacher B: Essentia's 56 mood/theme probabilities as a second,
            # weaker target. It is another model's opinion, never ground truth.
            loss = loss + aux_weight * nn.functional.binary_cross_entropy_with_logits(aux, a_tr)
        loss.backward()
        opt.step()

        if ep % 5 == 0 or ep == epochs - 1:
            model.eval()
            with torch.no_grad():
                v = float(plackett_luce_loss(model(xs_va)[0], y_va))
            if v < best - 1e-4:
                best, patience = v, 0
                best_state = {k: t.detach().clone() for k, t in model.state_dict().items()}
            else:
                patience += 1
                if patience >= 12:
                    break

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        te_scores = model(xs_te)[0]
        tr_scores = model(xs_tr)[0]
    return metrics(te_scores, y_te), model.layer_weights(), metrics(tr_scores, y_tr)


def baselines(ds: Dataset, folds: np.ndarray) -> dict[str, dict[str, float]]:
    """Reference lines. A number without these is unreadable."""
    out = {}
    # Global prior: score every category by how often Claude ranks it first.
    accs = []
    for f in range(folds.max() + 1):
        tr, te = folds != f, folds == f
        counts = np.bincount(ds.ranking[tr][:, 0], minlength=N_CAT)
        scores = torch.tensor(np.tile(np.log(counts + 1.0), (te.sum(), 1)), dtype=torch.float32)
        accs.append(metrics(scores, torch.tensor(ds.ranking[te])))
    out["prior (most common category)"] = {
        k: float(np.mean([a[k] for a in accs])) for k in accs[0]
    }
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="auto")
    ap.add_argument("--epochs", type=int, default=600)
    ap.add_argument("--hidden", type=int, default=0)
    ap.add_argument("--aux", type=float, default=0.0)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--only", default="", help="comma-separated config names")
    ap.add_argument("--out", default="cv-results.json")
    args = ap.parse_args()

    device = args.device
    if device == "auto":
        device = "mps" if torch.backends.mps.is_available() else "cpu"

    ds = load()
    folds = grouped_folds(ds.groups, k=args.folds, seed=SEED)
    ceiling = teacher_self_agreement(ds)

    print(f"device {device} | {len(ds.isrc)} recordings | {len(set(ds.groups))} artists")
    print("fold sizes:", [int((folds == f).sum()) for f in range(args.folds)])
    print(
        f"\nTEACHER CEILING (same recording, classified twice, n={ceiling['pairs']}): "
        f"top-1 identical {ceiling['top1_identical']*100:.1f}%, "
        f"top-1 in other's top-3 {ceiling['top1_in_other_top3']*100:.1f}%"
    )

    CONFIGS = {
        "clap": ["clap"],
        "TEXT-ONLY (clap text)": ["clap_text"],
        "text+audio": ["clap_text", "mert2"],
        "essentia": ["ess_emb"],
        "mert1-full30s": ["mert1_full"],
        "mert1-win5": ["mert1_win5"],
        "mert2-30s": ["mert2"],
        "mert2+clap": ["mert2", "clap"],
        "all": ["mert2", "clap", "ess_emb"],
    }
    if args.only:
        want = {c.strip() for c in args.only.split(",")}
        CONFIGS = {k: v for k, v in CONFIGS.items() if k in want}

    results: dict[str, dict] = {}
    for name, blocks in CONFIGS.items():
        t0 = time.time()
        per_fold, weights, train_m, chosen_wd = [], [], [], []
        for f in range(args.folds):
            te = np.where(folds == f)[0]
            rest = np.where(folds != f)[0]
            # inner split for early stopping, grouped by artist as well
            inner = grouped_folds(ds.groups[rest], k=6, seed=SEED + f)
            va, tr = rest[inner == 0], rest[inner != 0]
            # Nested selection: weight decay is chosen on the INNER validation
            # split, which is itself grouped by artist. The test fold is touched
            # exactly once, after wd is fixed, so no hyperparameter ever saw it.
            best_wd, best_val, chosen = None, -1.0, None
            for wd in WD_GRID:
                mv, wv, tmv = run_fold(
                    ds, blocks, tr, va, va, device, args.hidden, args.aux,
                    args.epochs, lr=3e-3, wd=wd,
                )
                if mv["top1_agree"] > best_val:
                    best_val, best_wd = mv["top1_agree"], wd
            m, w, tm = run_fold(
                ds, blocks, tr, va, te, device, args.hidden, args.aux,
                args.epochs, lr=3e-3, wd=best_wd,
            )
            chosen_wd.append(best_wd)
            per_fold.append(m)
            train_m.append(tm)
            weights.append(w)
        agg = {
            k: (float(np.mean([p[k] for p in per_fold])), float(np.std([p[k] for p in per_fold])))
            for k in per_fold[0]
        }
        results[name] = {
            "blocks": blocks,
            "mean_std": agg,
            "per_fold_top1": [p["top1_agree"] for p in per_fold],
            "train_top1": float(np.mean([t["top1_agree"] for t in train_m])),
            "layer_weights_fold0": weights[0],
            "weight_decay_per_fold": chosen_wd,
            "seconds": round(time.time() - t0, 1),
        }
        a = agg["top1_agree"]
        b = agg["top1_in_top3"]
        print(
            f"  {name:14s} top1 {a[0]*100:5.1f}% ±{a[1]*100:.1f}  "
            f"top1-in-3 {b[0]*100:5.1f}%  ndcg@5 {agg['ndcg@5'][0]:.3f}  "
            f"({results[name]['seconds']}s, train top1 {results[name]['train_top1']*100:.1f}%, "
          f"wd {chosen_wd})"
        )

    base = baselines(ds, folds)
    for k, v in base.items():
        print(f"  {k:14s} top1 {v['top1_agree']*100:5.1f}%  top1-in-3 {v['top1_in_top3']*100:5.1f}%")

    payload = {
        "config": vars(args),
        "n_recordings": len(ds.isrc),
        "n_artists": len(set(ds.groups)),
        "fold_sizes": [int((folds == f).sum()) for f in range(args.folds)],
        "teacher_ceiling": ceiling,
        "baselines": base,
        "results": results,
    }
    (ART / args.out).write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {ART / args.out}")


if __name__ == "__main__":
    main()
