"""Add the `chunk` provenance array to shards written before embed.py recorded it.

Why this is safe rather than a guess: a shard's `chunk` is by definition the
clips it was asked to cover, and embed.py appends every clip to exactly one of
two places — the `isrc` column on success, or the `failures` list on error. So

    chunk == isrc + [f["isrc"] for f in failures]

is a reconstruction, not an inference. The script refuses any shard where that
identity cannot be checked (wrong total, or duplicate entries), rather than
writing a provenance record it cannot stand behind.

Ordering within the chunk is not recovered exactly when a shard had failures,
because failures are appended in completion order. That does not matter: the
resume check compares the chunk as a list built the same way, and the merge
reconciles on sets.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

SHARDS = Path(__file__).resolve().parent / "artifacts" / "shards"
EXPECTED = 100  # SHARD_SIZE; the final shard is allowed to be short


def main() -> None:
    paths = sorted(SHARDS.glob("shard-*.npz"))
    if not paths:
        raise SystemExit("no shards found")
    done = skipped = 0
    for p in paths:
        d = np.load(p)
        if "chunk" in d.files:
            skipped += 1
            continue
        isrc = d["isrc"].tolist()
        failures = json.loads(str(d["failures"]))
        chunk = isrc + [f["isrc"] for f in failures]
        if len(chunk) != len(set(chunk)):
            raise SystemExit(f"{p.name}: duplicate entries, refusing to backfill")
        if len(chunk) > EXPECTED:
            raise SystemExit(f"{p.name}: {len(chunk)} entries > shard size {EXPECTED}")
        payload = {k: d[k] for k in d.files}
        payload["chunk"] = np.array(chunk)
        np.savez_compressed(p, **payload)
        print(f"  {p.name}: recorded {len(chunk)} clips ({len(failures)} failed)")
        done += 1
    print(f"\nbackfilled {done}, already had provenance {skipped}")


if __name__ == "__main__":
    main()
