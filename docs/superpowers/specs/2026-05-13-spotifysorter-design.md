# SpotifySorter — Design Spec

**Date:** 2026-05-13
**Status:** Approved for implementation planning
**Author:** Brainstormed via Claude Code
**Canonical design DNA:** [`/.impeccable.md`](../../../.impeccable.md)

---

## Executive Summary

A single-user, local web tool that scans the owner's Spotify library (~2,000 unique tracks across 40+ playlists, plus Liked Songs), uses an LLM to propose 25-35 vibey sub-genre/mood categories tuned to their specific library, lets the owner edit those categories in a polished local web UI, then classifies every track via LLM into one or more of those categories with confidence scores. Tracks land in newly-created prefixed Spotify playlists (e.g. `✨ Aesthetic Rap`, `✨ Sad Slow`) which the owner manually drags into a folder once. Re-runs are incremental and idempotent.

**Form factor:** Local Next.js 16 app on `localhost:3000`. Personal use only.

**Hard constraint:** Spotify's Web API does not support folders programmatically; the tool uses a naming-prefix workaround + a single one-time manual folder drag in the Spotify desktop client.

**Design directive:** _Tactile, nocturnal, unhurried — a private record-listening room at 1am._ No AI slop. Implementation must invoke `impeccable`, `ui-ux-pro-max`, `animate`, `polish`, `critique`, `typeset`, `layout`, `delight` skills throughout. Framer Motion is canonical motion library.

---

## 1. End-to-End User Flow

### 1.1 One-time setup (~5 minutes, first run only)

1. Clone repo, run `pnpm install`.
2. Run `pnpm start` → browser auto-opens at `localhost:3000`.
3. **In-browser configuration wizard** walks the user through:
   - Creating a Spotify Developer App (live screenshots of the dashboard, copy-paste-ready strings — App name suggestion, redirect URI = `http://127.0.0.1:3000/auth/callback`).
   - Pasting the resulting Client ID into the wizard form.
   - Pasting the user's Anthropic API key. Wizard makes a `messages.create` call with `max_tokens: 1` to validate the key before proceeding.
   - Choosing the playlist prefix (default `✨`, configurable to any single emoji/character).
   - The wizard tests OAuth end-to-end before completing — fails fast with explicit fix instructions if the redirect URI is wrong (the most common cause of OAuth pain).

Storage split: **secrets go to `./.env.local`** (`SPOTIFY_CLIENT_ID`, `ANTHROPIC_API_KEY`); **user preferences go to `./data/cache.json` `config` section** (prefix, confidence threshold default, anthropic model ID).

### 1.2 Every run (including the first)

