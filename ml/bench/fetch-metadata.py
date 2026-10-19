"""S12 half A, step 1: MTG-Jamendo metadata and the official split-0.

Every number the recon established is RE-DERIVED here from the files rather
than trusted, because the published figures disagree with each other:

  - The TSV carries 59 mood/theme tags; the SPLITS carry 56. Three tags
    (ambiental, horror, mellow) are dropped by the split generator, and the 504
    tracks whose only tags were those three disappear with them. So the dataset
    is "18,486 tracks / 59 tags" and the benchmark is "17,982 tracks / 56 tags".
    The MARBLE paper says 59 while evaluating 56; MediaEval pages say 57.
  - Tag COLUMN ORDER is the silent killer. Three files hold the same 56 tags in
    three different orders. Using the wrong one permutes the ground-truth matrix,
    raises nothing, and lands macro ROC-AUC near 0.50 — which reads as "my model
    failed" rather than "my columns are scrambled". `moodtheme_split.txt` is
    canonical; this script asserts the order it loaded.

Downloads only text: TSVs and tag lists, a few MB. No audio.
"""

from __future__ import annotations

import collections
import hashlib
import json
from pathlib import Path

import requests

RAW = "https://raw.githubusercontent.com/MTG/mtg-jamendo-dataset/master"
OUT = Path(__file__).resolve().parent.parent / "artifacts" / "jamendo"
SPLIT = 0

FILES = {
    "autotagging_moodtheme.tsv": f"{RAW}/data/autotagging_moodtheme.tsv",
    "moodtheme_split.txt": f"{RAW}/data/tags/moodtheme_split.txt",
    "moodtheme.txt": f"{RAW}/data/tags/moodtheme.txt",
    "sha256_tars.txt": f"{RAW}/data/download/autotagging_moodtheme_audio-low_sha256_tars.txt",
    "sha256_tracks.txt": f"{RAW}/data/download/autotagging_moodtheme_audio-low_sha256_tracks.txt",
    **{
        f"split{SPLIT}-{part}.tsv": f"{RAW}/data/splits/split-{SPLIT}/autotagging_moodtheme-{part}.tsv"
        for part in ("train", "validation", "test")
    },
}


def parse_tsv(path: Path) -> dict[str, dict]:
    """TAGS is NOT one column: tags occupy a variable number of trailing
    tab-separated fields, one tag per field, up to 8."""
    rows: dict[str, dict] = {}
    with path.open() as fh:
        header = fh.readline().rstrip("\n").split("\t")
        assert header[:6] == [
            "TRACK_ID", "ARTIST_ID", "ALBUM_ID", "PATH", "DURATION", "TAGS",
        ], header[:6]
        for line in fh:
            f = line.rstrip("\n").split("\t")
            tags = [t for t in f[5:] if t]
            rows[f[0]] = {
                "artist": f[1],
                "album": f[2],
                "path": f[3],
                "duration": float(f[4]),
                "tags": tags,
            }
    return rows


def audio_path(track_id: str) -> str:
    """track_0000948 -> 48/948.low.mp3.

    The folder is the LAST TWO DIGITS of the numeric id, and the audio-low
    extension is `.low.mp3`, which is NOT what the TSV's PATH column says
    (that one is `.mp3`, the full-quality name).
    """
    num = str(int(track_id.removeprefix("track_")))
    return f"{num[-2:].zfill(2)}/{num}.low.mp3"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        dest = OUT / name
        if dest.exists():
            continue
        print(f"  fetching {name} …")
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        dest.write_bytes(r.content)

    full = parse_tsv(OUT / "autotagging_moodtheme.tsv")
    tags59 = [t.strip() for t in (OUT / "moodtheme.txt").read_text().split() if t.strip()]
    tags56 = [t.strip() for t in (OUT / "moodtheme_split.txt").read_text().split() if t.strip()]

    print(f"\nfull TSV      : {len(full):,} tracks")
    seen = {t for r in full.values() for t in r["tags"]}
    print(f"distinct tags : {len(seen)}   tag files: moodtheme.txt={len(tags59)}, moodtheme_split.txt={len(tags56)}")
    dropped = sorted(set(tags59) - set(tags56))
    print(f"dropped by the splits: {dropped}")

    splits = {p: parse_tsv(OUT / f"split{SPLIT}-{p}.tsv") for p in ("train", "validation", "test")}
    total = sum(len(v) for v in splits.values())
    print(f"\nsplit-{SPLIT}: " + "  ".join(f"{k} {len(v):,}" for k, v in splits.items()) + f"  total {total:,}")
    print(f"tracks in the TSV but not in split-{SPLIT}: {len(full) - total:,}")

    only_dropped = [
        t for t, r in full.items() if r["tags"] and all(x in dropped for x in r["tags"])
    ]
    print(f"tracks whose ONLY tags were the dropped three: {len(only_dropped):,}")

    # Artist disjointness is the property that makes this benchmark honest.
    arts = {p: {r["artist"] for r in v.values()} for p, v in splits.items()}
    print(
        f"\nartist overlap train/test {len(arts['train'] & arts['test'])}, "
        f"train/val {len(arts['train'] & arts['validation'])}, "
        f"val/test {len(arts['validation'] & arts['test'])}   (0 = artist-disjoint)"
    )

    pos = collections.Counter(t for r in splits["test"].values() for t in r["tags"] if t in tags56)
    missing = [t for t in tags56 if pos[t] == 0]
    print(f"\ntest positives per tag: min {min(pos.values())} ({min(pos, key=pos.get)}), max {max(pos.values())} ({max(pos, key=pos.get)})")
    print(f"tags with ZERO positives in test: {len(missing)}  (a zero-positive tag makes macro ROC-AUC NaN)")

    durs = [r["duration"] for r in full.values()]
    chunks = sum(max(1, int(d // 30)) for r, d in zip(full, durs))
    print(f"\ntrack duration: median {sorted(durs)[len(durs)//2]:.0f}s, mean {sum(durs)/len(durs):.0f}s")
    print(f"non-overlapping 30s chunks over the FULL tsv: ~{chunks:,}")
    sp_chunks = {
        p: sum(max(1, int(r["duration"] // 30)) for r in v.values()) for p, v in splits.items()
    }
    print("30s chunks per split-0 part: " + "  ".join(f"{k} {v:,}" for k, v in sp_chunks.items()))
    print(f"TOTAL chunks to embed for a full MARBLE-faithful run: {sum(sp_chunks.values()):,}")

    manifest = {
        "split": SPLIT,
        "tags56": tags56,
        "tags56_sha256": hashlib.sha256("\n".join(tags56).encode()).hexdigest(),
        "dropped_tags": dropped,
        "counts": {p: len(v) for p, v in splits.items()},
        "chunks_per_split": sp_chunks,
        "artist_disjoint": all(
            not (arts[a] & arts[b])
            for a, b in (("train", "test"), ("train", "validation"), ("validation", "test"))
        ),
        "test_positives_min": min(pos.values()),
        "zero_positive_tags": missing,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nwrote {OUT / 'manifest.json'}")
    print(f"tag-order sha256 (canonical moodtheme_split.txt): {manifest['tags56_sha256'][:16]}…")


if __name__ == "__main__":
    main()
