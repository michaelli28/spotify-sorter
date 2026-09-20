"""S1 "Ears", Phase 1 step 6: shards -> one embedding file, with its sha256.

The file contains pooled activations and nothing else. There is no audio in it,
and that is structural rather than a promise: embed.py holds decoded samples in
local variables only, and the only arrays written anywhere are the fixed-width
per-clip vectors listed in ROWS below. The assertion at the end re-checks the
widths, so a bug that smuggled a waveform in would fail the merge rather than
ship quietly.

Rows are keyed by ISRC (the recording), while the library is keyed by Spotify
track id. 124 ISRCs carry two track ids each — the same recording released as
both a single and an album cut — so the mapping is one row to possibly several
tracks. track_index.json records that explicitly instead of letting a later
join silently duplicate or drop rows.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

ML = Path(__file__).resolve().parent
ART = ML / "artifacts"
SHARDS = ART / "shards"

ROWS = {
    "mert1_full": (13, 768),
    "mert1_win5": (13, 768),
    "mert2": (24, 1024),
    "clap": (512,),
    "ess_emb": (1280,),
    "ess_mood": (56,),
    "ess_penult": (512,),
}


def check(condition: bool, message: str) -> None:
    """Not `assert`: `python -O` strips asserts, and these are the only things
    standing between a mis-indexed layer or a smuggled waveform and the
    training set."""
    if not condition:
        raise SystemExit(f"MERGE REFUSED: {message}")


def main() -> None:
    shards = sorted(SHARDS.glob("shard-*.npz"))
    check(bool(shards), "no shards found — run ml/embed.py first")
    print(f"{len(shards)} shards")

    parts: dict[str, list[np.ndarray]] = {k: [] for k in ROWS}
    isrcs: list[str] = []
    failures: list[dict] = []

    for p in shards:
        d = np.load(p)  # no allow_pickle: every array here is numeric or text
        n = len(d["isrc"])
        if n:
            isrcs.extend(d["isrc"].tolist())
            for k in ROWS:
                parts[k].append(d[k])
        failures.extend(json.loads(str(d["failures"])))

    stacked = {k: np.concatenate(v, axis=0) for k, v in parts.items()}
    n = len(isrcs)
    print(f"{n} embedded recordings, {len(failures)} failures")

    # A waveform sneaking in would show up as a wrong trailing dimension.
    for k, shape in ROWS.items():
        check(stacked[k].shape == (n, *shape), f"{k}: {stacked[k].shape} != {(n, *shape)}")
        check(bool(np.isfinite(stacked[k]).all()), f"{k} contains non-finite values")
    check(len(set(isrcs)) == n, "duplicate ISRC rows")

    # RECONCILIATION. Stacking whatever files happen to be on disk is not the
    # same as covering the input. Without this, a shard deleted by hand, a
    # smoke run, or an interrupted sweep yields a smaller-but-plausible file
    # and every downstream percentage is quietly computed over the wrong set.
    deezer = json.loads((ART / "deezer.json").read_text())
    eligible = {i for i, d in deezer.items() if d["status"] == "ok" and d["preview"]}
    embedded = set(isrcs)
    failed = {f["isrc"] for f in failures}
    missing = eligible - embedded - failed
    unexpected = embedded - eligible
    # A recording can appear in BOTH lists: failed in the main sweep (e.g. a
    # Deezer 429) and then embedded by a later --only recovery pass. Reporting
    # the raw failure count would overstate the loss, so split it.
    recovered = failed & embedded
    unrecovered = failed - embedded
    print(f"eligible (ok + preview): {len(eligible)}")
    print(f"  embedded            : {len(embedded & eligible)}")
    print(f"  failed, recovered   : {len(recovered)}")
    print(f"  failed, still lost  : {len(unrecovered)}")
    print(f"  MISSING             : {len(missing)}")
    if unexpected:
        print(f"  note: {len(unexpected)} embedded ISRCs are not in the eligible set "
              f"(expected only if added deliberately via --only)")
    check(
        not missing,
        f"{len(missing)} eligible recordings are neither embedded nor recorded as "
        f"failures, e.g. {sorted(missing)[:5]}. A shard is missing or was built "
        f"from a different clip list. Do not build a claim on this file.",
    )

    out = ART / "embeddings.npz"
    np.savez_compressed(out, isrc=np.array(isrcs), **stacked)

    # ISRC row -> the Spotify track ids that share that recording.
    isrc_map = json.loads((ART / "isrc.json").read_text())
    row_of = {isrc: i for i, isrc in enumerate(isrcs)}
    track_index: dict[str, int] = {}
    for tid, row in isrc_map.items():
        i = row_of.get(row["isrc"] or "")
        if i is not None:
            track_index[tid] = i
    (ART / "track_index.json").write_text(json.dumps(track_index, indent=2))

    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    mb = out.stat().st_size / 1e6
    print(f"\nwrote {out}  ({mb:.1f} MB)")
    print(f"embeddings.npz sha256: {sha}")
    print(f"tracks mapped to a row: {len(track_index)} / {len(isrc_map)}")
    if unrecovered:
        # ISRCs only — the old failure records predate URL redaction and carry
        # signed CDN links, which do not belong in a report.
        print(f"\nstill lost: {sorted(unrecovered)}")
    (ART / "embeddings.meta.json").write_text(
        json.dumps(
            {
                "sha256": sha,
                "size_bytes": out.stat().st_size,
                "recordings": n,
                "tracks_mapped": len(track_index),
                "failed_then_recovered": len(recovered),
                "failed_still_lost": sorted(unrecovered),
                "arrays": {k: list(v) for k, v in ROWS.items()},
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
