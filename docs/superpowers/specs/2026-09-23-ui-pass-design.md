# UI pass — design spec (2026-09-23)

Owner's ask: "fix the UI so it looks better and has all the right buttons, add animations as needed."
Owner's choices: whole app · rework layouts within `.impeccable.md` · branch `feat/ui-pass`.
Input: an 11-agent read-only audit (9 pages + journey/nav + design system), screenshots at 1440 and 390.

`.impeccable.md` stays the brief. Nothing here changes palette, fonts or tone.

## What the audit found (the reasons for this pass)

1. **Returning users are stuck in a loop.** Home only offers OAuth → /scope → a real re-scan → /diff
   → "Your library is unchanged." → "← Back to start" → home. With an unchanged library there is no click
   path to /review, /classify or /apply. /label is linked from nowhere.
2. **Forward actions are buried.** Scan, Classify and Apply to Spotify sit at 2.6k / 10.6k / 11.3k px
   (1440) and 4.9k / 23.6k / 25.0k px (390).
3. **Several states strand or mislead.**
   - /classify spins forever after any stream error.
   - /scope shows "1 of 1 selected" when Spotify fails, then Scan would save an empty scope.
   - /review claims "Claude is proposing" while it is only loading.
   - The apply success screen has no buttons.
   - "Apply to Spotify" silently resets the prefix chosen in /setup to ✨.
4. **The primitives drift.**
   - Four copies of a modal, only one accessible.
   - The primary Button's hover underline never animates when you hover the label.
   - Focus shows the browser's blue ring.
   - 24 of 26 motion files ignore reduced motion.
   - Pages overflow horizontally at 390 (review, classify, setup, label).

## Global decisions

- **Site nav.** A text row: wordmark → `/`, steps Sources (/scope) · Categories (/review) · Fit (/classify) ·
  Apply (/apply), then Labels (/label).
  - It lives in `app/layout.tsx` as a sibling above `<PageTransition>`, never inside it.
  - It is hidden on `/`, `/setup` and `/label`.
  - Current step: cream text plus a 1px underline that moves between steps with `layoutId`. Available steps: secondary text. Locked steps: tertiary text in a `<span aria-disabled>`.
  - No icons, counts, checkmarks or brass.
- **Doors are never nav targets.** /scan is never linked from the nav.
  - Categories is a link only when categories > 0.
  - Fit and Apply are links only when categories > 0 AND unsorted === 0.
  - Everything is gated by a new read-only `GET /api/status`, refetched on every pathname change, and locked until it loads.
- **Nav lock.** While a page runs a job (scan, propose, classify, apply, bulk label), `useNavLock(true)` makes every
  nav item inert.
- **Any control that leads to paid classification goes through `CostPreviewModal`.** /diff and home use a shared
  `ClassifyGate` for this. /review keeps its own flow.
- **One accent action per view.** "Apply" means the Spotify write and nothing else.
- **Sticky bottom action bar** (`ActionBar`) on /scope, /review and /classify. The page's primary control MOVES
  there; it is not duplicated.
- **"Step one/two/three" eyebrows are deleted**, because the nav states position. So are eyebrows that paraphrase
  their title.

## Foundation (built first, by one owner)

- **globals.css**
  - Tokens: `--spacing-gutter` clamp(1rem, 5vw, 3rem), `--spacing-panel`, `--spacing-section`, `--text-display-1`, `--text-display-2`.
  - `html { color-scheme: dark }` and a global brass `:focus-visible`.
  - An `eyebrow` utility.
- **Motion**
  - `MotionConfig reducedMotion="user"` at the client root.
  - `useMotionConfig` adds `SPRING`, `EASE_OUT_EXPO`, `fade`, `item` and `itemDelay(i)` (stagger capped at index 12).
  - PageTransition runs 0.6s with the expo ease, is instant under reduced motion, and has no AnimatePresence, ever.
- **Button**
  - A CSS underline (rest 0.4 → 1 on group hover/focus-visible, 250ms expo).
  - Variants primary, ghost, danger; sizes md, sm; `type="button"` by default; `data-variant` kept.
  - Also exports `buttonClass()` and `ButtonLink`. The OAuth link stays a plain `<a>` using `buttonClass`.
- **Dialog**, one accessible frame:
  - role=dialog, aria-modal, labelled by its title, focus on the panel, Tab wraps, Escape and backdrop close, focus restored on close.
  - No blur.
  - CostPreviewModal, TrackSearchModal and PlaylistPreviewModal use it. ApplyConfirmationModal was later deleted, because /apply itself became the confirmation. CacheMismatchDialog (unused) is deleted.
- **Other primitives**
  - PageShell: gutter token, optional `back`, no header animation.
  - Card `interactive`. Input `error`. TrackRow (the liner-notes row).
  - ProgressBar: role=progressbar, scaleX.
  - ThinkingIndicator: no infinite loop.
