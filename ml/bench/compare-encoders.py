"""MERT-v1 vs MERT-v2 on MTG-Jamendo, under one identical pipeline.

This exists to stop one specific mistake. Each encoder was probed at every
layer, so the tempting comparison is "best test AUROC for v1 vs best test AUROC
for v2" — which selects on the test set twice and inflates both. Layer choice is
a hyperparameter; it is selected on VALIDATION here and only then read on test.

Why this comparison and not each against its published number: MERT-v2-30s has
one unambiguous card entry, MERT-v1-95M has two conflicting published figures
measured under different framework versions, and its layer indexing is ambiguous
(13 hidden states for 12 transformer layers, so index 0 is the embedding
output). Running both through the same chunking, pooling, probe and split makes
the encoder the only difference, which is the question actually being asked.

    venv/bin/python bench/compare-encoders.py
"""

from __future__ import annotations

import json
from pathlib import Path

ART = Path(__file__).resolve().parent.parent / "artifacts" / "jamendo"


def load(encoder: str) -> dict:
    p = ART / f"probe-{encoder}-alllayers.json"
    if not p.exists():
        raise SystemExit(
            f"{p} missing — run:\n"
            f"  venv/bin/python bench/probe-jamendo.py --encoder {encoder} "
            f"--layer all --device cpu --out {p}"
        )
    return json.loads(p.read_text())


def summarise(d: dict) -> dict:
    res = {int(k): v for k, v in d["results"].items()}
    # Selected on validation. Never on test.
    best = max(res, key=lambda k: res[k]["val_auroc"])
    return {
        "encoder": d["encoder"],
        "layers": len(res),
        "partial": d.get("partial_sweep", False),
        "coverage": d["coverage"],
        "best_layer": best,
        "val_auroc": res[best]["val_auroc"],
        "test_auroc": res[best]["test_auroc"],
        "test_ap": res[best]["test_ap"],
        "card": d.get("published"),
        "card_layer_test": (
            res[d["published"]["layer_index"]]["test_auroc"]
            if d.get("published") and d["published"]["layer_index"] in res
            else None
        ),
        "all": res,
    }


def main() -> None:
    a, b = summarise(load("mert1")), summarise(load("mert2"))
    for s in (a, b):
        if s["partial"]:
            raise SystemExit(
                f"{s['encoder']} was probed on a PARTIAL sweep — the comparison would be "
                "between different subsets of tracks. Finish the sweep first."
            )
        cov = s["coverage"]["test"]
        print(f"{s['encoder']}: {s['layers']} layers, "
              f"test split {cov['tracks']}/{cov['of']} tracks, {cov['clips']:,} clips")

    if a["coverage"] != b["coverage"]:
        print("\n  ! the two runs cover different tracks — not directly comparable")

    print(f"\n{'encoder':>8}  {'layer*':>6}  {'val AUROC':>9}  {'test AUROC':>10}  {'test AP':>8}")
    for s in (a, b):
        print(f"{s['encoder']:>8}  {s['best_layer']:>6}  {s['val_auroc']:>9.4f}  "
              f"{s['test_auroc']:>10.4f}  {s['test_ap']:>8.4f}")
    print("  * layer chosen on VALIDATION, then read once on test")

    d_auroc = b["test_auroc"] - a["test_auroc"]
    d_ap = b["test_ap"] - a["test_ap"]
    print(f"\nMERT-v2 minus MERT-v1: AUROC {d_auroc:+.4f}  AP {d_ap:+.4f}")

    if b["card"] and b["card_layer_test"] is not None:
        print(f"\nFor reference, mert2 at its published layer "
              f"{b['card']['layer_index']}: test AUROC {b['card_layer_test']:.4f} "
              f"against a published {b['card']['auroc']:.4f}.")
    if not a["card"]:
        print("mert1 has no published entry here on purpose — see CARDS in "
              "probe-jamendo.py for why.")

    # The layer curve's shape matters as much as its peak: a flat curve means
    # the encoder carries the signal broadly, and makes any single-layer
    # comparison less load-bearing than it looks.
    print(f"\n{'encoder':>8}  {'val spread':>10}  {'top-3 layers by val':>22}")
    for s in (a, b):
        vals = [r["val_auroc"] for r in s["all"].values()]
        top3 = sorted(s["all"], key=lambda k: -s["all"][k]["val_auroc"])[:3]
        print(f"{s['encoder']:>8}  {max(vals)-min(vals):>10.4f}  {str(top3):>22}")

    out = ART / "encoder-comparison.json"
    out.write_text(json.dumps(
        {k: {kk: vv for kk, vv in s.items() if kk != "all"} for k, s in
         (("mert1", a), ("mert2", b))}
        | {"delta_auroc": d_auroc, "delta_ap": d_ap,
           "selection": "layer chosen on validation, read once on test"},
        indent=2))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
