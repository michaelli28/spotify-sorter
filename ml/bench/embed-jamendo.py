"""S12 half A, step 2: embed MTG-Jamendo audio, one tar part at a time.

Disk discipline: the full audio-low set is 49.2 GB across 100 tars. Each part is
downloaded, verified against the official sha256, streamed through the encoder,
and DELETED before the next one starts, so peak usage is about one part (~500 MB)
plus the embeddings. Nothing here keeps audio.

Protocol fidelity, from reading MARBLE's own config (not from memory):
  - Every track is cut into NON-OVERLAPPING 30 s chunks and ALL of them are
    used, for training and at inference. Not one excerpt, not the full track.
    That is ~6.8 chunks per track and 122,856 chunks over split-0.
  - MARBLE picks a SINGLE layer (layer 6 for MERT-v1-95M) and mean-pools over
    time. All layers are stored here anyway — it costs 6 GB in fp16 and lets the
    probe step report both the card's layer and the best layer, which is the
    more interesting comparison.
  - A trailing remainder shorter than 30 s is dropped, except that a track
    shorter than 30 s yields one zero-padded chunk rather than none.

The part index equals the folder name: part-07.tar contains only `07/`. That is
verified, not assumed, so a mis-numbered part cannot quietly embed the wrong set.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
import tarfile
import time
from pathlib import Path

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
import requests
import torch

BENCH = Path(__file__).resolve().parent
ART = BENCH.parent / "artifacts" / "jamendo"
EMB = ART / "emb"
TMP = ART / "tmp"
CDN = "https://cdn.freesound.org/mtg-jamendo/autotagging_moodtheme/audio-low"
SR = 24_000
CHUNK = SR * 30
# Chunks per forward pass. 8 caps MERT-v2's returned hidden states at
# 24 x 8 x 750 x 1024 x 4 B = 590 MB instead of 9.7 GB on the longest track.
MICRO_BATCH = 8

ENCODERS = {
    "mert2": ("m-a-p/MERT-v2-30s", {"attn_implementation": "sdpa"}, 24),
    "mert1": ("m-a-p/MERT-v1-95M", {}, 13),
}


def log(m: str) -> None:
    print(m, flush=True)


def tar_sha256() -> dict[str, str]:
    out = {}
    for line in (ART / "sha256_tars.txt").read_text().splitlines():
        if line.strip():
            sha, name = line.split()
            out[name] = sha
    return out


def download_part(part: str, expect: str) -> Path:
    TMP.mkdir(parents=True, exist_ok=True)
    name = f"autotagging_moodtheme_audio-low-{part}.tar"
    dest = TMP / name
    if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == expect:
        return dest
    url = f"{CDN}/{name}"
    tmp = dest.with_suffix(".part")
    # A 10-hour run died at part 97/100 on a single ChunkedEncodingError
    # ("Connection broken: IncompleteRead"). One flaky 500 MB transfer should
    # cost one retry, not the rest of the sweep. The sha check below is what
    # makes a retry safe: a truncated body can never be mistaken for a good one.
    last = None
    for attempt in range(1, 5):
        log(f"  downloading {name} …" + (f" (attempt {attempt})" if attempt > 1 else ""))
        h = hashlib.sha256()
        try:
            with requests.get(url, stream=True, timeout=300) as r:
                r.raise_for_status()
                with tmp.open("wb") as fh:
                    for block in r.iter_content(1 << 20):
                        fh.write(block)
                        h.update(block)
        except requests.RequestException as e:
            last = e
            log(f"    transfer failed: {type(e).__name__}: {e}")
            time.sleep(5 * attempt)
            continue
        got = h.hexdigest()
        if got == expect:
            tmp.replace(dest)
            return dest
        last = f"sha256 mismatch: {got[:12]} != {expect[:12]}"
        log(f"    {last}")
        time.sleep(5 * attempt)
    tmp.unlink(missing_ok=True)
    raise SystemExit(f"{name} failed after 4 attempts: {last}")


def decode(data: bytes) -> np.ndarray:
    p = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
        input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
    )
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def chunks_of(wav: np.ndarray) -> list[np.ndarray]:
    if len(wav) < CHUNK:
        return [np.pad(wav, (0, CHUNK - len(wav)))]
    n = len(wav) // CHUNK
    return [wav[i * CHUNK : (i + 1) * CHUNK] for i in range(n)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--encoder",
        required=True,
        help="one or more of mert2,mert1 — several run in ONE pass over each part, "
        "so the 49 GB is downloaded once instead of once per encoder",
    )
    ap.add_argument("--parts", default="00", help="e.g. 00 or 00-09 or 00,05,17")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--keep-tar", action="store_true")
    args = ap.parse_args()

    if "-" in args.parts and "," not in args.parts:
        a, b = args.parts.split("-")
        parts = [f"{i:02d}" for i in range(int(a), int(b) + 1)]
    else:
        parts = [p.strip() for p in args.parts.split(",") if p.strip()]

    dev = args.device
    if dev == "auto":
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
    wanted = [e.strip() for e in args.encoder.split(",") if e.strip()]
    for e in wanted:
        if e not in ENCODERS:
            raise SystemExit(f"unknown encoder {e!r}; choose from {sorted(ENCODERS)}")

    from transformers import AutoModel

    models = {}
    for e in wanted:
        repo, kw, n_layers = ENCODERS[e]
        log(f"loading {repo} on {dev} …")
        models[e] = (
            AutoModel.from_pretrained(repo, trust_remote_code=True, **kw).to(dev).eval(),
            n_layers,
        )

    shas = tar_sha256()
    EMB.mkdir(parents=True, exist_ok=True)
    grand_t0 = time.time()
    grand_n = 0

    for part in parts:
        todo = [e for e in wanted if not (EMB / f"{e}-{part}.npz").exists()]
        if not todo:
            log(f"part {part}: already embedded for {wanted}, skipping")
            continue
        tar_path = download_part(part, shas[f"autotagging_moodtheme_audio-low-{part}.tar"])

        ids: list[str] = []
        counts: list[int] = []
        vecs: dict[str, list[np.ndarray]] = {e: [] for e in todo}
        t0 = time.time()
        with tarfile.open(tar_path) as tf:
            members = [m for m in tf.getmembers() if m.name.endswith(".low.mp3")]
            folders = {m.name.split("/")[0] for m in members}
            if folders != {part}:
                raise SystemExit(f"part {part} holds folders {folders}, expected {{{part}}}")
            for i, m in enumerate(members):
                fh = tf.extractfile(m)
                if fh is None:
                    continue
                try:
                    wav = decode(fh.read())
                except subprocess.CalledProcessError:
                    log(f"    decode failed: {m.name}")
                    continue
                cs = chunks_of(wav)
                del wav
                # MICRO-BATCH, and it is not optional. Feeding a whole track at
                # once looks natural and is a memory bomb: the longest track
                # here is 3,931 s = 131 chunks, and MERT-v2 with
                # output_hidden_states=True would return
                # 24 x 131 x 750 x 1024 x 4 B = 9.7 GB of hidden states alone,
                # before intermediate activations, with a second model also
                # resident. Median is 6 chunks and p99 is 22, so this only bites
                # on the tail — which is exactly how it escapes a smoke test.
                for e in todo:
                    mdl, n_layers = models[e]
                    outs = []
                    for s in range(0, len(cs), MICRO_BATCH):
                        batch = torch.from_numpy(np.stack(cs[s : s + MICRO_BATCH])).to(dev)
                        with torch.no_grad():
                            hs = mdl(batch, output_hidden_states=True).hidden_states
                        if len(hs) != n_layers:
                            raise SystemExit(
                                f"{e} gave {len(hs)} hidden states, expected {n_layers}"
                            )
                        # [chunks, layers, dim]: pool over time before anything
                        # accumulates, so peak memory is one micro-batch.
                        outs.append(
                            torch.stack([h.mean(1) for h in hs], dim=1).half().cpu().numpy()
                        )
                        del hs, batch
                    vecs[e].append(np.concatenate(outs))
                if dev == "mps":
                    torch.mps.empty_cache()
                ids.append(m.name.split("/")[1].removesuffix(".low.mp3"))
                counts.append(len(cs))
                if i % 50 == 0 and i:
                    r = sum(counts) / (time.time() - t0)
                    log(f"    {i}/{len(members)} tracks, {sum(counts)} chunks, {r:.1f} chunk/s")

        for e in todo:
            out = EMB / f"{e}-{part}.npz"
            tmp = out.with_suffix(".npz.part")
            np.savez_compressed(
                tmp,
                track_id=np.array(ids),
                chunk_counts=np.array(counts),
                emb=np.concatenate(vecs[e]),
            )
            Path(str(tmp) + ".npz").replace(out)
        grand_n += sum(counts)
        dt = time.time() - t0
        log(
            f"part {part}: {len(ids)} tracks, {sum(counts)} chunks in {dt/60:.1f} min "
            f"({sum(counts)/dt:.1f} chunk/s) -> {', '.join(todo)}"
        )
        if not args.keep_tar:
            tar_path.unlink(missing_ok=True)

    if grand_n:
        rate = grand_n / (time.time() - grand_t0)
        log(f"\n{grand_n:,} chunks at {rate:.1f} chunk/s")
        log(f"projection for all 122,856 split-0 chunks: {122856/rate/3600:.1f} h")


if __name__ == "__main__":
    sys.exit(main())
