# Record Shop redesign — build spec

Branch `feat/redesign` (off `feat/ui-pass` @ `4d66f3d`). This spec is the contract every builder
codes against. **Precedence:** this file → `docs/design/record-shop/brief.md` (the design DNA) →
the mockups → your own judgement. Where this file contradicts the brief, this file wins.

## 1. The owner's decisions (2026-09-23, verbatim picks)

| Question                                         | Answer                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Which direction?                                 | **Daylight Record Shop** (paper by day, navy evening stock when the OS is dark) |
| Graphics                                         | cover art per playlist, library visuals, motion set pieces, **real album art**  |
| /label                                           | **Full redesign** (in the brief's quiet form, see §4.9)                         |
| Top artists ("Mostly") during the blind study    | **Hide it until the study ends**                                                |
| Site nav on home + Classify in a pinned top bar  | **Yes, move both**                                                              |
| Mood colours (temperature guessed from keywords) | **Guess it, and let me fix it**                                                 |
| Apply covers                                     | **Upload them as real covers**                                                  |
| Categories: open rows                            | **One at a time, side panel** (desktop), inline on ≤900px                       |
| Top bar on every page with a main action         | **Yes, every page**                                                             |

## 2. References

- Design DNA: `docs/design/record-shop/brief.md` (palette, type, layout, graphics §4, motion §4.4,
  components §5, action-parity checklist §6).
- Sleeve algorithm reference: `docs/design/record-shop/covers.py` (port line-for-line to TS).
- Mockups (session scratchpad, may vanish later):
  `/private/tmp/claude-501/-Users-possible-Documents-SpotifySorter/23a0c4eb-2458-4882-b809-39b1e933d53d/scratchpad/redesign/record-shop/`
  — `home.html`, `review.html`, `shots/*.png` (day + `*-night-*`), `_work/` (generators, detail shots).
- The previous IA spec still governs behaviour it doesn't override:
  `docs/superpowers/specs/2026-09-23-ui-pass-design.md` (nav gating, NavLock, ClassifyGate, states).

## 3. Where this spec overrides the brief

1. **Site nav shows on `/`.** `SiteNav`'s `HIDDEN` drops `"/"` (keeps `/setup`, `/label`). The home's
   routes list drops Categories and Labels (now in the nav) and keeps **Check for new tracks** and
   **Reconnect Spotify**.
2. **The action bar moves to the top, on every page that has one.** The current bottom `ActionBar`
   becomes a pinned strip directly under the site nav (sticky, `top: 0` once the masthead scrolls
   away is fine; it must never cover content or the last row). Status line left, the page's one
   primary right, one row at every width. Pages: review (Classify), scope (Scan), classify/Fit
   (ruler + Apply to Spotify), and any other current `ActionBar` user. Remove bottom spacers.
   Keep the component's role/aria (status is `aria-live="polite"`).
3. **Temperature = guess + owner override.**
   - `TEMPERATURES = ["dusk", "charge", "glow", "haze"] as const` in one module, type derived.
   - `CategorySchema` gains `temperature: z.enum(TEMPERATURES).optional()` (optional → no cache
     version bump; `writeCache`'s zod parse would otherwise strip it). The PATCH path must accept
     and persist it; renames never clear it.
   - Effective temperature = `category.temperature ?? guessTemperature(name, description, seed)`.
   - The review sheet gets a **Colour** picker: a radio group of four tab-shaped swatches with
     visible names (dusk · charge · glow · haze), plus "Auto (guess)" to clear the override.
     Changing it reprints the sleeve's ink A immediately and counts as an unsaved edit like any
     other field.
4. **Real Spotify covers on Apply.**
   - Add `ugc-image-upload` to `SPOTIFY_SCOPES`. Existing tokens lack it → cover uploads 401/403
     until the owner reconnects once.
   - After a playlist is written (the apply stream's "category" event for i+1 / "done", see brief
     §4.4 C), the browser renders that category's sleeve (the same SVG) to a 640×640 canvas, exports
     JPEG, stepping quality down until the base64 payload is ≤ 256 KB, and POSTs
     `{ categoryId, jpegBase64 }` to a new same-origin route. The route (guarded like the other
     write routes: `rejectUnlessFromApp`) resolves the playlist id from the cache and calls
     `PUT https://api.spotify.com/v1/playlists/{id}/images` (`Content-Type: image/jpeg`, body =
     base64). Uploads are sequential with the existing retry/backoff helper.
   - Credits: a sleeve prints **in register** only when its cover upload succeeded. Missing scope →
     sleeves stay out of register and one line reads "Reconnect Spotify to add covers" with
     Reconnect. Any other cover failure → "N covers didn't upload" + Retry covers. **A cover failure
     never fails the Apply** — tracks are the product.
   - Idempotent: every Apply re-uploads covers for the playlists it wrote (renames reprint sleeves).
   - **Never executed live.** The Apply write itself has never run live; say so in reports.
5. **One open category at a time on desktop** (the pulled side sheet); inline editor at ≤900px.
6. **"Mostly" (top artists) is hidden while the labelling study is open.** Add
   `isLabelStudyOpen()` in `src/lib/labeling/` (true while any queued label item — tracks, pairs,
   relabel — is not done; true if unsure). The sheet renders "Mostly" only when it returns false.
7. **Album art data path (replaces brief §4.3's schema/Web-API plan).**
   - A separate store `data/artwork.json` (`{ version: 1, tracks: { [id]: { url: string | null,
fetched_at } } }`), its own zod schema and read/write module with an in-process write queue
     and atomic write (tmp + rename). **`data/cache.json` is never touched for art.**
   - `GET /api/art/[trackId]`: validate `^[A-Za-z0-9]{22}$` (else 400). Store hit with url → 302 to
     it. Miss → fetch `https://open.spotify.com/oembed?url=https://open.spotify.com/track/<id>`
     (no auth; at most 4 in flight process-wide; 8s timeout), take `thumbnail_url`, **accept it only
     if its host ends with `.spotifycdn.com` or is `i.scdn.co`** (open-redirect guard), persist, 302. No art → persist `url: null` (retry after 24h) and return 404 so the `<img>` falls back
     to the plain sleeve. `Cache-Control: private, max-age=86400` on redirects.
   - Why oEmbed: verified live 2026-09-23 (113/115 thumbnails fetched); needs no token, so it can't
     trigger `ensureFreshToken`'s cache re-save.
   - `AlbumArt` component: square, 1px ink keyline, `loading="lazy"`, `src="/api/art/<id>"`, on
     error swaps to `PlainSleeve`. Tests must never hit the network (tests/setup.ts blocks it).
8. **Blind-labelling filter** for every per-song list this redesign ADDS (home crate records, diff
   arrivals): drop any track id in `data/labels/sample.json` (`random_track_ids`,
   `relabel_track_ids`, `pairs[].track_id`). Server-side helper, read-only. Existing lists keep
   today's behaviour. **No per-song score, rank or bin is ever rendered anywhere new.**

## 4. Grafted fixes (from the judge)

1. Home entrance (crate settle + sleeve pull) plays **once per browser session**
   (`sessionStorage`, wrapped in try/catch; absent storage = play once per mount).
2. **CJK fallback** in every stack: `…, "Hiragino Sans", "PingFang SC", "Noto Sans CJK JP",
"Noto Sans CJK SC", sans-serif` (Caprasimo/Libre Franklin can't draw うっせぇわ or 古风).
3. **Scan total drift** (CONFIRMED `src/lib/pipeline/scan.ts:33-37` counts Liked Songs, `:57`/`:68`
   don't): the scan UI must not lose a record mid-run — use the max total seen, or fix the event so
   every playlists event carries the same total (add a unit test either way).
4. **Classify set piece is batch-driven.** The stream only sends `{stage:"batch", done, total}`
   (`app/api/llm/classify/route.ts`); the cache is saved after each batch before progress is sent
   (CONFIRMED `src/lib/pipeline/classify.ts:152-168`). So after each batch event, refresh the 41
   per-category counts from a **read-only** source (extend `readAppStatus()` / `/api/status` with
   per-category counts via `readCache` only — never `withSpotify`/`ensureFreshToken`). Tabs bump and
   counts tick per batch. Never name a song during the run.
5. Merge target's count prints in ink-3 (stale) until Classify; idle status line teaches
   drag-to-merge (brief §3 States, §3 Review).

## 5. Invariants carried from the last pass (breaking any of these is a bug)

- `PageTransition` never gets `AnimatePresence` or exit animations (it double-mounted pages and ran
  the scan twice).
- `readAppStatus()` uses `readCache` only.
- Every "Sort N tracks" goes through `ClassifyGate` (CostPreviewModal / the price tag) first.
- e2e selectors that must keep working (`tests/e2e/happy-path.spec.ts`): buttons named exactly
  "Apply to Spotify", "Apply", "Classify", "Proceed", "Scan"; headings matching
  `/categories\. Edit anything/` and `/What should I read/i`; text "2 tracks placed.".
- `tests/e2e/label.spec.ts` fails on purpose. Never run it, never "fix" it.
- Tests never touch `data/` (tests/setup.ts gives a temp `SORTER_DATA_DIR`).
- Never hand-write `data/cache.json`, never edit `scripts/label-sample.ts`, `labels.jsonl` is
  append-only.
- Irreversible actions keep their confirmations: Apply, Re-propose → Wipe, /label saves,
  Classify → Proceed after Delete/Merge.
- NavLock on every async operation; dialogs through `design/Dialog` (focus trap, Escape, return
  focus); `MotionConfig reducedMotion="user"` at the root; every set piece has a reduced version.
- impeccable bans: no side-stripe borders > 1px, no gradient text, no glassmorphism, no bounce.

## 6. Build plan and file ownership

**Phase 1 — foundation (three agents in parallel, disjoint files):**

| Agent       | Owns                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 system   | `app/globals.css`, `app/layout.tsx` (fonts via `next/font/google`: Caprasimo 400, Libre Franklin variable, subsets latin + latin-ext; Geist Mono stays), `src/components/design/*` (Button primary/quiet/danger/icon, Input, Dialog → price tag, Card, TrackRow liner notes, SiteNav incl. home + record mark, ActionBar → top strip, PageShell, NavLock untouched in behaviour), motion tokens module, `next.config.ts` if needed |
| F2 graphics | `src/lib/sleeves/*` (fnv1a32, mulberry32, temperatures + lexicon + `guessTemperature`, `catalogueSpecs`, SVG geometry), `src/components/graphics/*` (`Sleeve`, `PlainSleeve`, `Tab`, `AlbumArt`, crate geometry + `Crate` primitives shared by home and classify, `sleeveToJpeg` canvas export)                                                                                                                                    |
| F3 data     | `src/lib/cache/schema.ts` (+ patch path) for `temperature`; `src/lib/artwork/*` + `app/api/art/[trackId]/route.ts`; `src/lib/labeling/blind.ts` + `isLabelStudyOpen`; `src/lib/spotify/scopes.ts` + `src/lib/spotify/cover.ts` + the cover route; `src/lib/status.ts` per-category counts; `src/lib/pipeline/scan.ts` total fix                                                                                                    |

Foundation agents write unit tests first for every lib (TDD). F1 keeps every existing
`src/components/design` test green (update only tests that pinned old visuals, never behaviour).

**Phase 2 — pages (nine agents in parallel, each build → adversarial review → fix):** home, setup,
scope, scan, diff, review, classify, apply, label. Each owns `app/<page>/**` and
`src/components/<page>/**` and their tests. **Page agents never edit foundation files**; they list
what they need under "Foundation requests" in their report. Run only your page's tests
(`pnpm vitest run <paths>`), plus `npx tsc --noEmit`.

**Phase 3 — integration:** apply foundation requests, cross-page consistency critic → fixes,
`.impeccable.md` rewritten to the Record Shop DNA, `docs/manual-test-walkthrough.md` updated.

**Phase 4 — verification (orchestrator):** full `pnpm test`, `npx tsc --noEmit`, `npx eslint .`
(0 errors), `npx next build`, e2e happy path, screenshot sweep of every page at 1440/390 in both
stocks through the read-only harness (externals faked), then commits per unit and push.

## 7. Amendments after the foundation review (2026-09-23)

1. **Covers upload only after Apply's `done` event, one at a time.** Apply's pipeline holds a cache
   snapshot for the whole run; a token refresh during the run (which re-saves `cache.json`) can be
   overwritten by Apply's later writes, or overwrite Apply's new playlist ids (CONFIRMED by the F3
   reviewer's probe with stubbed fetch, `docs/design/record-shop/foundation-data.md` "Known
   hazard"). So the credits print each sleeve (drum A) as its playlist is written, and each sleeve's
   registration locks in as its cover upload succeeds after `done`. The underlying refresh-vs-Apply
   race predates this redesign; fixing it in `src/lib/spotify/client.ts` / `src/lib/pipeline/apply.ts`
   is proposed to the owner separately, not done here.
2. Cover route errors: `403 {error:"missing_scope"}` and `401 {error:"reconnect"}` both mean "show
   Reconnect, no Retry"; `413 too_large`, `404` (no playlist id yet) and 5xx mean "N covers didn't
   upload" + Retry covers.
3. **Review page:** `useCategorySource.ts` `categoriesFrom()` must copy `temperature` (today a save
   would clear the owner's colour), `src/lib/categories/edits.ts` must count a colour change as an
   edit, and `/review#<id>` must open that category's sheet (PressList links there).
4. **Top strip:** pages render their `ActionBar` from the first render (so the server prints the
   strip's placeholder and nothing jumps); page elements stay below z-30.
5. `<SleeveDefs />` is mounted once in `app/layout.tsx`; `@property --u` is registered in
   `app/globals.css`.