1. **Connect.** Click "Connect Spotify." OAuth PKCE flow opens, user approves scopes: `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-private`, `user-library-read`, `user-read-private`. Returns to app.
2. **Scope screen.** Tool lists every playlist the user owns + their Liked Songs as checkbox cards (with cover art + track count). All checked by default; user can uncheck specific playlists (e.g., a curated wedding playlist) to exclude. Click "Scan."
3. **Scan progress (data fetch only).** Pipeline runs: fetch playlists → dedupe tracks → fetch artist genres. NO LLM call here. Progress bar with stage label. Takes ~5-10 seconds for 2k tracks.
4. **Cost preview modal #1** (before LLM propose): _"About to use ~$0.05-$0.10 of Anthropic credits to propose categories. Proceed?"_
5. **LLM propose runs.** ~15-30 seconds for 2k tracks (single call; library fits in Haiku's 200k context).
6. **Category review screen.** Tool displays ~25-35 proposed categories as cards. Each card shows: editable name, 5 sample tracks (clickable to open in Spotify desktop client via `spotify:track:<id>` URI), short LLM-generated description, estimated count. User can:
   - ✏️ Rename inline
   - 🔀 Drag one card onto another to merge
   - 🗑️ Delete unwanted categories
   - ➕ Add custom category with name + short description (e.g., "trap with sad piano samples")
   - Click "Show all 87 sample tracks" to expand any card and see the full provisional list
   - When happy, click "Classify."
7. **Cost preview modal #2** (before LLM classify): _"About to use ~$1-$3 to classify N tracks across M categories. Proceed?"_
8. **LLM classify runs.** Batched (50 tracks/batch, 3 concurrent), ~30-60 seconds for 2k tracks.
9. **Confidence slider screen.** UI shows playlist cards with live track counts and a global confidence slider (default 65). Drag down → playlists get fatter; drag up → tighter. Per-card counts update in real-time (pure client-side filter on cached scores). Sample tracks expandable per playlist.
10. **Manual override.** On this same screen, the user can drag individual track chips from one playlist card to another. The cache records the override; future re-runs respect it (no re-classification ever moves a manually-placed track).
11. **Apply confirmation modal.** Final review: _"This will create 14 new playlists, add 1,847 tracks total. Continue?"_ (On re-runs the wording adapts: _"create N new, update M existing, add X tracks."_)
12. **Apply.** Tool creates `<prefix> <Category Name>` playlists in Spotify (all private by default), adds tracks (batched 100 per request). Live progress bar.
13. **Apply success screen.** Newly-created playlists displayed with weight, type, and reverence — like the credits at the end of a record. Deep-links to each new playlist (`spotify:playlist:<id>`).
14. **One-time manual step (first run only):** Open Spotify desktop → multi-select all `✨`-prefixed playlists → right-click → "Add to Folder" → name it "Organized." 30 seconds, never again.

### 1.3 Re-runs (additive, incremental)

Same flow as 1.2, but with a re-run-specific diff screen after step 3 (scan):

- **Diff view (new screen, re-runs only).** Surfaces after scan, before any LLM call: _"23 new tracks since last run, 2 tracks removed from source playlists. Existing categories: 25. Apply with existing categories, or edit categories?"_ Two branches:
  - **(a) Apply with existing categories** → skip propose entirely → cost preview #2 for classify of only the new tracks → classify → slider → apply (additive only)
  - **(b) Edit categories** → go to category review screen with existing categories pre-populated → user adds/edits/removes categories → cost preview #2 → classify new tracks + surgical re-class for any added categories → slider → apply
- **Surgical re-classification on category changes:** if the user added a new category like "Hyperpop" on the review screen, the tool runs a focused LLM pass asking "does each existing track fit `Hyperpop`?" against the full library. Existing assignments to other categories remain untouched. Manual overrides still preserved.
- **Apply step matches by stored Spotify playlist ID, not name** — so renaming `✨ Aesthetic Rap` to `Aesthetic Rap` in Spotify doesn't cause a duplicate on re-run.
- **Removed tracks (warn-only).** Tracks that disappeared from the user's source playlists since last run remain in `✨` playlists. The diff banner flags them: _"2 tracks removed from your source playlists; they still exist in 'Aesthetic Rap' and 'Sad Slow'. Open them?"_ — no auto-removal.

---

## 2. Tech Stack & Architecture

### 2.1 Stack

- **Runtime:** Node.js 24 LTS
- **Language:** TypeScript (strict mode per global CLAUDE.md)
- **Framework:** Next.js 16 with App Router — single process, OAuth callback handled as a route handler, frontend + backend collapsed into one app.
- **UI base:** Tailwind CSS + shadcn/ui (**unstyled primitive base only** — every component fully restyled per `.impeccable.md`)
- **Motion:** Framer Motion v12+ (canonical)
- **Drag-and-drop:** `@dnd-kit/core`
- **Spotify client:** `@spotify/web-api-ts-sdk` (official) with PKCE flow
- **LLM client:** `@anthropic-ai/sdk` directly (no Vercel AI Gateway — this is a local tool, not a deployed app)
- **Model:** `claude-haiku-4-5-20251001`
- **Validation:** Zod for LLM responses + config + cache schema
- **Cache:** plain JSON file at `./data/cache.json`, atomic writes (temp file + `rename`)
- **Package manager:** pnpm
- **Testing:** Vitest + MSW (HTTP mocking) + Playwright (E2E)
- **Linting:** ESLint + Prettier with the user's existing global config

### 2.2 Process model

```
┌─────────────────────────────────────────────────────────┐
│  spotifysorter  (single Next.js process on :3000)       │
│                                                          │
│   App routes (UI):                                       │
│   /              → connect button                        │
│   /setup         → first-run config wizard               │
│   /scope         → choose playlists to include           │
│   /scan          → progress                              │
│   /review        → edit proposed categories              │
│   /classify      → confidence slider + drag-override     │
│   /apply         → write to Spotify + success            │
│                                                          │
│   API routes (server-only):                              │
│   /api/auth/callback    → Spotify OAuth callback         │
│   /api/spotify/*        → proxied Spotify calls          │
│   /api/llm/propose      → propose categories             │
│   /api/llm/classify     → classify tracks                │
│   /api/llm/reclassify   → surgical re-class for new cats │
│   /api/cache/*          → read/write local cache         │
│                                                          │
│   File system:                                           │
│   ./data/cache.json     → tracks, assignments, history  │
│   ./data/logs/llm-*.jsonl → append-only LLM call logs   │
│   ./.env.local          → Client ID, Anthropic key      │
│   ./.impeccable.md      → design DNA (canonical)         │
└─────────────────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Spotify API   Anthropic API   localhost:3000
                                  in your browser
```

### 2.3 Architectural rules

- **Server-side only LLM calls.** Anthropic API key never touches the browser. UI calls `/api/llm/*`, the server route holds the key.
- **Server-side Spotify token storage.** Access + refresh tokens persisted in `./data/cache.json`, never in browser storage. Browser holds only a session cookie.
- **PKCE OAuth (no client secret).** Public-client model — only the Spotify Client ID is needed; PKCE proves possession.
- **Two-phase LLM pipeline.**
  - Phase 1 (`propose`): one call, clusters the library and invents category names.
  - Phase 2 (`classify`): batched (50 tracks/batch), **3 concurrent** with prompt caching on the system prompt. On 429s, concurrency degrades (3 → 2 → 1) and recovers to 3 after a clean window.
- **Confidence threshold is client-side only.** Scores are cached; slider re-filters in-browser without re-calling LLM.
- **Idempotent apply.** Created Spotify playlist IDs are persisted; re-runs use IDs (not names) to find playlists.

---

## 3. Data Flow & Key Algorithms

### 3.1 LLM prompt strategy

**Phase 1 — Propose** (literally one Anthropic call; 2k tracks at ~30 tokens each = ~60k input tokens, fits comfortably in Haiku 4.5's 200k context window):

System prompt instructs Haiku to invent 25-35 _vibey, specific sub-genre/mood_ category names tuned to the actual tracks observed in the user's library. Returns:

```json
{
  "categories": [
    {
      "name": "Aesthetic Rap",
      "description": "Cloud-rap and dreamy production; introspective, often nocturnal.",
      "example_track_ids": ["3xY...", "1aB...", "7zQ..."]
    }
  ]
}
```

**Phase 2 — Classify** (batched, 50 tracks/batch, ~40 batches for 2k tracks, 3 concurrent):

System prompt holds the final user-edited category list with descriptions (marked `cache_control: ephemeral` for Anthropic prompt caching). Per-batch input is just track data:

```json
{
  "tracks": [
    {
      "track_id": "3xY...",
      "matches": [
        { "category": "Aesthetic Rap", "score": 87 },
        { "category": "Sad Slow", "score": 62 },
        { "category": "Late-Night R&B", "score": 41 },
        { "category": "Chill Hip-Hop", "score": 35 },
        { "category": "Indie Chill", "score": 28 }
      ],
      "reasoning": "Dreamy synth-driven trap with introspective lyrics."
    }
  ]
}
```

Always top-5 matches per track, sorted descending. Single `reasoning` field per track (powers the "why this is here?" hover; ~15 tokens).

**Prompt caching realism:** Cached system prompt (~3k tokens) saves ~5-10% of total run cost. Most of the cost is per-batch input + output that isn't cacheable.

**Phase 2b — Surgical re-classify** (only on category list changes):

When the user adds a new category on a re-run, the tool issues a focused LLM call: _"does each existing track fit `<new category>` (0-100)?"_ against the full track library, in batches. Existing assignments to _other_ categories remain untouched. Manual overrides preserved.

### 3.2 Confidence slider (client-side)

Every track has 5 cached scored matches. The slider is a pure array filter:

- `track is in playlist X if scores[X] >= threshold`
- Filter runs on ~2k tracks in single-digit milliseconds.
- Force-fit: if zero matches ≥ threshold, the single highest match wins (per design decision — no Uncategorized playlist).

### 3.3 Manual track override

Drag a track chip from `Aesthetic Rap` to `Sad Slow` on the classify screen. The cache records:

```json
"<track_id>": {
  "override": { "category_id": "...", "set_at": "2026-05-13T..." }
}
```

Slider and re-runs respect overrides. Once manually placed, a track is never re-classified.

### 3.4 Cache schema (`data/cache.json`)

```jsonc
{
  "version": 1,
  "auth": {
    "refresh_token": "...",
    "expires_at": "..."
  },
  "config": {
    "prefix": "✨",
    "confidence_threshold": 65,
    "anthropic_model": "claude-haiku-4-5-20251001"
  },
  "scope": {
    "included_playlist_ids": [...],
    "excluded_playlist_ids": [...],
    "include_liked_songs": true
  },
  "artists": {
    "<artist_id>": { "name": "...", "genres": ["..."] }
  },
  "tracks": {
    "<track_id>": {
      "artist_id": "...",
      "title": "...",
      "first_seen": "2026-05-13T..."
    }
  },
  "categories": {
    "<category_id>": {
      "name": "Aesthetic Rap",
      "description": "...",
      "spotify_playlist_id": "...",   // null until first apply
      "created_at": "..."
    }
  },
  "assignments": {
    "<track_id>": {
      "matches": [
        { "category_id": "...", "score": 87 }
      ],
      "reasoning": "Dreamy synth-driven trap with introspective lyrics.",
      "classified_at": "2026-05-13T...",
      "override": null
    }
  },
  "runs": [
    {
      "run_id": "...",
      "started_at": "...",
      "completed_at": "...",
      "tracks_classified": 47,
      "tracks_total": 2034,
      "cost_usd": 1.23,
      "summary": "..."
    }
  ]
}
```

### 3.5 Incremental re-run flow

1. Read `cache.json`. Validate `version` (handle bump if mismatch).
2. Refresh Spotify token if expired.
3. Fetch current state of in-scope playlists + Liked Songs.
4. **Diff**:
   - New tracks = current scope − cached tracks
   - Removed tracks = cached tracks − current scope (warn-only; do NOT remove from `✨` playlists)
5. Fetch artist info for any new artists.
6. Run Phase 2 classification on new tracks only.
7. If category list changed (new categories added on review screen): run Phase 2b surgical re-classify.
8. Show diff view. User confirms → Apply step.
9. Apply step appends to existing `✨` playlists (matched by stored ID), skipping any tracks already present.

### 3.6 Apply step

For each category:

- If `category.spotify_playlist_id` exists in cache → fetch via API, append new tracks (batches of 100 per Spotify limit), skip tracks already in the playlist.
- If null → call `POST /users/{user_id}/playlists` with `name: "<prefix> <category.name>"`, `public: false`, store returned ID in cache.
- **First-run duplicate check:** Before creating, search the user's playlists for any existing playlist with exact name match. If found (e.g., from a previously interrupted run), capture its ID and append rather than creating a duplicate.
- All writes throttled to ~3 requests/second (defensive — Spotify's actual rate limit is undocumented but anecdotally ~180/min).
- Wrap each operation in retry-on-429 with `Retry-After` honoring.

---

## 4. Error Handling

### 4.1 Auth / OAuth

- **Access token expired (every ~1hr):** Auto-refresh via stored refresh token on 401, retry the failed call once.
- **Refresh token revoked/expired:** UI surfaces a non-scary "Please reconnect Spotify" card with one button. Cache `refresh_token` cleared.
- **Insufficient scope (user denied):** Show _which_ scope is missing + "Re-authorize with full access" button.
- **Redirect URI misconfigured:** Setup wizard tests OAuth end-to-end before completing. Fails fast with the exact `http://127.0.0.1:3000/auth/callback` string to paste into Spotify dashboard.

### 4.2 Rate limiting

- **Spotify 429:** Honor `Retry-After`, exponential backoff up to 60s, max 5 retries.
- **Anthropic 429:** Same approach. Concurrency auto-reduces from the default (3 → 2 → 1) on repeated 429s; ramps back up after a clean window of 30 seconds.

### 4.3 LLM failures

- **Malformed JSON:** Zod validation fails → retry once with `temperature: 0.0` and a "respond with valid JSON only" reminder. If still fails → surface the offending batch's track list to the user with options to skip or retry manually.
- **Timeout (>60s batch):** AbortController cancel, retry once with smaller batch (50 → 25).
- **Empty `matches` array:** Force-fit logic kicks in (highest scored match wins).

### 4.4 Spotify data weirdness

- **Tracks missing an artist (orphaned, podcast episodes, deleted tracks):** Skip silently. Log to `cache.runs[].skipped`.
- **Local files (`spotify:local:...`):** Skip (no track ID; can't be added to playlists via API).
- **Region-blocked tracks:** Still classify (we have metadata), warn before apply.
- **Track linking:** When Spotify exposes a `linked_from` field (remastered/regional variant), dedupe to the linked-from ID.

### 4.5 Mid-run interruption / crash

- **Cache file written atomically** (temp + rename). Process crash mid-write cannot corrupt the cache.
- **Apply step checkpointed:** After each playlist is created and its tracks added, that's persisted to cache. Process death on playlist 17 of 30 → restart resumes from 17.
- **User cancels mid-classification:** AbortController kills in-flight LLM calls. Partial results persist. "Resume" button appears next time.

### 4.6 Edge cases

- **Empty library (0 tracks in scope):** Show friendly empty state with copy along the lines of _"Add some music to your library, then come back."_ Block the Classify button.
- **Cache version mismatch:** If `cache.version !== EXPECTED_VERSION`, show a "Cache file from an older version — back up `./data/cache.json` and start fresh?" dialog rather than crashing.
- **Anthropic API key invalid:** Setup wizard catches at the validation step. If invalidated later, classify route returns a clear "API key rejected" error.
- **User has zero owned playlists, only Liked Songs:** Valid case; scope screen still works.

### 4.7 User-facing error display

Every error has:

- A human-readable summary line ("Spotify rate limit hit")
- A "Show details" disclosure with the raw error (for debugging)
- Either a recovery action ("Retry") or a clear next step ("Reconnect Spotify")

No raw stack traces. No "Error: undefined." No silent failures.

### 4.8 Logging

Append-only `./data/logs/llm-<YYYY-MM-DD>.jsonl` — one line per LLM call with: timestamp, model, prompt token count, completion token count, latency, cost in USD, batch size, retry count. Used for debugging weird classifications later. Trivially small (~50KB/run).

---

## 5. Testing Strategy

Aligned with the global CLAUDE.md TDD standards (80%+ coverage, behavior-driven, no 1:1 file mirroring).

### 5.1 Unit tests (Vitest)

Pure logic, no I/O. Behavior-focused (test through public API, not internals).

- LLM response parsing: recorded propose/classify outputs including malformed JSON, missing fields → correct Zod validation + recovery
- Threshold filtering: given 5 scored matches + threshold → correct membership list
- Force-fit logic: zero matches ≥ threshold → highest match wins
- Surgical re-class detection: given old + new category lists → correct delta of categories needing backfill
- Cache schema: validates legit cache files, rejects malformed, round-trips losslessly
- Diff computation: previous + current track sets → correct new/removed/unchanged
- Playlist name prefix logic: format + parse round-trip with edge cases (no prefix, custom prefix, unicode)
- Track dedup including Spotify `linked_from` resolution

### 5.2 Integration tests (Vitest + MSW)

- Spotify pagination across 1k+ tracks at 50/page
- Spotify token refresh on 401 → automatic retry → success
- LLM batch malformed-JSON → retry → success
- LLM batch 429 → `Retry-After` honored → success
- Cache atomic write under simulated mid-write crash
- Idempotent apply: run twice consecutively, second is no-op
- Surgical re-class: add new category, only that category gets a backfill pass

### 5.3 E2E tests (Playwright, mocked Spotify + Anthropic)

- Happy path: connect → scope → scan → review (edit, merge, add custom) → classify → slider → manual drag override → apply → success
- OAuth scope-denial recovery
- Mid-classification cancel + resume

### 5.4 Manual smoke test (real APIs)

Page at `/docs/manual-test-checklist.md`. Run against a disposable Spotify account before any release-equivalent moment. Not in CI (real API costs + rate limits).

### 5.5 Coverage targets

- 80%+ overall (global standard)
- 100% on critical paths: cache atomicity, threshold filtering, surgical re-class, OAuth state handling, manual override persistence

### 5.6 Deliberately not tested

- LLM output quality (no deterministic test for "is this a good category name")
- React component rendering snapshots (test behavior via E2E)
- Anthropic / Spotify SDK internals (trust upstream)

---

## 6. Design Direction

**Canonical reference:** [`/.impeccable.md`](../../../.impeccable.md). Anything below is a summary of design decisions that affect the spec.

### 6.1 Direction

_Tactile, nocturnal, unhurried — a private record-listening room at 1am._ Warm-toned dark mode (coffee-brown base, brass-amber accent reserved for the 10%), magazine-feel typography, deliberate motion with weight. Explicitly NOT Spotify-clone green-on-black, NOT generic SaaS dark mode, NOT futuristic.

### 6.2 Typography

- **Display:** Editorial New (Pangram Pangram, free)
- **Body:** PP Neue Montreal (Pangram Pangram, free)
- **Mono:** Geist Mono (Vercel, free)

None appear in `impeccable`'s reflex-reject list. Pairing chosen for "magazine in your hand" feel.

### 6.3 Color palette

OKLCH-based, neutrals tinted toward brand hue (~h=55, deep amber/brown):

| Token              | OKLCH                  | Purpose                            |
| ------------------ | ---------------------- | ---------------------------------- |
| `--bg-base`        | `oklch(0.16 0.012 55)` | Page background, deep coffee-brown |
| `--bg-surface`     | `oklch(0.20 0.014 55)` | Cards, panels                      |
| `--bg-elevated`    | `oklch(0.24 0.016 55)` | Modals, popovers                   |
| `--border-default` | `oklch(0.30 0.018 55)` | Subtle dividers                    |
| `--text-primary`   | `oklch(0.95 0.014 70)` | Warm cream                         |
| `--text-secondary` | `oklch(0.72 0.020 65)` | Muted amber                        |
| `--text-tertiary`  | `oklch(0.52 0.025 60)` |                                    |
| `--accent`         | `oklch(0.74 0.14 55)`  | Brass/amber (the 10%)              |
| `--success`        | `oklch(0.66 0.12 145)` | Muted moss — NOT Spotify green     |
| `--danger`         | `oklch(0.62 0.20 25)`  | Rust                               |
| `--warning`        | `oklch(0.75 0.13 80)`  | Gold                               |

### 6.4 Motion

Framer Motion as canonical library. No CSS keyframe animations beyond `<300ms` micro-transitions.

- **Default spring:** `{ stiffness: 200, damping: 30, mass: 0.8 }`
- **Page transitions:** cubic-bezier `[0.16, 1, 0.3, 1]` (exponential ease-out), 600ms
- **Staggered list reveal:** `staggerChildren: 0.04, delayChildren: 0.1`
- **Drag interactions** have weight — slight delay following cursor
- **`useReducedMotion()` respected everywhere.** Reduced motion = instant transitions, no springs.
- **Banned:** bounce/elastic easing, endlessly-pulsing loaders, neon glow effects.

### 6.5 Component aesthetic

- **Buttons:** text-driven, not box-driven. Primary = bold text with animated brass underline. No rounded-rectangle pills.
- **Inputs:** wide, generous padding, single bottom border (not boxed). Focus = brass underline.
- **Cards:** subtle 1px border (brand-hue tinted), NO rounded shadows. Hover reveals quiet border-brightness change, NOT a glow.
- **Track lists:** index-numbered like an LP track listing (`01.` `Mac Miller` _Self Care_ — with "why" tooltip on hover). Generous gap. Track lists ARE the product visually.
- **Iconography:** thin-stroke (1.25px) Lucide icons OR custom minimal SVG. Never icons-in-rounded-backgrounds above headings.

### 6.6 Skills used during build

In approximate phase order:

1. `impeccable` (craft mode) for each new screen
2. `ui-ux-pro-max` for palette/font/component intelligence
3. `animate` after baseline screens are built
4. `polish` for final alignment/spacing/type pass
5. `critique` for evaluation before declaring any screen done
6. `typeset`, `layout`, `delight` as targeted fixes

### 6.7 Two anchor design moments

1. **Track list display.** Not a table. Index-numbered, magazine-set, with the LLM "why" appearing on hover. This is the product visually.
2. **Apply success screen.** The one place we let the design be loud. Newly-created playlists displayed with weight, type, reverence — like the credits at the end of a record. This is the emotional payoff.

### 6.8 Absolute bans (per `impeccable`)

- Side-stripe accent borders (`border-left/right > 1px`) on cards/list items
- Gradient text (`background-clip: text` + gradient)
- Glassmorphism, glow effects, sparklines as decoration
- Pure black (`#000`) or pure white (`#fff`) — always tinted
- All fonts in `impeccable`'s reflex-reject list (Inter, DM Sans, Plus Jakarta, Space Grotesk, IBM Plex, Cormorant, Playfair, Fraunces, Crimson, Outfit, Instrument, etc.)

---

## 7. Decisions Log

Every meaningful decision made during brainstorming, with rationale.

| #   | Decision                                                                                | Rationale                                                                                                     |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Library organizer (sort existing playlists into new themed ones)                        | Direct user requirement                                                                                       |
| 2   | Hybrid category selection (tool proposes, user edits)                                   | Captures personal taste while surfacing unknown clusters                                                      |
| 3   | Local Next.js app + tiny localhost web UI                                               | User prefers point/click; single-user; no hosting concerns                                                    |
| 4   | Single user (not multi-tenant)                                                          | Personal tool — sharing is out of scope                                                                       |
| 5   | LLM (Claude Haiku 4.5) + Spotify artist genres as grounding                             | Spotify killed audio-features Nov 2024; LLM handles sub-genre nuance well; artist genres reduce hallucination |
| 6   | Official Spotify API only + manual folder drag                                          | Spotify Web API has no folder endpoints; unofficial endpoints are fragile + ToS-gray                          |
| 7   | Multi-tag unlimited per track (top-5 actual matches surfaced)                           | User wants permissive matching; doesn't mind cross-listing                                                    |
| 8   | Force-fit nearest match (no Uncategorized playlist)                                     | User explicit preference                                                                                      |
| 9   | Incremental re-runs (only new tracks hit LLM)                                           | Cheap; idempotent; respects manual edits                                                                      |
| 10  | Scope checkbox UI (opt-out specific playlists)                                          | Better UX than all-or-nothing                                                                                 |
| 11  | Flexible target category count (~25-35)                                                 | User-edited anyway; let tool flex based on natural clusters                                                   |
| 12  | "Why this song?" hover with LLM reasoning                                               | Trust + transparency                                                                                          |
| 13  | Cost preview before LLM calls                                                           | Trust + no surprise charges                                                                                   |
| 14  | Diff view on re-runs                                                                    | Builds trust; reads like `git diff`                                                                           |
| 15  | ID-based playlist matching (not name)                                                   | Survives user renames                                                                                         |
| 16  | Token refresh persistence                                                               | Avoid re-OAuth every session                                                                                  |
| 17  | In-browser setup wizard                                                                 | Removes worst friction point (.env editing)                                                                   |
| 18  | All created playlists private                                                           | Least-privilege; user can flip individually                                                                   |
| 19  | Samples + expand for full track lists                                                   | Balances scannability with thoroughness                                                                       |
| 20  | Liked Songs read-only                                                                   | Never modify user's curated archive                                                                           |
| 21  | Manual track override (drag-drop)                                                       | User explicit ask                                                                                             |
| 22  | Warn-only on removed tracks                                                             | Less destructive default                                                                                      |
| 23  | Surgical re-class on category list changes                                              | Captures new-category fits without scrambling existing assignments                                            |
| 24  | OAuth scopes: 5 specific scopes (no `playlist-modify-public`)                           | Minimum required; default-private playlists                                                                   |
| 25  | Concurrent LLM batches (3 concurrent, degrade on 429)                                   | Drops classify from 3min serial to ~30-60s; simpler than dynamic ramp-up                                      |
| 26  | First-run duplicate check by playlist name                                              | Resilient to interrupted earlier runs                                                                         |
| 27  | `.gitignore` `data/` and `.env.local`                                                   | Tokens + classification state are local-only                                                                  |
| 28  | Anthropic key validation at setup                                                       | Fail fast                                                                                                     |
| 29  | Track click → opens in Spotify desktop via URI                                          | Lightweight; no embed iframes                                                                                 |
| 30  | Apply confirmation modal                                                                | Final off-ramp before writes                                                                                  |
| 31  | Local LLM call logs (`./data/logs/llm-*.jsonl`)                                         | Debug weird classifications later                                                                             |
| 32  | Design direction: tactile/nocturnal/unhurried                                           | User selected E + dark + 3-word vibe                                                                          |
| 33  | Fonts: Editorial New + PP Neue Montreal + Geist Mono                                    | Distinctive, free, none in reflex-reject list                                                                 |
| 34  | Framer Motion as canonical motion library                                               | User explicit ask                                                                                             |
| 35  | `impeccable`, `ui-ux-pro-max`, `animate`, `polish`, `critique` skills used during build | User explicit ask                                                                                             |
| 36  | Cache as JSON file (not SQLite)                                                         | Adequate at 2k tracks; simpler                                                                                |
| 37  | shadcn/ui as unstyled primitive base only                                               | Get accessibility + composition without inheriting AI-default look                                            |

---

## 8. Out of Scope (Explicit YAGNI)

These were considered and deliberately not included in v1:

- BPM / tempo / key / energy-based playlists (Spotify audio-features deprecated; would need third-party API)
- Decade splits / chronological filters
- Reordering tracks within new playlists (by tempo, popularity, etc.)
- Re-ordering existing playlists
- Removing tracks from source playlists or Liked Songs
- Multi-account / multi-user support
- Hosted/deployed version (anyone-can-use)
- Mobile / responsive layouts (this is a desktop tool)
- Internationalization
- Desktop binary (Electron/Tauri wrapper)
- Backup/export to JSON or CSV
- Spotify Web Embed inline previews (track click → opens in desktop client instead)
- "Public" playlists / shareable links
- Unofficial Spotify API folder operations
- Auto-removing tracks deleted from source (warn-only instead)

---

## 9. Open Risks

- **Spotify Web API changes.** The audio-features deprecation in Nov 2024 was unsignaled. Future deprecations could affect playlist or library endpoints. Mitigation: integration tests against MSW + manual smoke test against real API before each release-equivalent moment.
- **LLM classification quality on obscure artists.** Haiku's music knowledge has gaps. Mitigation: cost preview + review screen + manual override before apply.
- **OAuth user-experience on first run.** Most-common failure mode in any third-party Spotify app. Mitigation: setup wizard tests OAuth end-to-end before completing.
- **Prompt-cache TTL (5 min).** If a run pauses for any reason between batches, cache fills again. Mitigation: caching savings are modest anyway (~5-10%); not a critical path.

---

## 10. Implementation Phase Plan (forward reference)

Once this spec is approved, the next document — created via the `superpowers:writing-plans` skill — will break implementation into TDD-sized tasks (2-5 minute units, each: write test → run (fail) → implement → run (pass) → commit). Suggested high-level phases:

1. **Scaffold + setup wizard** (Next.js init, Tailwind+shadcn, design tokens from `.impeccable.md`, wizard pages)
2. **Spotify OAuth + token refresh + scope screen**
3. **Library scan + dedupe + artist genre fetch**
4. **LLM propose pipeline + review screen + drag-merge**
5. **LLM classify pipeline + confidence slider + manual override**
6. **Apply flow + idempotent updates + checkpointing**
7. **Incremental re-runs + diff view + surgical re-class**
8. **Polish pass — `animate`, `polish`, `critique` invoked across all screens**

Details, dependencies, and per-task tests get written in the implementation plan.

---

_End of spec. Status: ready for implementation planning._
