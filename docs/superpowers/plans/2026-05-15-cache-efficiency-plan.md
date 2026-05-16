# Cache Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution.

**Goal:** Diagnose & fix the "0 categories despite 2,875 tracks" bug, add cache visibility UI, and add Spotify snapshot caching.

**Architecture:** Three independently-shippable bundles per spec. Bundle 1 first (likely 1-2 line fix). Bundles 2 & 3 build on the existing cache patterns.

**Tech Stack:** Next.js 16 App Router, Zod, vitest + MSW, Anthropic SDK with SSE streaming, dnd-kit.

---

## Bundle 1 — Diagnose & fix the propose persistence

### Task 1.1: Run existing propose tests to baseline

- [ ] Run `npm test -- pipeline-propose llm-propose` and observe pass/fail.
- [ ] If both pass → the bug isn't in the unit/integration layer; it's in the runtime path (likely SSE client disconnect aborting before write). Proceed to 1.2.
- [ ] If failing → fix as regression first, then 1.2.

### Task 1.2: Add a regression test for "client disconnect mid-stream still persists categories"

**Files:**

- Test: `tests/integration/llm-propose-route.test.ts` (new)

The hypothesis: when the browser closes the EventSource mid-stream, Next.js aborts the route handler before `writeCache` runs. Test simulates an aborted request after `done` is emitted but before the persistence step.

If the propose pipeline writes BEFORE emitting `done`, this test will pass. If after, it'll fail.

### Task 1.3: Make SSE route resilient — write to cache before streaming `done`

Inspect `app/api/llm/propose/route.ts`. Ensure the order is:

1. Stream progress events
2. Stream complete → write categories to disk (await)
3. Emit `done` event

If the route currently emits `done` first or runs the write inside an unawaited promise, fix.

### Task 1.4: Add structured log around persistence

Add a `console.log` (project uses console for now) to `src/lib/pipeline/propose.ts` immediately after `writeCache` so future runs leave a trace.

### Task 1.5: Manually verify

Spin dev server, run propose, confirm `data/cache.json.categories` populates.

---

## Bundle 2 — Visibility

### Task 2.1: Persist Run records

When `runProposeFromCache` and `runClassifyFromCache` complete, append a `RunSchema` record to `cache.runs` with started_at, completed_at, tracks_total, tracks_classified, cost_usd, summary.

### Task 2.2: Surface "last run" on review/classify pages

Read `cache.runs` on page load, show the most recent matching run as a footer line: `Categories proposed 2 days ago · 32 categories · $0.18`.

### Task 2.3: Cached-vs-new breakdown in CostPreviewModal

Pass `tracksTotal`, `tracksAlreadyClassified`, and `tracksNew` props. Render the breakdown above the cost line.

### Task 2.4: Re-propose gate on review page

When `cache.categories` is non-empty, do NOT silently call propose. Show the cached categories with a "Re-propose ($X.XX)" secondary button that explicitly triggers a fresh call (which clears existing categories first via PATCH).

### Task 2.5: Post-classify success banner

After classify completes, show one-shot banner: `Used cached results for 2,800 tracks. Classified 75 new for $0.04. Saved ~$1.16.`

---

## Bundle 3 — Spotify snapshot caching

### Task 3.1: Bump cache schema to v2 with `playlist_snapshots`

Add to `CacheSchema`:

```ts
playlist_snapshots: z.record(
  z.string(),
  z.object({
    snapshot_id: z.string(),
    fetched_at: z.string().datetime(),
    track_count: z.number().int().min(0),
  }),
);
```

Bump `EXPECTED_CACHE_VERSION = 2`.

### Task 3.2: v1 → v2 migration in read.ts

Before the version-mismatch throw, if `parsed.version === 1`, mutate to `version: 2, playlist_snapshots: {}` then continue.

### Task 3.3: `fetchPlaylistSnapshot` helper

In `src/lib/spotify/playlists.ts`, add a function that returns `{ snapshot_id, track_count }` via `GET /v1/playlists/:id?fields=snapshot_id,tracks(total)`.

### Task 3.4: Scan skip-on-unchanged-snapshot

In `runScan`: for each playlist, fetch snapshot first. If matches cache, skip full track fetch. Otherwise full fetch + update snapshot record.

### Task 3.5: Liked Songs lightweight fingerprint

Liked Songs: GET total + most-recent added_at via `?limit=1`. Compare to cached values.

### Task 3.6: Update existing scan tests for snapshot path

---

## Self-Review Notes

- Bundle 1 is investigative; the "exact code" rule is relaxed because we don't yet know the root cause. Tasks describe what to verify, not what to write.
- Bundles 2 & 3 contain all needed code in the file diffs.
- Schema bump in 3.1 is the only irreversible decision; auto-migrate handles existing user data.