- **Status and gating**
  - `GET /api/status` → `{ configured, connected, tracks, categories, unsorted, applied, version_mismatch }`. It uses `readCache` only, never `withSpotify` or `ensureFreshToken`.
  - `unsortedTrackIds(cache)` uses the same rule as `src/lib/pipeline/classify.ts` (tracks with no assignment).
- **SiteNav, NavLock, ActionBar, ClassifyGate.**

## Pages

Each page's detailed audit is the build input. Items marked _skip_ are reported to the owner, not built.

- **Home**
  - First run: one accurate sentence, and "Set up" or "Connect Spotify" as a plain `<a>`.
  - Returning user: a library summary and one primary, which depends on state:
    - unsorted > 0 → "Sort N tracks" (ClassifyGate)
    - nothing applied → "Apply to Spotify" (/apply)
    - otherwise → "Check for new tracks" (/scope)
  - Quiet links: Categories, Labels, Check for new tracks, Reconnect Spotify.
  - `?error=denied` shows one line.
  - A cache version mismatch shows one line.
  - ResumePrompt and ResumeBanner are deleted (dead code with misleading buttons).
- **Setup**
  - Back on steps 2–4. A `<form>`, so Enter submits.
  - Error lines for validate and save, both with try/finally.
  - `maxLength=8` on the prefix, and a Copy button for the redirect URI.
  - The false "change this later in Settings" is removed, and `router.replace("/")` replaces the push.
- **Scope**
  - A real error state (Try again / Reconnect) with no Scan button.
  - Saved `cache.scope` is restored.
  - Scan moves into the ActionBar with a saving state; it navigates only after an OK response.
  - Preview errors can be retried, and the preview gets an Include / Leave out toggle.
  - Filter: a clear control and bulk buttons scoped to the visible rows.
  - `whileTap` removed.
- **Scan**
  - `router.replace`, so Back is no longer a trap.
  - Error states: Scan again / Change scope / Reconnect.
  - The title changes on error.
  - If the cache fetch fails, fall back to /diff.
  - No Stop button (server abort unverified).
- **Diff**
  - Actions render as soon as `/api/cache` loads; the Spotify diff becomes a background footnote.
  - Unchanged, with unsorted === 0 → "Tune & apply" (/classify), "Edit categories" (/review), "Change sources" (/scope).
  - unsorted > 0 → "Sort N tracks" through ClassifyGate.
  - First-run redirect moves into an effect.
  - The "+N more" miscount is fixed.
- **Review**
  - Separate loading / proposing / loadError states.
  - Classify moves into the ActionBar. A failed save shows an error and re-enables the button.
  - Expanded rows get text actions Delete and "Merge into…", with one-slot Undo. The description is editable.
  - Empty and duplicate names are validated.
  - The cost modal names renames (they break /label) and new-category re-scoring.
  - A way back while proposing or on error.
- **Classify**
  - An error state with "Back to categories" and "Home".
  - Read the cache first and skip the stream when unsorted === 0, so no run row is written on a visit.
  - Drag id `chip:${categoryId}:${trackId}`.
  - "Apply to Spotify" PATCHes only `confidence_threshold`.
  - The slider and Apply live in one sticky bar. The slider is keyboard-operable.
  - Move / Undo line, drop-target highlight, "← Categories", a no-categories state, and a skipped count.
- **Apply**
  - Apply is disabled until the counts load.
  - Error, empty and connection-lost states; the error shows how far the run got.
  - The success screen ends with "Open Spotify" and "Home".
  - "Not yet" offers "Back to tuning". The success credits are the one loud moment.
- **Label**
  - Layout and navigation only: the 390 header wraps so the bulk confirm is reachable.
  - Buttons added: Reload, Try again, Home, "Continue to {mode}".
  - Aria-hidden open-item count on non-active tabs.
  - During a bulk run: Stop, with tabs locked.
  - A "Nothing ticked" / ticked-names line by Save.
  - The model's-guesses block is untouched.

## Not in this pass (reported to the owner)

- OAuth callback errors render raw JSON.
- `/api/spotify/diff` compares against a cache the scan already updated, so `added` is ~always 0. The UI works around this by counting unsorted tracks.
- "Add track" on /review edits examples the classifier never reads.
- The app's own ✨ playlists appear as scope sources after Apply.
- The /label "Accept suggestion(s)" wording.
- `/api/spotify/scan` has no same-origin or single-flight guard.
- Mapping key-validation status codes.
- A `beforeunload` guard on /review.

## Must not break

- The e2e happy path selects by these roles, names and text:
  - heading /What should I read/
  - button "Scan"
  - heading /categories\. Edit anything/
  - button "Classify"
  - button "Proceed"
  - button "Apply to Spotify"
  - button "Apply"
  - text "2 tracks placed."
  - each stream opens exactly once
- `tests/e2e/label.spec.ts` fails on purpose; leave it.
- Nothing may show per-song scores where they are not already shown.
- `/scan`, `/classify`, `/review` (with no categories) and `/apply`'s write must never start from a link or a render.
