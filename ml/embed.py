"""S1 "Ears", Phase 1 steps 4-6: stream -> embed -> discard.

Each Deezer preview is pulled into MEMORY, decoded by ffmpeg through a pipe,
fed to four frozen encoders, and dropped. No audio is ever written to disk:
nothing here opens a file for writing except the embedding shards, and those
contain only pooled activations.

Everything below that looks fussy is defending against a specific trap that the
encoder diligence found by reading the actual model configs. In order of how
badly each one would have corrupted the run:

  CLAP random crop.  larger_clap_music ships truncation="rand_trunc", so a 30s
  clip is cut to a uniformly RANDOM 10s window drawn from unseeded global numpy
  state. Embeddings would not reproduce across runs. Here the 30s is sliced
  into three fixed windows (0-10, 10-20, 20-30) and averaged, which is both
  reproducible and uses the whole clip instead of a third of it.

  MERT-v2 layer off-by-one.  MERT-v2-30s returns 24 hidden_states, NOT
  num_hidden_layers+1 = 25 as every normal HuggingFace model does. Code that
  assumes index 0 is the embedding layer silently reads the wrong layer and
  raises nothing. Asserted below.

  Essentia sample rate.  The Discogs-EffNet graph has no internal resampler and
  declares 16 kHz. Feeding it 44.1k produces plausible, wrong probabilities for
  every clip with nothing in the logs. Each encoder gets its own resample.

  Essentia output node.  The EffNet default output is 400-d style predictions;
  the 1280-d embeddings the mood head requires live at "PartitionedCall:1".

  MERT-v2 ragged batching.  forward() runs one encode per distinct length in a
  batch, so mixed lengths silently serialise. Every clip is cut/padded to
  exactly 720,000 samples (30s at 24kHz).

MERT-v1 is embedded TWICE on purpose. It was pretrained with a 5-second
context, so a 30s clip is 6x out of distribution, while MERT-v2-30s was trained
at 30s. Running v1 both ways (full 30s, and six 5s windows averaged) costs
~40KB per clip and removes the objection that the S12 comparison handed the new
model its native context and the old model an unnatural one.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
import time
from pathlib import Path

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
import requests

ML = Path(__file__).resolve().parent
ART = ML / "artifacts"
SHARDS = ART / "shards"
MODELS = ML / "models"

SR_CLAP = 48_000
SR_MERT = 24_000
SR_ESS = 16_000
CLIP_S = 30
MERT_SAMPLES = SR_MERT * CLIP_S  # 720,000 — exact, see ragged-batching note
CLAP_WIN = SR_CLAP * 10  # 480,000 — the only length CLAP ever sees
SHARD_SIZE = 100
# The preview CDN rate-limits independently of the metadata API. 4 workers drew
# 429s partway through a 2,600-clip run; 2 plus the retry above stays under it.
PREFETCH_WORKERS = 2

ESSENTIA_FILES = {
    "effnet": (
        "discogs-effnet-bs64-1.pb",
        "https://essentia.upf.edu/models/music-style-classification/discogs-effnet/discogs-effnet-bs64-1.pb",
    ),
    "moodtheme": (
        "mtg_jamendo_moodtheme-discogs-effnet-1.pb",
        "https://essentia.upf.edu/models/classification-heads/mtg_jamendo_moodtheme/mtg_jamendo_moodtheme-discogs-effnet-1.pb",
    ),
    "moodtheme_meta": (
        "mtg_jamendo_moodtheme-discogs-effnet-1.json",
        "https://essentia.upf.edu/models/classification-heads/mtg_jamendo_moodtheme/mtg_jamendo_moodtheme-discogs-effnet-1.json",
    ),
}


def log(msg: str) -> None:
    print(msg, flush=True)


def _safe(fn, arg):
    """Carry a worker's exception back to the main loop instead of killing the
    pool: one dead preview must not cost the other 99 in the shard."""
    try:
        return fn(arg)
    except Exception as e:
        return e


# --------------------------------------------------------------------------
# audio: network -> memory -> float32 mono. Never touches disk.
# --------------------------------------------------------------------------
def fresh_preview_url(isrc: str, session: requests.Session, timeout: int = 30) -> str:
    """Deezer preview URLs are SIGNED and short-lived.

    They carry `hdnea=exp=<unix ts>` and start returning 403 well before a
    2,600-clip run finishes, so the URLs captured during the coverage sweep
    cannot be replayed here. deezer.json records whether a preview EXISTS,
    which is what Gate 1 measures; the URL has to be re-minted per clip.
    """
    # Same normalisation fetch-deezer.ts uses: Deezer folds case but not
    # hyphens, and this library has 3 hyphenated codes. Without it they 404
    # here even though deezer.json says they have previews.
    q = isrc.replace("-", "").upper()
    for attempt in range(5):
        r = session.get(f"https://api.deezer.com/track/isrc:{q}", timeout=timeout)
        r.raise_for_status()
        j = r.json()
        err = j.get("error")
        # Quota exhaustion arrives as HTTP 200 with code 4, so raise_for_status
        # sees nothing. Treating it as "no preview" would silently convert a
        # throttle into a permanent, unretried hole in the training set.
        if err and err.get("code") == 4:
            time.sleep(2**attempt)
            continue
        if err:
            raise ValueError(f"deezer error {err}")
        url = j.get("preview")
        if not url:
            raise ValueError("no preview on refetch")
        return url
    raise ValueError("deezer quota exhausted after retries")


def fetch_preview(url: str, session: requests.Session, timeout: int = 30) -> bytes:
    """Retry on 429/5xx.

    The preview CDN rate-limits separately from the metadata API, and it does
    return a real 429 (unlike the API, which hides quota errors in a 200 body).
    A 4-worker prefetch was enough to trigger it partway through a 2,600-clip
    run. Without this retry each 429 is a permanently missing clip rather than
    a two-second wait.
    """
    last = ""
    for attempt in range(5):
        r = session.get(url, timeout=timeout)
        if r.status_code == 429 or r.status_code >= 500:
            last = f"HTTP {r.status_code}"
            wait = float(r.headers.get("retry-after") or 2**attempt)
            time.sleep(min(wait, 30))
            continue
        r.raise_for_status()
        return r.content
    raise RuntimeError(f"preview fetch failed after retries ({last})")


def decode(mp3: bytes, sr: int) -> np.ndarray:
    """ffmpeg via stdin/stdout pipes: the bytes never become a file."""
    proc = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", "pipe:0",
            "-f", "f32le", "-acodec", "pcm_f32le",
            "-ac", "1", "-ar", str(sr),
            "pipe:1",
        ],
        input=mp3,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def decode_all(mp3: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """One ffmpeg spawn, then resample in-process.

    The three encoders want three different rates (48k CLAP, 24k MERT, 16k
    Essentia) and spawning ffmpeg three times per clip costs more than the
    resampling does. Decoding at the highest rate and downsampling is also the
    only ordering that cannot introduce content the original lacked.
    """
    import torch
    import torchaudio.functional as AF

    wav48 = decode(mp3, SR_CLAP)
    t = torch.from_numpy(wav48)
    wav24 = AF.resample(t, SR_CLAP, SR_MERT).numpy()
    wav16 = AF.resample(t, SR_CLAP, SR_ESS).numpy()
    return wav48, wav24, wav16


def fit(x: np.ndarray, n: int) -> np.ndarray:
    """Exactly n samples: zero-pad if short, head-crop if long. Deterministic."""
    if len(x) == n:
        return x
    if len(x) > n:
        return x[:n]
    return np.pad(x, (0, n - len(x)))


# --------------------------------------------------------------------------
# encoders
# --------------------------------------------------------------------------
class Encoders:
    def __init__(self, device: str) -> None:
        import torch
        from transformers import AutoConfig, AutoModel, Wav2Vec2FeatureExtractor
        from transformers import ClapModel, ClapProcessor

        self.torch = torch
        self.device = device

        log("loading MERT-v1-95M …")
        cfg1 = AutoConfig.from_pretrained("m-a-p/MERT-v1-95M", trust_remote_code=True)
        # Newer transformers expect this attribute on Hubert-derived configs and
        # MERT's checkpoint predates it; harmless when already correct.
        if not hasattr(cfg1, "conv_pos_batch_norm"):
            cfg1.conv_pos_batch_norm = False
        self.mert1 = AutoModel.from_pretrained(
            "m-a-p/MERT-v1-95M", config=cfg1, trust_remote_code=True
        ).to(device).eval()
        self.fe1 = Wav2Vec2FeatureExtractor.from_pretrained(
            "m-a-p/MERT-v1-95M", trust_remote_code=True
        )
        assert self.mert1.config.num_hidden_layers == 12, self.mert1.config.num_hidden_layers

        log("loading MERT-v2-30s (632M) …")
        self.mert2_model = AutoModel.from_pretrained(
            "m-a-p/MERT-v2-30s",
            trust_remote_code=True,
            attn_implementation="sdpa",  # eager RAISES on this model, no fallback
        ).to(device).eval()

        log("loading CLAP larger_clap_music …")
        self.clap = ClapModel.from_pretrained("laion/larger_clap_music").to(device).eval()
        self.clap_proc = ClapProcessor.from_pretrained("laion/larger_clap_music")
        # Pre-slicing to exactly nb_max_samples is what makes rand_trunc
        # unreachable. If the checkpoint ever declares a different window, the
        # random crop silently re-arms and embeddings stop reproducing — so
        # assert the equality the defence depends on rather than trusting it.
        nb_max = getattr(self.clap_proc.feature_extractor, "nb_max_samples", None)
        if nb_max is not None and nb_max != CLAP_WIN:
            raise SystemExit(
                f"CLAP window mismatch: CLAP_WIN={CLAP_WIN} but this checkpoint "
                f"wants nb_max_samples={nb_max}; rand_trunc would re-arm."
            )

        log("loading Essentia Discogs-EffNet + MTG mood/theme head …")
        import essentia.standard as es

        self.es = es
        self.effnet = es.TensorflowPredictEffnetDiscogs(
            graphFilename=str(MODELS / ESSENTIA_FILES["effnet"][0]),
            output="PartitionedCall:1",  # 1280-d embeddings, NOT the 400-d default
        )
        self.mood = es.TensorflowPredict2D(
            graphFilename=str(MODELS / ESSENTIA_FILES["moodtheme"][0])
        )
        # 512-d pre-activation of the head's hidden layer (model/dense/BiasAdd),
        # not the logits' input — a denser auxiliary target than 56 sigmoids.
        self.mood_penult = es.TensorflowPredict2D(
            graphFilename=str(MODELS / ESSENTIA_FILES["moodtheme"][0]),
            output="model/dense/BiasAdd",
        )

    # -- MERT ---------------------------------------------------------------
    def _mert1_stack(self, wav24: np.ndarray) -> np.ndarray:
        """[13, 768] — 12 transformer layers + 1 feature-projection output."""
        t = self.torch
        inp = self.fe1(wav24, sampling_rate=SR_MERT, return_tensors="pt")
        with t.no_grad():
            out = self.mert1(
                inp.input_values.to(self.device), output_hidden_states=True
            )
        hs = out.hidden_states
        assert len(hs) == 13, f"MERT-v1 gave {len(hs)} hidden_states, expected 13"
        return t.stack([h.squeeze(0).mean(0) for h in hs]).float().cpu().numpy()

    def mert1_full(self, wav24: np.ndarray) -> np.ndarray:
        return self._mert1_stack(fit(wav24, MERT_SAMPLES))

    def mert1_win5(self, wav24: np.ndarray) -> np.ndarray:
        """Six 5-second windows — MERT-v1's actual pretraining context."""
        w = SR_MERT * 5
        x = fit(wav24, MERT_SAMPLES)
        return np.mean([self._mert1_stack(x[i * w : (i + 1) * w]) for i in range(6)], axis=0)

    def mert2(self, wav24: np.ndarray) -> np.ndarray:
        """[24, 1024]. NOTE: 24 entries, not 25 — this model omits the
        embedding-layer output that every standard HF model prepends."""
        t = self.torch
        x = fit(wav24, MERT_SAMPLES)
        with t.no_grad():
            out = self.mert2_model(
                t.from_numpy(x).unsqueeze(0).to(self.device), output_hidden_states=True
            )
        hs = out.hidden_states
        assert len(hs) == 24, f"MERT-v2 gave {len(hs)} hidden_states, expected 24"
        return t.stack([h.squeeze(0).mean(0) for h in hs]).float().cpu().numpy()

    # -- CLAP ---------------------------------------------------------------
    def clap_embed(self, wav48: np.ndarray) -> np.ndarray:
        """512-d, averaged over three FIXED 10s windows.

        The default rand_trunc would take one unseeded random 10s window, making
        the embedding irreproducible and throwing away two thirds of the clip."""
        t = self.torch
        x = fit(wav48, CLAP_WIN * 3)
        wins = [x[i * CLAP_WIN : (i + 1) * CLAP_WIN] for i in range(3)]
        inp = self.clap_proc(
            audios=wins, sampling_rate=SR_CLAP, return_tensors="pt"
        )
        with t.no_grad():
            feats = self.clap.get_audio_features(
                **{k: v.to(self.device) for k, v in inp.items()}
            )
        v = feats if isinstance(feats, t.Tensor) else feats.pooler_output
        v = v.float().cpu().numpy()
        m = v.mean(0)
        n = np.linalg.norm(m)
        return (m / n if n > 0 else m).astype(np.float32)

    # -- Essentia -----------------------------------------------------------
    def essentia_embed(self, wav16: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        emb = self.effnet(wav16)  # [patches, 1280]
        if emb.size == 0:
            raise ValueError("Essentia returned no patches (clip under ~2.06s)")
        mood = self.mood(emb)  # [patches, 56] sigmoids
        pen = self.mood_penult(emb)  # [patches, 512] logits-layer input
        return (
            emb.mean(0).astype(np.float32),
            mood.mean(0).astype(np.float32),
            pen.mean(0).astype(np.float32),
        )


def download_essentia_models() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    for name, url in ESSENTIA_FILES.values():
        dest = MODELS / name
        if dest.exists():
            continue
        log(f"  downloading {name} …")
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        # Atomic: dest.exists() is the only "already downloaded" signal, so a
        # partial write from an interrupted run would be trusted for ever and
        # TensorFlow would fail on a truncated graph with a confusing error.
        tmp = dest.with_suffix(dest.suffix + ".part")
        tmp.write_bytes(r.content)
        tmp.replace(dest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="smoke-test on N clips")
    ap.add_argument("--device", default="auto")
    ap.add_argument(
        "--only",
        default="",
        help=(
            "comma-separated ISRCs, written to a high-numbered shard. For adding "
            "recordings after a full sweep: the main shards are indexed by position "
            "in the sorted ISRC list, so inserting into that list would silently "
            "misalign every shard after the insertion point."
        ),
    )
    ap.add_argument("--shard-base", type=int, default=0)
    args = ap.parse_args()

    deezer = json.loads((ART / "deezer.json").read_text())
    if args.only:
        isrcs = [i.strip() for i in args.only.split(",") if i.strip()]
    else:
        isrcs = sorted(
            i for i, d in deezer.items() if d["status"] == "ok" and d["preview"]
        )
    if args.limit:
        isrcs = isrcs[: args.limit]
    log(f"{len(isrcs)} previews to embed")

    SHARDS.mkdir(parents=True, exist_ok=True)
    download_essentia_models()

    import torch

    device = args.device
    if device == "auto":
        device = "mps" if torch.backends.mps.is_available() else "cpu"
    log(f"device: {device}")

    enc = Encoders(device)
    session = requests.Session()
    shard_ids = range(0, len(isrcs), SHARD_SIZE)
    t0 = time.time()
    n_done = 0

    for start in shard_ids:
        shard_path = SHARDS / f"shard-{args.shard_base + start:05d}.npz"
        chunk = isrcs[start : start + SHARD_SIZE]
        if shard_path.exists():
            # A filename only encodes a POSITION, so "this file exists" is not
            # evidence that it holds the clips we are about to skip. A smoke run
            # with --limit, or a deezer.json that changed between runs, would
            # otherwise let a short shard silently stand in for 100 real clips
            # and nothing downstream would ever report those clips as missing.
            prior = np.load(shard_path, allow_pickle=True)
            stored = prior["chunk"].tolist() if "chunk" in prior.files else None
            if stored != chunk:
                raise SystemExit(
                    f"{shard_path.name} was built from a different clip list "
                    f"({len(stored) if stored is not None else 'unrecorded'} entries, "
                    f"expected {len(chunk)}). Delete it and re-run rather than "
                    f"letting it stand in for clips it does not contain."
                )
            continue
        rows: dict[str, list] = {
            k: [] for k in
            ("isrc", "mert1_full", "mert1_win5", "mert2", "clap", "ess_emb", "ess_mood", "ess_penult")
        }
        failures = []

        # Fetch the shard's audio concurrently while nothing is encoding yet.
        # ~100 clips x ~0.5MB sits in RAM briefly and is dropped per clip below;
        # still nothing touches disk. Serial fetching left the GPU idle for
        # roughly a third of every clip.
        def grab(i: str) -> bytes:
            return fetch_preview(fresh_preview_url(i, session), session)

        with ThreadPoolExecutor(max_workers=PREFETCH_WORKERS) as pool:
            audio = dict(zip(chunk, pool.map(lambda i: _safe(grab, i), chunk)))

        for isrc in chunk:
            try:
                got = audio.pop(isrc)
                if isinstance(got, Exception):
                    raise got
                wav48, wav24, wav16 = decode_all(got)
                del got  # audio leaves memory as soon as it is numbers

                # Compute everything first, commit all eight columns together.
                # Appending the ISRC before the encoders ran would, on any
                # encoder exception, leave the columns at different lengths —
                # binding every later row to the WRONG ISRC, counting the clip
                # as both ok and failed, and wedging the merge hours later.
                e_emb, e_mood, e_pen = enc.essentia_embed(wav16)
                m1_full = enc.mert1_full(wav24)
                m1_win5 = enc.mert1_win5(wav24)
                m2 = enc.mert2(wav24)
                clap = enc.clap_embed(wav48)

                rows["mert1_full"].append(m1_full)
                rows["mert1_win5"].append(m1_win5)
                rows["mert2"].append(m2)
                rows["clap"].append(clap)
                rows["ess_emb"].append(e_emb)
                rows["ess_mood"].append(e_mood)
                rows["ess_penult"].append(e_pen)
                rows["isrc"].append(isrc)
                n_done += 1
            except Exception as e:
                # Strip the query string: a 403 from the CDN puts the whole
                # signed URL (hdnea token and hmac) into the message, and that
                # does not belong in an artifact just because a clip failed.
                msg = re.sub(r"\?hdnea=[^\s]*", "?<signed>", f"{type(e).__name__}: {e}")
                failures.append({"isrc": isrc, "error": msg})

        # Atomic for the same reason as the model files: shard_path.exists()
        # is the resume signal, so a half-written shard must never be left in
        # place under its final name.
        tmp_shard = shard_path.with_suffix(".npz.part")
        np.savez_compressed(
            tmp_shard,
            isrc=np.array(rows["isrc"]),
            chunk=np.array(chunk),  # what this shard was ASKED to cover
            **{k: np.asarray(v, dtype=np.float32) for k, v in rows.items() if k != "isrc"},
            failures=np.array(json.dumps(failures)),
        )
        # np.savez_compressed appends .npz if the name lacks it; .npz.part does
        # not end in .npz, so it writes tmp_shard + ".npz". Rename that.
        Path(str(tmp_shard) + ".npz").replace(shard_path)
        rate = n_done / max(time.time() - t0, 1e-9)
        log(
            f"  shard {start:05d}: {len(rows['isrc'])} ok, {len(failures)} failed "
            f"| {rate:.2f} clips/s | eta {(len(isrcs) - n_done) / max(rate, 1e-9) / 60:.0f} min"
        )

    log(f"\ndone: {n_done} embedded in {(time.time() - t0) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
