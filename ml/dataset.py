"""Assemble the S1 training set: audio embeddings + Claude's top-5 ranking.

Three things here exist to stop a number being better than it deserves.

ONE ROW PER RECORDING, NOT PER TRACK. 124 ISRCs carry two Spotify track ids
(single vs album). They are the same audio, so keeping both would put identical
features on both sides of a fold boundary. A representative track is chosen by
sorted id, deterministically, and the discarded twin is kept aside as a free
teacher-noise measurement: Claude classified the same recording twice, under two
different titles, so how often it agrees with itself there is an upper bound on
what any student can reproduce.

TARGETS ARE THE ORDER, NOT THE SCORES. Each assignment is exactly 5 matches,
already descending (verified). Only the ordering is used; the 65-80 score bunching
is discarded, and a category outside the top 5 is "ranked lower", never a zero.

GROUPS ARE ARTISTS. Returned alongside the features so every split can be grouped.
884 of 1,402 artists have exactly one song, so folds are lumpy by construction and
their sizes get reported rather than assumed even.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ML = Path(__file__).resolve().parent
ART = ML / "artifacts"
DATA = ML.parent / "data"


@dataclass(frozen=True)
class Dataset:
    isrc: np.ndarray  # (N,)
    ranking: np.ndarray  # (N, 5) category indices, Claude's order
    groups: np.ndarray  # (N,) artist id
    blocks: dict[str, np.ndarray]  # name -> (N, ...) features
    categories: list[str]  # index -> category name
    no_genre: np.ndarray  # (N,) bool, the subset the claim lives on
    titles: np.ndarray  # (N,) for eyeballing only
    artist_names: np.ndarray  # (N,)
    duplicate_pairs: list[tuple[str, str]]  # (track_a, track_b) same recording


def load(require_sha: str | None = None) -> Dataset:
    meta = json.loads((ART / "embeddings.meta.json").read_text())
    if require_sha and meta["sha256"] != require_sha:
        raise SystemExit(
            f"embeddings.npz sha256 is {meta['sha256'][:12]}…, expected {require_sha[:12]}…"
        )
    emb = np.load(ART / "embeddings.npz")
    cache = json.loads((DATA / "cache.json").read_text())
    track_index = json.loads((ART / "track_index.json").read_text())

    cat_ids = sorted(cache["categories"].keys())
    cat_of = {c: i for i, c in enumerate(cat_ids)}
    cat_names = [cache["categories"][c]["name"] for c in cat_ids]

    # row -> every track id that maps to it
    rows_to_tracks: dict[int, list[str]] = {}
    for tid, row in track_index.items():
        rows_to_tracks.setdefault(row, []).append(tid)

    n = len(emb["isrc"])
    ranking = np.full((n, 5), -1, dtype=np.int64)
    groups = np.empty(n, dtype=object)
    artist_names = np.empty(n, dtype=object)
    titles = np.empty(n, dtype=object)
    no_genre = np.zeros(n, dtype=bool)
    dup_pairs: list[tuple[str, str]] = []
    have = np.zeros(n, dtype=bool)

    for row, tids in rows_to_tracks.items():
        tids = sorted(tids)  # deterministic representative
        rep = tids[0]
        if len(tids) > 1:
            for other in tids[1:]:
                dup_pairs.append((rep, other))
        tr = cache["tracks"][rep]
        art = cache["artists"].get(tr["artist_id"], {})
        matches = cache["assignments"][rep]["matches"]
        ranking[row] = [cat_of[m["category_id"]] for m in matches]
        groups[row] = tr["artist_id"]
        artist_names[row] = art.get("name", "?")
        titles[row] = tr["title"]
        no_genre[row] = len(art.get("genres", [])) == 0
        have[row] = True

    if not have.all():
        raise SystemExit(f"{int((~have).sum())} embedding rows have no track — stop.")

    blocks = {
        "clap": emb["clap"],
        "ess_emb": emb["ess_emb"],
        "ess_mood": emb["ess_mood"],
        "mert1_full": emb["mert1_full"],
        "mert1_win5": emb["mert1_win5"],
        "mert2": emb["mert2"],
    }
    return Dataset(
        isrc=emb["isrc"],
        ranking=ranking,
        groups=groups.astype(str),
        blocks=blocks,
        categories=cat_names,
        no_genre=no_genre,
        titles=titles.astype(str),
        artist_names=artist_names.astype(str),
        duplicate_pairs=dup_pairs,
    )


def grouped_folds(groups: np.ndarray, k: int = 5, seed: int = 0) -> np.ndarray:
    """Group k-fold: every song by one artist lands in the same fold.

    Without this the model can memorise an artist (the biggest here has 27 songs)
    and score well while learning nothing about sound. Assignment is greedy —
    largest artist first into whichever fold is currently smallest — because 884
    of 1,402 artists have a single song and random assignment makes lumpier folds.
    """
    rng = np.random.default_rng(seed)
    uniq, counts = np.unique(groups, return_counts=True)
    order = np.argsort(-counts + rng.random(len(counts)) * 1e-6)
    sizes = np.zeros(k, dtype=int)
    fold_of: dict[str, int] = {}
    for i in order:
        f = int(np.argmin(sizes))
        fold_of[uniq[i]] = f
        sizes[f] += counts[i]
    return np.array([fold_of[g] for g in groups], dtype=int)


def teacher_self_agreement(ds: Dataset) -> dict[str, float]:
    """Claude classified 119 recordings twice, under two different track ids.

    Same audio, same 41 categories, a different row in the request — so this is a
    direct read on how much of the teacher's signal is reproducible at all. It is
    the ceiling any student is chasing, and it costs nothing to compute.
    """
    cache = json.loads((DATA / "cache.json").read_text())
    cat_ids = sorted(cache["categories"].keys())
    cat_of = {c: i for i, c in enumerate(cat_ids)}
    top1 = same3 = n = 0
    for a, b in ds.duplicate_pairs:
        ra = [cat_of[m["category_id"]] for m in cache["assignments"][a]["matches"]]
        rb = [cat_of[m["category_id"]] for m in cache["assignments"][b]["matches"]]
        n += 1
        top1 += ra[0] == rb[0]
        same3 += ra[0] in rb[:3]
    return {
        "pairs": n,
        "top1_identical": top1 / max(n, 1),
        "top1_in_other_top3": same3 / max(n, 1),
    }


if __name__ == "__main__":
    ds = load()
    print(f"rows (recordings) : {len(ds.isrc)}")
    print(f"categories        : {len(ds.categories)}")
    print(f"distinct artists  : {len(set(ds.groups))}")
    print(f"no-genre rows     : {int(ds.no_genre.sum())} ({ds.no_genre.mean()*100:.1f}%)")
    print(f"duplicate pairs   : {len(ds.duplicate_pairs)}")
    print("\nblocks:")
    for k, v in ds.blocks.items():
        print(f"  {k:12s} {v.shape}")
    folds = grouped_folds(ds.groups)
    print("\nfold sizes (grouped by artist):")
    for f in range(5):
        m = folds == f
        print(
            f"  fold {f}: {int(m.sum()):4d} rows, "
            f"{len(set(ds.groups[m])):4d} artists, "
            f"{int((m & ds.no_genre).sum()):4d} no-genre"
        )
    leak = sum(
        1 for g in set(ds.groups) if len(set(folds[ds.groups == g])) > 1
    )
    print(f"\nartists split across folds (must be 0): {leak}")
    print("\nteacher self-agreement on the SAME recording seen twice:")
    for k, v in teacher_self_agreement(ds).items():
        print(f"  {k:20s} {v:.4f}" if isinstance(v, float) else f"  {k:20s} {v}")
