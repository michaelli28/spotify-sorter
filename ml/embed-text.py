"""Text-only features: CLAP's TEXT tower over "title — artist".

This is the ablation that answers "isn't it just the title?", and it has to be
strong or the comparison is worthless. Claude's entire input for 64% of the
library was this exact string, so a text probe is not a strawman — it is the
closest thing to a reproduction of the teacher's own evidence.

CLAP is used rather than a general text encoder on purpose: it shares one
embedding space between text and audio, so text-only and audio-only differ in
the MODALITY and not in the architecture, the probe, or the loss.

MEASURED WARNING. These embeddings are extremely anisotropic: 99.94% of their
energy lies in a single shared direction, and raw cosines between different
titles sit at 0.999. They are not degenerate — after centering, the mean cosine
is -0.001 and a nearest neighbour shares the teacher's top-1 category 42.7% of
the time against 6.4% chance. But any consumer MUST centre or standardise them,
which ml/train.py does. Fed raw to a probe they look nearly constant.
"""

from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
import torch

ART = Path(__file__).resolve().parent / "artifacts"


def main() -> None:
    from transformers import ClapModel, ClapProcessor

    from dataset import load

    ds = load()
    texts = [f"{t} — {a}" for t, a in zip(ds.titles, ds.artist_names)]
    print(f"{len(texts)} strings, e.g. {texts[0]!r}")

    model = ClapModel.from_pretrained("laion/larger_clap_music").eval()
    proc = ClapProcessor.from_pretrained("laion/larger_clap_music")

    out = []
    with torch.no_grad():
        for i in range(0, len(texts), 64):
            inp = proc(text=texts[i : i + 64], return_tensors="pt", padding=True)
            f = model.get_text_features(**inp)
            v = f if isinstance(f, torch.Tensor) else f.pooler_output
            out.append(v.float().numpy())
            if i % 640 == 0:
                print(f"  {i}/{len(texts)}")
    X = np.concatenate(out).astype(np.float32)

    path = ART / "text-clap.npz"
    np.savez_compressed(path, isrc=ds.isrc, clap_text=X)
    import hashlib

    print(f"\nwrote {path}  shape {X.shape}")
    print(f"sha256: {hashlib.sha256(path.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
