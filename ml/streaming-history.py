"""What Michael's Spotify extended streaming history is good for.

Two separate questions, and they should not be confused.

1. PROVENANCE. Spotify's developer terms restrict what may be done with data
   from the API. The privacy export is Michael's own data obtained as a data
   subject, by a different route. So: how much of the library could be
   reconstructed from the export alone, with no API call? This is the question
   STATE.md's "use his personal data export" was really about.

2. A NEW, INDEPENDENT SIGNAL. Play counts, skip rates and completion are
   revealed preference — what he actually listens to. That is independent of
   both Claude (which read titles) and the audio (which the student hears). It
   is therefore a third axis, and a tempting one to misuse: it is NOT ground
   truth for "which category does this song belong to", and nothing here feeds
   the blind-label comparison.

Reads only; writes a summary artifact and nothing else.
"""

from __future__ import annotations

import collections
import glob
import json
import statistics
from pathlib import Path

import gold_set

ML = Path(__file__).resolve().parent
ART = ML / "artifacts"
DATA = ML.parent / "data"
HISTORY = Path.home() / "Downloads" / "Spotify Extended Streaming History"


def main() -> None:
    files = sorted(glob.glob(str(HISTORY / "Streaming_History_Audio_*.json")))
    if not files:
        raise SystemExit(f"no streaming history under {HISTORY}")
    rows = []
    for f in files:
        rows.extend(json.loads(Path(f).read_text()))

    cache = json.loads((DATA / "cache.json").read_text())
    library = set(cache["tracks"])
    no_genre = {
        t
        for t in library
        if not cache["artists"].get(cache["tracks"][t]["artist_id"], {}).get("genres")
    }
    gold = set(gold_set.load().track_ids)

    plays: collections.Counter = collections.Counter()
    ms: collections.Counter = collections.Counter()
    skips: collections.Counter = collections.Counter()
    names: dict[str, tuple[str, str]] = {}
    for r in rows:
        uri = r.get("spotify_track_uri")
        if not uri:
            continue
        tid = uri.rsplit(":", 1)[-1]
        plays[tid] += 1
        ms[tid] += r.get("ms_played") or 0
        if r.get("skipped"):
            skips[tid] += 1
        if tid not in names:
            names[tid] = (
                r.get("master_metadata_track_name") or "",
                r.get("master_metadata_album_artist_name") or "",
            )

    print(f"plays: {len(rows):,}  distinct tracks: {len(plays):,}  files: {len(files)}")
    print(f"range: {min(r['ts'] for r in rows)} -> {max(r['ts'] for r in rows)}")
    print(f"total listening: {sum(ms.values())/3.6e6:,.0f} h\n")

    print("=== 1. PROVENANCE: how much of the library exists in the export alone? ===")
    out: dict[str, object] = {}
    for label, s in (
        ("whole library", library),
        ("no-genre songs", no_genre),
        ("gold set", gold),
    ):
        hit = {t for t in s if plays[t]}
        named = {t for t in hit if names.get(t, ("", ""))[0]}
        print(
            f"  {label:16s} {len(hit):5d}/{len(s):5d} = {len(hit)/len(s)*100:5.1f}% played, "
            f"{len(named)} of those also carry a title+artist in the export"
        )
        out[label] = {"n": len(s), "in_export": len(hit), "named": len(named)}
    missing = len(library) - len({t for t in library if plays[t]})
    print(
        f"\n  {missing} library tracks were never played in 8 years, so the export alone\n"
        f"  cannot reconstruct the full library. The ACCOUNT data export (a separate\n"
        f"  request: YourLibrary.json) is the one that lists saved tracks outright."
    )

    print("\n=== 2. REVEALED PREFERENCE on library tracks ===")
    played = [t for t in library if plays[t]]
    pc = [plays[t] for t in played]
    lib_plays = sum(plays[t] for t in library)
    lib_skips = sum(skips[t] for t in library)
    print(f"  median plays per played track : {statistics.median(pc):.0f}")
    print(f"  mean / max                    : {statistics.mean(pc):.1f} / {max(pc)}")
    print(f"  listening on library tracks   : {sum(ms[t] for t in library)/3.6e6:,.0f} h "
          f"({sum(ms[t] for t in library)/sum(ms.values())*100:.0f}% of all listening)")
    print(f"  skip rate on library tracks   : {lib_skips/lib_plays*100:.1f}% of {lib_plays:,} plays")
    out["revealed_preference"] = {
        "median_plays": statistics.median(pc),
        "mean_plays": round(statistics.mean(pc), 2),
        "max_plays": max(pc),
        "library_skip_rate": round(lib_skips / lib_plays, 4),
        "never_played": missing,
    }

    print("\n  most played in the library:")
    for tid, n in sorted(((t, plays[t]) for t in library), key=lambda x: -x[1])[:5]:
        nm = names.get(tid, ("?", "?"))
        print(f"    {n:4d} plays  {nm[0][:34]:34s} {nm[1][:22]}")

    path = ART / "streaming-history.json"
    path.write_text(json.dumps(out, indent=2))
    print(f"\nwrote {path}")
    print(
        "\nNOT USED as a label or a feature anywhere. Play counts are revealed\n"
        "preference, not category membership, and mixing them into the blind-label\n"
        "comparison would answer a different question than the one being asked."
    )


if __name__ == "__main__":
    main()
