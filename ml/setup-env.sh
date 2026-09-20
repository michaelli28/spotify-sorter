#!/bin/bash
# S1 "Ears": the Python environment for the frozen encoders.
#
# One venv, not two, so a preview can be decoded ONCE and fed to all four
# encoders in a single process. That matters because audio is never persisted:
# a second pass would mean a second download of all 2,622 previews.
#
# The risk of one venv is that essentia-tensorflow bundles its own TensorFlow
# and PyTorch ships its own libomp, which on macOS is a known crash pairing.
# So the last step here is a coexistence test that actually imports both and
# runs a tensor through each — measured, not assumed.
#
# transformers is pinned to 4.47.1 deliberately:
#   - newer 5.x returns hidden_states=None through MERT's remote-code path
#   - 4.47.1 still has the API MERT's modeling_MERT.py calls
#   - CLAP's get_audio_features returns a TENSOR here; in 5.x it returns an
#     object, which silently breaks downstream .mean()/@ arithmetic
set -euo pipefail
ML="$(cd "$(dirname "$0")" && pwd)"
VENV="$ML/venv"

echo "=== creating venv (python3.12) ==="
uv venv --python python3.12 "$VENV"
PY="$VENV/bin/python"
"$PY" -V

echo "=== installing ==="
# numpy pinned <2: essentia-tensorflow 2.1b6.dev1389 predates the numpy 2 ABI.
uv pip install --python "$PY" \
  "numpy<2" \
  "torch==2.8.0" \
  "torchaudio==2.8.0" \
  "transformers==4.47.1" \
  "essentia-tensorflow==2.1b6.dev1389" \
  "soundfile" \
  "requests" \
  "tqdm"

echo
echo "=== COEXISTENCE TEST: torch and essentia-tensorflow in one process ==="
"$PY" "$ML/check-env.py"
