"""Does the one-venv plan actually hold?

PyTorch and essentia-tensorflow each bring their own OpenMP runtime, and on
macOS loading both in one process is a documented crash. If this script prints
COEXISTENCE OK, ml/embed.py can decode each preview once and feed all four
encoders. If it crashes, the pipeline has to split into two processes and pay
for a second download of every preview.

Import order is deliberate: essentia first, because the failure mode is the
second OpenMP to load, and essentia's is the one we cannot swap out.
"""

import os
import sys

# Only relevant if both runtimes do load; harmless otherwise. Set before import.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

print(f"python  : {sys.version.split()[0]}")

import numpy as np

print(f"numpy   : {np.__version__}")

import essentia
import essentia.standard as es

print(f"essentia: {essentia.__version__}")

import torch

print(f"torch   : {torch.__version__}")
print(f"mps available : {torch.backends.mps.is_available()}")
print(f"mps built     : {torch.backends.mps.is_built()}")

import transformers

print(f"transformers  : {transformers.__version__}")

# Actually run arithmetic through both, because importing is not using.
sig = np.random.default_rng(0).standard_normal(16000 * 3).astype(np.float32)
rms = es.RMS()(sig)
print(f"essentia RMS on 3s of noise : {rms:.6f}")

dev = "mps" if torch.backends.mps.is_available() else "cpu"
x = torch.randn(64, 256, device=dev)
y = (x @ x.T).mean().item()
print(f"torch matmul on {dev}          : {y:.6f}")

# And in the other order, which is what embed.py will actually do per clip.
rms2 = es.RMS()(sig * 0.5)
print(f"essentia again after torch  : {rms2:.6f}")

print("\nCOEXISTENCE OK")
