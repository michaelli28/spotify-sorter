"""The gold set, defined once.

The gold set is the denominator of the headline claim, so it gets exactly one
definition and every script reads it from here. It was previously inlined in
streaming-history.py; a second copy is how two scripts start quoting two
different numbers for the same set.

Membership (`ml/GOLD-PROTOCOL.md` §1):
    the 190 ids drawn into data/labels/gold-sample.json
  + the members of the earlier random sample that are also no-genre (61)
  = 251, all of them no-genre, all of them in the library.

Eligibility (§4) is separate from membership and is reported, never silently
applied: a song can be in the gold set and still be excluded from the primary
metric because the student had no usable audio for it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

ML = Path(__file__).resolve().parent
ART = ML / "artifacts"
DATA = ML.parent / "data"

# §4: a Deezer match whose duration differs from Spotify's by more than this is
# a different recording of the same ISRC — the student heard the wrong song.
DURATION_FLAG_S = 3.0


@dataclass(frozen=True)
class GoldSet:
    track_ids: list[str]            # all 251, sorted — the membership
    eligible: list[str]             # the primary denominator (§4)
    excluded: dict[str, str]        # track_id -> reason, reported with counts
    isrc_of: dict[str, str]
    row_of: dict[str, int]          # track_id -> embeddings.npz row
    artist_of: dict[str, str]
    title_of: dict[str, str]
    cat_ids: list[str]              # 41, sorted — THE category index order
    cat_names: list[str]

    def index_of(self) -> dict[str, int]:
        return {c: i for i, c in enumerate(self.cat_ids)}


def load() -> GoldSet:
    cache = json.loads((DATA / "cache.json").read_text())
    tracks, artists = cache["tracks"], cache["artists"]

    no_genre = {
        t for t in tracks if not artists.get(tracks[t]["artist_id"], {}).get("genres")
    }
    ids = set(json.loads((DATA / "labels" / "gold-sample.json").read_text())["track_ids"])
    sample = json.loads((DATA / "labels" / "sample.json").read_text())
    ids |= {t for t in sample["random_track_ids"] if t in no_genre}
    track_ids = sorted(ids)

    if not ids <= no_genre:
        raise SystemExit(
            f"{len(ids - no_genre)} gold tracks are NOT no-genre — the claim is scoped to "
            "no-genre songs, so this would silently widen it."
        )

    isrc_raw = json.loads((ART / "isrc.json").read_text())
    deezer = json.loads((ART / "deezer.json").read_text())
    row_index = json.loads((ART / "track_index.json").read_text())

    isrc_of, row_of, excluded = {}, {}, {}
    for t in track_ids:
        isrc = (isrc_raw.get(t) or {}).get("isrc")
        if not isrc:
            excluded[t] = "no_isrc"
            continue
        isrc_of[t] = isrc
        d = deezer.get(isrc) or {}
        status = d.get("status")
        if status != "ok":
            excluded[t] = status or "no_deezer_row"
            continue
        # duration_flag is written by fetch-deezer.ts; recompute is not possible
        # here (Deezer durations are not all retained), so trust the recorded flag.
        if d.get("duration_flag"):
            excluded[t] = "wrong_version"
            continue
        if t not in row_index:
            # embedded set is keyed by recording; a track with no row was never
            # embedded, so the student genuinely cannot score it.
            excluded[t] = "no_embedding"
            continue
        row_of[t] = row_index[t]

    cat_ids = sorted(cache["categories"].keys())
    return GoldSet(
        track_ids=track_ids,
        eligible=[t for t in track_ids if t not in excluded],
        excluded=excluded,
        isrc_of=isrc_of,
        row_of=row_of,
        artist_of={t: tracks[t]["artist_id"] for t in track_ids},
        title_of={t: tracks[t]["title"] for t in track_ids},
        cat_ids=cat_ids,
        cat_names=[cache["categories"][c]["name"] for c in cat_ids],
    )


if __name__ == "__main__":
    import collections

    g = load()
    print(f"gold set      : {len(g.track_ids)}")
    print(f"eligible (§4) : {len(g.eligible)}")
    print(f"excluded      : {len(g.excluded)}")
    for reason, n in sorted(collections.Counter(g.excluded.values()).items()):
        print(f"  {reason:14s} {n}")
    print(f"categories    : {len(g.cat_ids)}")
    print(f"artists       : {len(set(g.artist_of.values()))} across {len(g.track_ids)} songs")
    sizes = collections.Counter(g.artist_of.values())
    print(f"largest artist: {sizes.most_common(1)[0][1]} songs")
