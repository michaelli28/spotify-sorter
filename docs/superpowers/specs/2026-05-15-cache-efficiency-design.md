# Cache Efficiency: Diagnose, Visibility, Snapshot Caching

**Date:** 2026-05-15
**Status:** Draft — awaiting user review
**Goal:** Stop the "every rescan + categorize burns Claude tokens" problem with surgical changes to the existing cache pipeline.

## Problem

User reports: "each time I rescan and categorize it takes up a lot of Claude usage." Live cache shows 2,875 tracks scanned but **0 categories, 0 assignments, 0 runs** — even though the scan persists fine and the propose pipeline contains a `writeCache` call.

The architecture already supports caching well:

- `patchCache` does shallow merge on record fields → categories/assignments are _never wiped_ by patches
- Classify already filters to unclassified track IDs only → re-running classify after a partial run is incremental
- Review page short-circuits propose if `cache.categories` is non-empty
- Classify uses Anthropic prompt caching on the system prompt across all ~58 batches

So the user pain is some combination of:

1. **A real bug**: propose doesn't actually persist (cache shows 0 categories despite the streaming fix landing in v1.0.0)
2. **No visibility**: even when caching works, the user can't tell it's working — every run _feels_ expensive
3. **Scan is always full-fetch**: rescans hit Spotify for every playlist regardless of whether the playlist changed (slow, even if no Claude cost)

## Approach: three surgical bundles

### Bundle 1 — Diagnose the 0-categories bug

Before building anything, run the actual pipeline against the live cache and find out _why_ `categories` is empty. Hypotheses, in priority order:

- Propose succeeds but the `patchCache` shallow merge doesn't write categories because the route handler crashes after the LLM call but before write. Verify by adding a structured log immediately before/after `writeCache` in `runProposeFromCache`.
- The streaming SSE route loses the categories on the JSON parse retry path — verify by checking whether the second attempt's result actually reaches `writeCache`.
- Propose has never completed end-to-end on this user's library (3.3 min calls, possible browser tab close, browser kills the EventSource).

Fix whichever is real. Likely a 1-2 line change. **No further work in this bundle until diagnosed.**

Acceptance: after one successful propose run, `data/cache.json` contains a non-empty `categories` record AND the same record is present after a server restart.

### Bundle 2 — Visibility (the "you saved $X" feeling)

Add three pieces of UI feedback so the user can _see_ the cache working:

**B2.1 — Cost-and-cache preview before any LLM action**

Before the propose or classify call fires, show a panel with:

- Tracks: `2,875 total · 2,800 already classified · 75 new`
- Estimated cost: `$0.05 (vs $1.20 from scratch)`
- Categories line, when categories exist: `32 cached from 2026-05-13` with a secondary `Re-propose ($0.18)` button that requires explicit click before any propose call fires

Reuse the existing `CostPreviewModal` and `estimateCostUSD` — they already compute these numbers. We just need to surface what's _cached_ vs what will run, and gate re-propose behind an explicit action (today the review page silently calls propose only when categories are empty — this makes the cached-state visible and the override deliberate).

**B2.2 — Post-run summary banner**

After classify completes, show: `Used cached results for 2,800 tracks. Classified 75 new tracks for $0.04. Saved ~$1.16 vs full re-classify.`

Persist this in the existing `runs` array (which is currently empty — we should start writing it). Schema already has `RunSchema` with `tracks_classified`, `tracks_total`, `cost_usd`, `summary`.

**B2.3 — "Last run" on review/classify pages**

Small footer line: `Categories proposed 2 days ago · 32 categories · $0.18`. Reuses the same `runs` data.

### Bundle 3 — Spotify snapshot caching for scan

Spotify's playlist API returns a `snapshot_id` that changes whenever the playlist's tracks change. Use it to skip refetch.

**Cache schema addition** (bumps cache version 1 → 2):

```ts
playlist_snapshots: z.record(z.string(), z.object({
  snapshot_id: z.string(),
  fetched_at: ISODate,
  track_count: z.number().int().min(0),
})),
```

Plus a migration in `read.ts` that converts v1 → v2 by initializing `playlist_snapshots: {}`.

**Scan flow change** (in `runScan`):

