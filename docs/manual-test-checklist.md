# Manual Smoke Test Checklist

Run against a disposable Spotify account before any release-equivalent moment.

## Setup

- [ ] Fresh repo clone, `pnpm install`, `pnpm start:open`
- [ ] Browser auto-opens on 127.0.0.1:3000
- [ ] Setup wizard walks through all 4 steps
- [ ] Bad Anthropic key is rejected with clear message
- [ ] After save, redirected to landing page

## OAuth

- [ ] "Connect Spotify" → Spotify approval → returns to /scope
- [ ] User-deny shows /?error=denied page
- [ ] Stale OAuth (after 1hr+) auto-refreshes and proceeds

## Scope + Scan

- [ ] All owned playlists + Liked Songs render with cover art and track count
- [ ] Unchecking a playlist persists when navigating back
- [ ] Scan completes for ~2k tracks in <15s
- [ ] Empty scope blocked with friendly empty-state

## Review

- [ ] 25-35 categories proposed
- [ ] Inline rename works
- [ ] Drag-merge collapses into one card
- [ ] Add custom category with description
- [ ] Cost preview modal accurate to <50%

## Classify

- [ ] Progress UI updates per batch
- [ ] Confidence slider re-flows playlist counts in real-time
- [ ] Drag a track from card A to card B persists override
- [ ] Re-run never moves manually-placed tracks

## Apply

- [ ] Confirmation modal accurate counts
- [ ] All ✨ playlists created, private, correct names
- [ ] Tracks added, batched 100/req, no missing
- [ ] Success screen displays new playlists with reverence
- [ ] Manual folder drag in desktop client works (one-time)

## Re-run

- [ ] Diff view surfaces N new / M removed
- [ ] (a) Apply existing → only new tracks classified
- [ ] (b) Edit categories → adding new one triggers surgical re-class
- [ ] Existing assignments untouched
- [ ] Removed-tracks warning shown, no auto-removal

## Errors

- [ ] Spotify 429 → automatic backoff, no user action needed
- [ ] Anthropic 429 → concurrency degrades 3→2→1
- [ ] Mid-classify cancel + resume next session works