1. For each playlist in scope, do a cheap `GET /v1/playlists/:id?fields=snapshot_id,tracks(total)` (one round trip per playlist, but no track pagination)
2. If `snapshot_id` matches the cached one, skip the full track fetch entirely. We don't need to know "which tracks belong to this playlist" because the cache uses an additive, union-of-all-playlists model — anything previously fetched stays in cache keyed by track ID, and a stable snapshot guarantees the playlist's contents haven't changed since last fetch.
3. If different (or missing), do the full fetch and update `playlist_snapshots[playlist_id]`.

Note: the existing scan does not remove tracks that disappear from a playlist (cache is append-only by track ID). Bundle 3 preserves this behavior — orphan tracks remain a separate, pre-existing concern not addressed here.

**Liked Songs caveat:** Liked Songs has no `snapshot_id`. Use total count + most-recent `added_at` as a coarse fingerprint. If both match the cached values, skip; otherwise refetch.

**Migration mechanics:** `read.ts` currently throws `CacheVersionMismatch` on version drift. The migration goes _before_ that check: if `parsed.version === 1`, transform in place (`parsed.version = 2; parsed.playlist_snapshots = {};`), then continue to schema validation.

This bundle is the largest. Before building, re-confirm with the user it's worth the schema bump — if the diagnose-and-visibility bundle alone fixes the felt pain, scope this out.

## Out of scope (deliberately)

- **Library fingerprint / hash-keyed propose results** — over-engineered for the actual symptom. The "categories already exist → short-circuit" behavior already does this at lower cost.
- **Multi-version cache history** — single cache file is fine; we're not building undo.
- **Server-side cache for propose LLM responses** — Anthropic prompt caching only helps on identical prefixes; propose is a single one-shot, so the only real cache is the result itself, which we already do.
- **Background polling / auto-refresh** — user-initiated only.

## Architecture summary

| File                                         | Change                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `src/lib/pipeline/propose.ts`                | Add structured log around `writeCache` (Bundle 1)                 |
| `app/api/llm/propose/route.ts`               | Verify SSE retry path actually persists (Bundle 1)                |
| `src/components/review/CostPreviewModal.tsx` | Add cached-vs-new breakdown (Bundle 2.1)                          |
| `app/review/page.tsx`                        | Pass cache stats into the modal; add re-propose gate (Bundle 2.1) |
| `app/classify/page.tsx`                      | Show post-run summary banner (Bundle 2.2)                         |
| `src/lib/pipeline/classify.ts`               | Push run record onto `cache.runs` after completion (Bundle 2.2)   |
| `src/lib/pipeline/propose.ts`                | Same — push run record (Bundle 2.2)                               |
| `src/lib/cache/schema.ts`                    | Bump to v2, add `playlist_snapshots` (Bundle 3)                   |
| `src/lib/cache/read.ts`                      | v1 → v2 migration (Bundle 3)                                      |
| `src/lib/spotify/playlists.ts`               | New `fetchPlaylistSnapshot()` helper (Bundle 3)                   |
| `src/lib/pipeline/scan.ts`                   | Snapshot check before full fetch (Bundle 3)                       |

## Testing

- **Bundle 1**: integration test that runs `runProposeFromCache` against an MSW-mocked Anthropic SSE response and asserts `data/cache.json` ends up with the expected categories.
- **Bundle 2**: component tests for the cached-vs-new modal display; pipeline test that asserts a run record is appended.
- **Bundle 3**: integration test that mocks Spotify with stable `snapshot_id` and asserts only the snapshot endpoint is hit (not the track-pagination endpoint) on rescan; and the inverse — that a changed snapshot triggers full refetch.

Plus run the existing test suite (`pnpm test` / `npm test`) — must stay green.

## Phasing

Ship in order. Each bundle is independently shippable.

1. **Bundle 1 first** — likely fixes 80% of the felt pain on its own.
2. **Bundle 2** if user still feels uncertainty about whether caching works.
3. **Bundle 3** only if rescan time is still painful — defer until other bundles land.

This phasing matches "diagnose before building." If Bundle 1 reveals propose is fine and the issue was something else (e.g., user clearing data), revise the spec.

## Open questions

None blocking. The schema migration in Bundle 3 is the only "irreversible" decision; flag for confirmation when starting that bundle.
