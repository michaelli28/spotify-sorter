# Manual test walkthrough

Click-along guide to every page. Written against the live dev server and `data/cache.json` as of
**2026-09-22 22:32 EDT (2026-09-23 02:32 UTC)**.

Base URL: **`http://127.0.0.1:3000`**. Use the IP, not `localhost` — see [Origins](#origins-matter).

---

## Read this first

Three things in this app are irreversible. Everything else is safe to click.

| Action                             | Where     | What it does                                                                                                                      |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Apply** (in the modal)           | `/apply`  | Creates 41 real private playlists in your Spotify account and adds 12,194 track slots. Nothing in the app undoes this.            |
| **Re-propose → Wipe & re-propose** | `/review` | Deletes all 41 categories **and** all 3,172 assignments (the $1.68 + $0.17 you already paid), spends ~$0.14, and breaks `/label`. |
| **Save / Can't judge / Yes / No**  | `/label`  | Appends one permanent line to `data/labels/labels.jsonl`. Append-only — no edit, no delete.                                       |

**Classify does not cost money tonight.** A classify run finished at **02:29:30Z**, ~3 minutes before
this was written. All 3,172 tracks are classified; 0 remain. The `/review` cost modal now reads
**$0.00 — $0.00**, and opening `/classify` is a free no-op. It re-arms the moment a scan pulls in new
tracks.

Also worth knowing before you start:

- **`/scan` and `/classify` start work on page load.** No confirm step. Typing either URL in the
  address bar fires the real thing.
- **`/api/llm/propose` is a GET.** Pasting it in the address bar starts a paid run and overwrites
  your categories. Never "just check" it.
- Nothing outside `/label` touches `data/labels/labels.jsonl`.
- Nothing outside `/apply` writes to Spotify.

### Origins matter

The OAuth callback sets `sorter_access_token` on `127.0.0.1` only (`app/api/auth/callback/route.ts:68`).
`localhost` and `127.0.0.1` are separate cookie origins.

| Route                                      | On `localhost` without the cookie                          |
| ------------------------------------------ | ---------------------------------------------------------- |
| `/api/spotify/playlists`, `/scan`, `/diff` | Fine — falls back to the refresh token in `cache.json`     |
| `/api/spotify/playlist-tracks`             | Fine since `7a44e6b` — same refresh-token fallback         |

Symptom: the playlist grid loads, but every eye-icon preview says `Couldn't load tracks: HTTP 401`.
Same symptom if you connected over an hour ago (the cookie lasts 3,600s while the page keeps working
forever). Fix either way: go to `http://127.0.0.1:3000/` and click Connect Spotify.

`pnpm start:open` does the right thing already — `next dev -H 127.0.0.1 -p 3000` plus auto-open
(`start.ts:4`).

---

## The 60-second tour

All safe. Nothing spends, nothing writes to Spotify, nothing touches the label file.

1. `http://127.0.0.1:3000/` — the landing page. Don't click Connect; you're already connected.
2. `/scope` — 106 cards. Toggle one off, watch the counter. Click an eye icon for a track preview.
3. `/review` — 41 category cards. Rename one. Click **Classify**, read the cost modal, click **Not yet**.
4. `/label` — click **Songs**, then **Back**. That is the real labelling UI. Read it; press nothing
   in the bottom bar.
5. `/apply` — the modal opens by itself. Read the counts. Click **Not yet**.

Skip `/scan`, `/classify` and `/diff` on a short tour: the first two start real work on mount, and
`/diff` takes 41 seconds.

---

## State on disk right now

|                  |                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Cache            | `data/cache.json`, version 2, 2.3 MB                                                           |
| Tracks / artists | 3,172 / 1,476                                                                                  |
| Categories       | 41, **all** with `spotify_playlist_id: null`                                                   |
| Assignments      | 3,172 (every track), **0 overrides**                                                           |
| Runs             | **7** — 2 propose, 5 classify. All completed.                                                  |
| Last run         | 2026-09-23 02:27:56 → 02:29:30Z, "Classified 297 new tracks. 2875 reused from cache.", $0.1747 |
| Last propose     | 2026-05-16, $0.1369 → page prints **"Last propose 129d ago · $0.14"**                          |
| Scope            | 105 included, 0 excluded, Liked Songs on                                                       |
| Snapshots        | 106 (105 in scope + 1 orphan `7kTRhp8EjPGEHyfDf3vx1o`)                                         |
| Liked Songs      | 189 tracks, fetched 02:24:40Z                                                                  |
| Config           | prefix `✨`, threshold 65, `claude-haiku-4-5-20251001`                                         |
| Labels           | 491 rows in `labels.jsonl`; definitions sha `0ac950c7…` matches all 41 names                   |
| Live Spotify     | 105 owned playlists, **zero** starting with `✨`                                               |

---

## `/` — landing page

The front door. Checks the two API keys, then hands you to Spotify.

**Tonight:** eyebrow "A private record-listening room.", a 7xl serif headline "Sort your _library_
into vibes that mean something.", the Haiku blurb, and one link-style button.

| Control                  | Result                                                                                                   | Tag                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Connect Spotify**      | Full page load → PKCE → Spotify (flashes through, you've approved before) → lands on `/scope`.           | **WRITES** `cache.json` auth block |
| Nothing below the button | Correct. `ResumePrompt` renders only when the **last** run has `completed_at: null`. All 7 are complete. | SAFE                               |

The button reads "Connect Spotify", not "Set up Spotify" — confirmed in the served HTML. The
alternate label only appears when `EnvSchema` fails, and `GET /api/config` returns
`{"configured":true}`.

**What Connect actually does** (`app/api/auth/login/route.ts`):

1. If the host isn't `127.0.0.1:3000`, 307 to the canonical origin first.
2. Mints a 128-char PKCE verifier (`randomBytes(64)` → base64url → sliced) and a 16-byte state, both
   into HttpOnly / SameSite=Lax / **Max-Age=600** cookies. No client secret anywhere.
3. 307 to `accounts.spotify.com/authorize` with scopes `playlist-read-private
playlist-read-collaborative playlist-modify-private user-library-read user-read-private`. There
   is **no `playlist-modify-public`** — every playlist this app creates can only be private.
4. The callback verifies state, exchanges the code, overwrites `auth.refresh_token` +
   `auth.expires_at` in `cache.json`, sets `sorter_access_token` (1 hour), clears the PKCE cookies,
   307s to `/scope`.

**You can skip it.** Typing `/scope` works with no cookie at all: every Spotify route calls
`ensureFreshToken(session)`, and with no session it falls back to the refresh token already on disk
(`src/lib/spotify/client.ts:12-34`). A missing cookie is not logged-out. Cost: an extra refresh
round-trip, and `cache.json` gets rewritten.

**To prove you're connected** without clicking anything — there is no connection indicator in the UI:

```
curl -s http://127.0.0.1:3000/api/cache | python3 -c "import sys,json; print(json.load(sys.stdin)['auth'])"
```

Expect `{'has_token': True, 'expires_at': '2026-09-23T03:2x:xxZ'}`. The route strips the refresh
token itself, so it's safe on a shared screen.

**Rough edges here:**

- **Denying on Spotify's screen shows no error.** The callback redirects to `/?error=denied&detail=…`
  (`route.ts:22`) but `app/page.tsx` never reads `searchParams`. You get the normal landing page with
  a query string. `docs/manual-test-checklist.md` claims "User-deny shows /?error=denied page" — that
  line overstates what exists. Don't demo the deny path.
- **PKCE cookies expire in 10 minutes.** Leave Spotify's approval screen sitting for 11+ minutes and
  the callback returns raw JSON — `{"error":"state mismatch"}`, HTTP 400. There is no styled error
  page anywhere in the auth flow. Recovery: back to `/`, click Connect again.
- **`<button>` nested inside `<a>`** (confirmed in the served HTML). Invalid, clicks fine.
- **The headline serif is a system font.** `app/fonts/` holds only a README; Editorial New was never
  downloaded, so `--font-display` falls through to Iowan Old Style (`app/globals.css:27-31`).
  Documented and intended.

---

## `/setup` — the wizard you can't reach

**Tonight:** a flash of "Setup — step 1 of 4 / Let's get connected.", then an immediate jump back to
`/`. The client `useEffect` fetches `/api/config`, sees `configured: true`, calls `router.replace("/")`.
The server really does render step 1, so the flash is real.

**You cannot demo this without breaking your working config.** For narration only:

| Step            | Gate                 | Notes                                                                                                                                                                               |
| --------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Intro         | Continue always on   | Tells you the Redirect URI must be exactly `http://127.0.0.1:3000/api/auth/callback`                                                                                                |
| 2 Client ID     | ≥ 20 chars           | SAFE                                                                                                                                                                                |
| 3 Anthropic key | `sk-ant-` prefix     | Continue POSTs `/api/llm/validate` — a real 1-token Anthropic call. **SPENDS** (a fraction of a cent). Bad key → "That key was rejected. Double-check it on console.anthropic.com." |
| 4 Prefix        | non-empty, ≤ 8 chars | "Save and continue" **overwrites `.env.local`** with exactly two lines and patches `config.prefix`. **WRITES, destructive.**                                                        |

**If someone asks you to re-run setup live, say no.** `POST /api/config` rewrites `.env.local`
wholesale (`route.ts:31-32`) and the dev server restarts on `.env` change — you'd drop mid-demo.

Dead reference: step 4's copy says "You can change this later in Settings"
(`PrefixStep.tsx:15`). There is no `/settings` route. Only visible inside the wizard.

---

## `/scope` — pick what to read

Step one. Choose which playlists Claude may read. Read-only against Spotify; writes only the `scope`
block of `cache.json`.

**Tonight:** "Loading your library…" for ~1 second (measured 0.91–1.33s), then `106 of 106 selected`
in a 2-column grid. Liked Songs first with a heart icon and `read-only — never modified`, then 105
playlist cards with cover art and `N tracks`. Everything starts selected, accent border, filled
checkmark.

| Control               | Result                                                                                                                                                                                                | Tag                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Click a card body     | Toggles off: grey border, empty checkbox, title underline gone, counter → `105 of 106`.                                                                                                               | SAFE                                 |
| **Deselect all**      | All grey, `0 of 106`, Scan drops to 50% opacity and is unclickable, `Pick at least one source to read.` appears.                                                                                      | SAFE                                 |
| **Select all**        | Back to `106 of 106`.                                                                                                                                                                                 | SAFE                                 |
| **Filter playlists…** | Case-insensitive substring on name. `piano` → 2. `japanese` → **12**. `zzz` → 0 plus `No playlists match "zzz".`                                                                                      | SAFE                                 |
| Eye icon on a card    | Modal: `PREVIEW / <name>`, `N tracks`, numbered list. ~1s for a small playlist; `chills` (291 tracks) needs 6 sequential Spotify pages, so several seconds. Fetches the whole playlist, not a sample. | SAFE (read-only GET)                 |
| Close the modal       | X, or click the dark backdrop. **Escape closes it** (fixed in `fa8678d`); focus returns to the card.                                                                                                                     | SAFE                                 |
| Eye on Liked Songs    | Same modal titled `Liked Songs`, ~189 tracks. Liked Songs is only ever read.                                                                                                                          | SAFE                                 |
| **Scan**              | PATCHes `{included, excluded, include_liked_songs}` into the cache, then routes to `/scan`. With no changes it rewrites the identical 105 / 0 / true.                                                 | **WRITES** `cache.json` (scope only) |

Two filter quirks, both by design: the **Liked Songs card never filters out** (it renders outside the
filtered list, so with `zzz` you see it _and_ the no-matches line), and **Select all / Deselect all
ignore the filter** — they hit all 105 regardless of what's visible (`app/scope/page.tsx:47-58`).

Scan is a text link with a thin underline, not a boxed button, 64px below the grid. Easy to scroll past.

The modal's count is **≤** the card's: the card shows Spotify's raw total, the modal counts only
tracks that survive normalisation (local files, null ids, artist-less rows are dropped).

**Looks broken, isn't:**

- **"Japanese Pop Hits" appears 6 times.** Six genuinely different playlists sharing one name — six
  distinct ids, five with 10 tracks and one with 8. Confirmed live: 105 playlists, 105 distinct ids,
  zero duplicates. Commit 451f04f deduped on **id**; this is not that bug returning. (Note the
  _filter_ `japanese` returns 12 cards, because other playlists — "backup japanese", "Japanese Pop
  Mix", "Japanese Music Mix" — also contain the word.)
- **`Imported` renders a blank grey square.** It's the only playlist with `cover_url: null`, and the
  grey fallback tile only gets an icon for Liked Songs (`iconFallback` is undefined for normal
  playlists, `PlaylistCheckboxCard.tsx:20`). Cosmetic.
- **Liked Songs shows no track count** — the subtitle replaces it. Its `track_count` is a hardcoded 0.
- **`cache.json`'s mtime changes just from opening `/scope`.** Any Spotify-backed request without a
  live cookie refreshes the token, which re-saves the whole cache
  (`src/lib/spotify/client.ts:25-33`). Not corruption.

**Real rough edges:**

- **`/scope` never loads your saved scope.** It always opens with all 105 + Liked selected regardless
  of `cache.scope`. Today that matches (0 excluded), so you won't notice — but any exclusions you
  save do not come back on a revisit.
- **`/scope` fails silently if auth dies.** `setPlaylists(d.playlists ?? [])` has no error branch
  (`app/scope/page.tsx:29-32`). A 500 renders as **`1 of 1 selected`** with only the Liked Songs
  card and no message. One lonely card = auth failure, not an empty library.

---

## `/scan` — read the library

**It starts on mount. There is no confirm step.** Typing `/scan` in the address bar fires a real scan.

**Tonight:** `SCANNING / Reading your library…`, a hairline progress bar, a line ticking
`Reading your playlists… (1/105)` → `(105/105)`, then `Reading your Liked Songs… (1/1)`.

**How long:** last night's run spanned **43.2 seconds** (first snapshot write 02:23:57.752Z → liked
fingerprint 02:24:40.981Z) and re-fetched 20 playlists. If nothing changed since, all 105 snapshot
ids match and every playlist is skipped — 106 quick metadata calls, so roughly 30–60 seconds.

**What it writes:** updated `playlist_snapshots` and `liked_songs_fingerprint`; if a playlist changed,
its tracks merge into `cache.tracks` (existing entries are never overwritten, only added) and its
artists into `cache.artists`. **WRITES** `cache.json`. No Spotify writes, no Claude call, no money.

**On finish:** title flips to `Found your library.`, bar fills, and you get
`3172 unique tracks across 1476 artists.` After **800ms it redirects to `/diff`**, because
`cache.runs` is non-empty (7 entries). Not `/review`. `/diff` bounces on to `/review` only if there
are no categories; you have 41, so you stay.

**Gotchas:**

- **Don't close or reload the tab mid-scan.** `docs/superpowers/plans/2026-05-15-cache-efficiency-plan.md`
  records the hypothesis that Next aborts the route handler when the browser drops the EventSource,
  before `writeCache` runs.
- **The progress total jumps 106 → 105 on the first tick.** The opening event sends
  `playlists + liked = 106`, every later one sends `105` (`src/lib/pipeline/scan.ts:30-34` vs `:60`).
  Harmless label bug.
- **Dev-mode double-mount.** React StrictMode is on by default in App Router, so the effect mounts
  twice and opens two EventSources. The UI listens to the second, so the screen is correct; expect
  stray stream errors in the dev terminal. _(Mechanism CONFIRMED from config; the doubled runtime is
  ASSUMED — no scan was run this session.)_
- **A rate-limited snapshot check silently becomes a full re-fetch.** `scan.ts:47-52` swallows any
  snapshot error including a 429 and falls through to a complete playlist fetch. Throttling makes the
  scan slow, not failed.
- **No back link during the scan** — one only appears on the error screen.
- Empty-scope path: `/scan` with an empty saved scope shows `Your scope is empty. Pick some playlists
or enable Liked Songs first.` plus `← Change scope`. You can't reach it from `/scope` (Scan is
  disabled at 0 selected), and it isn't worth staging.

---

## `/diff` — what changed

Read-only. Nothing here mutates your account.

**No nav links to it.** Type the URL, or arrive from `/scan`.

**Tonight:** you get **"Your library is unchanged."**, the line "No new or removed tracks since the
last run", and a `← Back to start` link. Verified live this session: `GET /api/spotify/diff` returned
`{"added":[],"removed":[],"existing_category_count":41,"is_first_run":false}`.

**It takes ~41 seconds, and the page says "~5s expected".** Measured **41.3s** this session. At 7.5s
the caption flips to "still working — larger libraries take longer". That is the honest state, not a
hang: the route re-downloads the full track list of all 105 source playlists plus Liked Songs and
deliberately ignores `playlist_snapshots` (`app/api/spotify/diff/route.ts:26-36`). If you want a
fast demo, open `/diff` a minute before showing it.

**The interesting screen will not render tonight.** To see the DiffBanner, add one song to any
in-scope playlist in the Spotify app first, then reload (another ~41s). You'd then get "Since last
run": `+1 new tracks`, `· 41 existing categories`, and for removals
`~N tracks removed from your sources (still in ✨ playlists)` plus a `Removed: …` line.

| Control (banner only)              | Result                                                                                                                | Tag          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Apply with existing categories** | → `/classify`, which starts a run on mount. **$0.00 tonight** (0 unclassified). Re-arms once a scan finds new tracks. | SAFE tonight |
| **Edit categories first**          | → `/review`. No LLM call on mount.                                                                                    | SAFE         |

Edge case you won't hit: with `existing_category_count === 0` or an empty cache, `/diff` silently
`router.replace`s to `/review`.

`/diff` has **no cross-site guard** — only `/api/spotify/apply` and the LLM routes call
`rejectCrossSite`. Harmless (it's a read), but an inconsistency an interviewer might spot.

---

## `/review` — edit the categories

Step two, and the only screen where the category list itself is editable.

**No nav link.** Type the URL, or arrive from `/scan` → `/diff` → "Edit categories".

**Tonight:** a flash of "Thinking / Proposing categories… / Claude Haiku is listening through your
library." — that is the pre-hydration shell, not a run. **No Anthropic call happens**: the page only
starts a propose stream when `cache.categories` is empty (`page.tsx:88-101`), and you have 41.

Then: eyebrow "Step two", title "**41 categories. Edit anything.**", a 2-column grid of 41 cards
fading in at 0.04s each (last card ~1.6s in), and the footer
**"41 categories · 3172 tracks · 3172 already classified"** with **"Last propose 129d ago · $0.14"**
below it.

A card: big editable name, trash icon top-right, description as plain text, `Samples · estimated N`,
and up to 5 numbered sample tracks, each linking to `spotify:track:<id>`.

| Control                      | Result                                                                                                                                                                                                                                                    | Tag                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Click the name, type         | Heading updates live. React state only — refresh discards it.                                                                                                                                                                                             | SAFE                                                                                 |
| Edit the description         | **You can't.** `CategoryCard.tsx:66` renders it as a `<p>`. Descriptions are only settable when adding a _new_ category. This matters: the description **is** what the classifier sees (`src/lib/pipeline/classify.ts:29-35`); the sample tracks are not. | —                                                                                    |
| Trash icon                   | Card disappears. **Does not persist** — see below.                                                                                                                                                                                                        | SAFE locally                                                                         |
| Drag one card onto another   | Hover → grip handle appears top-right; drag >6px onto another card, it outlines in accent, drop. Source vanishes, its sample ids union into the target, **target keeps its id** (`src/lib/categories/merge.ts:19-21`).                                    | SAFE locally                                                                         |
| **Show all N sample tracks** | On exactly **3 cards** — Glitchy Hyperpop (9), Indie & Alternative Rock (9), Afro-Latin Dance Rhythms (14). Toggles to "Show fewer".                                                                                                                      | SAFE                                                                                 |
| **Add track**                | Modal over the page, autofocused search, "Searches the 3,172 tracks already scanned from your library." Empty query → first 50; typing filters title and artist, capped at 100. Tracks already in the card show greyed "IN CATEGORY".                     | SAFE — and **purely cosmetic**: `example_track_ids` are never sent to the classifier |
| **Add a category**           | Dashed bar under the grid → name + description → appends a card with a fresh `crypto.randomUUID()`. Local only.                                                                                                                                           | SAFE by itself, **arms the broken path below**                                       |
| **Classify**                 | Opens the cost modal only.                                                                                                                                                                                                                                | SAFE                                                                                 |
| **Re-propose**               | Opens the second cost modal only.                                                                                                                                                                                                                         | SAFE                                                                                 |
| **Refresh the page**         | The honest undo for everything above.                                                                                                                                                                                                                     | SAFE                                                                                 |

### The Classify modal — tonight

Because 0 tracks are unclassified:

```
Cost estimate
$0.00 — $0.00
All 3172 tracks are already classified — Claude won't be called.

Total tracks               3,172
Already classified (free)  3,172
New this run                   0
Saved by reusing cache     ~$2.01
```

- **Not yet** — closes cleanly. SAFE.
- **Proceed** — PATCHes your edited categories into `cache.json`, then navigates to `/classify`,
  which starts a run on mount. Tonight that run finds nothing to do, costs **$0.00**, and appends a
  $0 run row. **WRITES** `cache.json`. It never writes to Spotify and never touches the label file.

### The Re-propose modal — do not confirm

```
Cost estimate
$0.11 — $0.14
This wipes the current 41 categories and any track assignments, then asks Claude to
invent new ones from your full library (3172 tracks).
[Wipe & re-propose]  [Not yet]
```

Confirming immediately `_clear`s `categories` and `assignments` from `cache.json` — that's the $1.68
September classify **and** tonight's $0.17 — then streams a fresh propose (~2 min, ~$0.14) writing
brand-new categories with new ids and new names. **SPENDS + destroys real data + breaks `/label`.**

The modal doesn't say so, but: new names mean `data/labels/definitions.md` (41 headings, exact-name
match) no longer resolves, `/label` throws `DefinitionsError`
(`src/lib/labeling/definitions.ts:45-50`), and the 491 rows in `labels.jsonl` are keyed to category
ids and a definitions sha that no longer exists. **The backup is not an undo**:
`~/spotifysorter-backup-0918/cache.json` is the _older_ world (45 categories, 2,875 tracks), so
restoring it loses the current classification. And if propose fails partway you're left with zero
categories and zero assignments, because the wipe PATCH lands before the LLM call.

### Real bugs you can hit here

- **Deleting or merging a category does not persist.** `PATCH /api/cache` goes through `patchCache`,
  which _merges_ objects (`src/lib/cache/patch.ts:16-30`), so categories you removed from the draft
  are still in `cache.json`. Delete "Melodic Techno Hypnotic" → Classify → `/classify` still lists 41
  cards including it, and a refresh of `/review` brings it back. Renames and additions **do** stick
  (same id overwritten / new id merged in). The only path that truly clears categories is
  Re-propose's `_clear`.
- **"Add a category" → "Classify" is a guaranteed-fail spend.** `classify()` POSTs
  `/api/llm/reclassify`, which scores **all 3,172 eligible tracks against the new category in one
  request with `max_tokens: 4000`** (`src/lib/pipeline/reclassify.ts:17-46`,
  `src/lib/llm/reclassify.ts:49-56`). 4,000 output tokens holds roughly 150 score entries, so the
  reply truncates, `JSON.parse` throws, the route 500s — and `app/review/page.tsx:154-160` never
  checks the response, it just navigates on. You pay for the call (**~$0.12 estimated**, ASSUMED —
  this path has not been run), nothing is written, and no run row is recorded. **Don't demo it.**
  Merging two cards is fine: merge keeps the target's existing id, so no new id means no reclassify.
- **Every visit downloads the whole ~1.5 MB cache** into the browser, all 3,172 tracks and 3,172
  assignment rows. Fine locally; expect a beat before the grid appears.

### Looks broken, isn't

- **"Samples · estimated 5" but only 2–4 rows** on 20 of the 41 cards. The count comes from the raw
  id list, the rows from ids that exist in the cache; **28** proposer-hallucinated ids
  (`2After Dark`, `1Falling`, `07Lie`, …) out of 208 are filtered out at render
  (`MergeableGrid.tsx:107-109`). Worst: Midwest Emo, Christian Hip Hop, Stutter House (4 → 2), Deep
  House Groovy (5 → 2). Afro-Latin says "estimated 15" but its expand link says "Show all 14" — same
  cause.
- **The drag handle overlaps the trash icon area** and only appears on hover. Aim badly and you
  delete instead of drag. Refresh undoes it.
- **"Last propose 129d ago" ignores classify runs** by design — the $1.68 September run and tonight's
  $0.17 never appear here.
- **Blind-label guard:** `/review` shows no per-song scores or ranks, and none of the 30 songs
  awaiting their second labelling pass appear as sample tracks on any card. Demoing this page does
  not contaminate the study.

---

## `/classify` — tune the fit

Step three: score unclassified tracks against the 41 categories, then slide a confidence threshold
and drag tracks between playlist previews before anything reaches Spotify.

**The page starts a run on mount, with no confirm.** `EventSource("/api/llm/classify")` fires in a
bare `useEffect(..., [])` at `app/classify/page.tsx:47`. The cost modal lives only on `/review`.

**Tonight that run is free.** 0 unclassified tracks, so `runClassifyFromCache` returns immediately
(`src/lib/pipeline/classify.ts:84-103`), appends a $0 run row, and costs nothing.

**What you'll see:** "Classifying — Listening through your library… 0 of 1 batches" for a beat, then
the grid. The banner reads **"No new tracks needed Claude this run."** followed by
**"Reused 3172 cached."** — _not_ the "$0.17" message, which belonged to the 02:27 run and is now
overwritten.

| Control                             | Result                                                                                                                                                                                                                                                                           | Tag                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Dismiss** on the banner           | Client-only.                                                                                                                                                                                                                                                                     | SAFE                    |
| Confidence slider                   | Pure client-side recompute. Nothing written until "Apply to Spotify".                                                                                                                                                                                                            | SAFE                    |
| **Show all N / Collapse**           | Each card renders 8 tracks until expanded. Expanding the two big ones renders ~1,400 rows; heavy, not broken.                                                                                                                                                                    | SAFE                    |
| Drag a track chip onto another card | Sets `assignments[trackId].override` and PATCHes immediately. The chip moves; destination border lights up while hovering. The track then appears in **exactly one** card at every threshold. **No undo** — dragging it back just writes another override, never back to `null`. | **WRITES** `cache.json` |
| **Apply to Spotify**                | PATCHes `config` with your slider value plus a hardcoded `prefix: "✨"` and the model id, then routes to `/apply`. Does not itself touch Spotify.                                                                                                                                | **WRITES** `cache.json` |

**Slider stops, recomputed against tonight's 3,172 assignments:**

| Threshold        | Category slots | Notes                                                                                                                                                            |
| ---------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0                | 15,860         |                                                                                                                                                                  |
| 50               | 15,378         |                                                                                                                                                                  |
| **65** (default) | **12,194**     | biggest _Bedroom Pop Intimacy_ 1,442, _Soft Pop Ballads_ 1,412, _Singer Songwriter Intimate_ 840, _Dream Pop Ethereal_ 823; smallest _Stutter House Rhythmic_ 14 |
| 80               | 4,148          |                                                                                                                                                                  |
| 100              | 3,172          | exactly one card per track                                                                                                                                       |

12,194 at the default means the average track lands in ~3.8 playlists. For roughly one playlist per
track at `/apply`, push the slider to ~90–100 first.

**Looks broken, isn't:**

- **"0 of 1 batches"** for the first second — client initial state, not a one-batch run.
- **All 41 cards always show tracks, even at threshold 100.** `trackPassesThreshold` falls back to the
  single top match when nothing clears the line (`src/lib/classification/threshold.ts:7-14`), so the
  slider redistributes rather than empties.
- **Two EventSource connections in the Network tab** — StrictMode double-mounts in dev. `singleFlight`
  makes the second _join_ the first run, so you'd be billed once.
- **Total batches can grow mid-run** ("6 of 7") — up to 3 rounds, and tracks the model left out or
  duplicated get resent, adding to the denominator.

**Real bugs:**

- **No spend cap exists.** `capUsd` lives only in `src/lib/analysis/context-run.ts`, imported solely by
  `scripts/context-test.ts` and `scripts/context-report.ts` — never by a route. The web path has an
  estimate, not a limit.
- **A failed run hangs the page forever.** `es.addEventListener("error", () => es.close())` has no UI:
  `running` stays `true`, so you'd sit on "3 of 6 batches" with no message. The cause would be in the
  terminal. Partial work is still saved — each batch writes its assignments as it lands.
- **Closing the tab doesn't stop the run or save money.** By design (`event-stream.ts` `cancel()` only
  unsubscribes) the job continues so its writes land. In-flight calls are billed either way.
- **"Apply to Spotify" silently rewrites your prefix to `✨`** and re-pins the model in config.
  Invisible tonight (your prefix is already `✨`), but it would clobber anything set in `/setup`.

---

## `/apply` — the only Spotify write

**Nothing has ever been applied.** Three independent checks this session: all 41 categories have
`spotify_playlist_id: null`; a live `GET /api/spotify/playlists` returned 105 owned playlists and
**zero** whose name starts with `✨`; no run row has the apply summary shape.

(`playlist_snapshots` is a red herring here — its 106 entries are scan bookkeeping for _source_
playlists.)

Reach it by typing the URL. The only in-app link is the button at the bottom of `/classify`.

**The confirmation modal opens by itself.** Once `/api/cache` resolves it reads:

```
Final step
About to write to your Spotify account.
  41     new playlists will be created.
  12194  tracks added in total.
  All playlists private by default.
[Apply]  [Not yet]
```

The "N existing playlists will be updated" line is **absent, not missing** — it only renders when
`toUpdate > 0`, and no category has a playlist id yet.

| Control                             | Result                                                                                                                                                                                                          | Tag                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Not yet**                         | Modal closes → "About to apply." + a "Review and apply" button that reopens it. Idempotent. **This is the safe thing to show an interviewer.**                                                                  | SAFE                                                        |
| **Apply**                           | POST `/api/spotify/apply`.                                                                                                                                                                                      | **WRITES TO SPOTIFY — irreversible without manual cleanup** |
| **Try again** (on the error screen) | Re-POSTs. Safe to press: every created playlist's id is already in `cache.json`, so the retry reads that playlist's current tracks and adds only the missing ones. No duplicate playlists, no duplicate tracks. | **WRITES TO SPOTIFY**                                       |
| `GET /api/spotify/apply`            | 405 — the route is POST-only. Safe to hit by accident. A cross-site POST is rejected 403 by the `Sec-Fetch-Site` guard.                                                                                         | SAFE                                                        |

**What Apply does per category, in cache order** (`src/lib/pipeline/apply.ts:47-105`):

1. No cached playlist id → search all owned playlists for an exact name match `✨ <Category>`. None
   exist, so →
2. `POST /me/playlists` creating a **private** playlist, e.g. `✨ Bedroom Pop Intimacy`;
3. immediately write that id into `cache.json` (a crash mid-run is resumable);
4. `POST /playlists/<id>/items` in chunks of 100 URIs. Only ids present in `cache.tracks` are sent.
5. ×41, then append one run row.

It **never deletes, never unfollows, never touches your 105 existing playlists, and never removes a
track.** The only account mutation is new playlists plus track adds. 429s are retried per 100-track
chunk (up to 5 times, honoring `retry-after`) precisely so a retry can't re-add earlier chunks.

**While it runs:** "Writing to Spotify / Adding tracks…", a progress bar, and
`Adding to "Bedroom Pop Intimacy"… (3/41)`. **Expect several minutes** — 41 creates, ~130 add-chunks,
and 41 full paginations of your playlist list for the name lookup (~1.2s each, measured).
Rough estimate 2–5 minutes. **ASSUMED** — this path has never executed against this account.

**Success screen** ("Side A" credits roll): headline "41 new playlists / 12194 tracks placed.", then
all 41 sorted by track count descending with a "Side B." divider inserted before item 13, then a
closing note about multi-selecting them in Spotify desktop and dragging into a folder. Each name is
an `<a href="spotify:playlist:…">`; in a browser with no handler registered it may appear to do
nothing.

**Double-click guard:** a second POST — double-click, second tab, refresh-and-click — joins the run
in flight and streams its progress instead of starting a second double-writing run. Safe to demo:
open `/apply` in two tabs and hit Apply in both.

**Gotchas:**

- **12,194 ≠ 12,194 songs.** That's category memberships: 3,172 distinct tracks, 3,082 of them in
  more than one category at threshold 65. If asked "why more tracks than my library", that's the
  answer.
- **The modal flashes 0 / 0 / 0.** `preview` is fetched after mount and the modal starts open, so for
  a beat it reads "0 new playlists will be created". Cosmetic — Apply applies everything regardless
  of what the preview says.
- **A second apply after a successful one** flips the modal to `0` new / `41` existing will be
  updated, and `tracks added` ends at 0 because everything is already there.
- **The apply run row has no `type` field and `cost_usd: 0`**, so it won't appear in `/classify`'s
  banner or in `/review`'s "Last propose" line. Intentional; the row reads
  "41 created, 0 updated, 12194 tracks added."
- ASSUMED, not verified: in dev, editing a source file mid-apply can hot-reload and reset the
  single-flight module state, letting a later POST start a second concurrent run. Don't edit files
  while a real apply is running.
- Correction to earlier notes: there is no `src/lib/pipeline/diff.ts`. Diff logic lives in
  `src/lib/classification/diff.ts`; the orchestration is inline in `app/api/spotify/diff/route.ts`.

---

## `/label` — the labelling study

Four queues; each answer appends one immutable row to `data/labels/labels.jsonl`.

**Nothing links here.** Type the URL.

**Current state** (live `GET /api/label`, HTTP 200, 174 KB, 30 ms):

| Queue    | Done          | Notes                                                        |
| -------- | ------------- | ------------------------------------------------------------ |
| Songs    | **100 / 100** |                                                              |
| Pairs    | **200 / 200** | 25 have `score: null`; 125 are a model "yes" at threshold 65 |
| Gold set | **190 / 190** |                                                              |
| Relabel  | **0 / 30**    | all 30 time-locked                                           |

`labels.jsonl`: 491 rows = 200 pair + 191 gold pass-1 + 100 random pass-1, written 2026-09-20T00:08Z →
2026-09-21T14:36Z. 489 of 491 are `assisted: true`; 1 is `prior_exposure: true`; 0 are `cant_judge`.

### The timing trap — read this one

**The 48-hour gate expires at 12:11 AM local, about 1 h 39 min from now.** Earliest `opens_at` is
`2026-09-23T04:11:05.824Z`; the other 29 open at 12:40 AM. After that the Relabel tab stops showing
"Next relabel opens…" and starts showing a real song with live `Save` / `Can't judge` buttons, and
**Accept all becomes a 30-row write.** Either finish clicking around before midnight, or after
midnight treat Relabel exactly like the other tabs: look, never save.

### Walking it

**First paint** — no visible heading (the `<h1>` is screen-reader-only). A thin tab row and one grey
sentence:

```
Songs   Pairs   Gold set   Relabel     Accept all suggestions     0 / 30

Next relabel opens Wed, Sep 23, 12:11 AM.
```

**Relabel is pre-selected** because the page opens on the first tab with unfinished work
(`firstUnfinishedMode`), and Relabel is the only one left. No song, no checkboxes, no Back button —
every item is locked, so there is nothing behind you. **This is the correct screen, not a failure.**

| Control                                     | Result                                                                                                                                                                                                   | Tag                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Songs** tab                               | Counter → `100 / 100`, one line "Every song is labeled." with a **Back** button.                                                                                                                         | SAFE                                |
| **Back**                                    | Jumps to song #100, **"dirty lies" — Naits**. This is how you see the real UI.                                                                                                                           | SAFE                                |
| Tick / untick a checkbox                    | Local state only.                                                                                                                                                                                        | SAFE                                |
| **Accept suggestions** (in the guess panel) | Ticks the 5 suggested boxes. **Does not save.** Genuinely different from the Pairs tab — don't carry the habit over.                                                                                     | SAFE                                |
| **Hide / Show**                             | Collapses the guesses. **Session-wide and sticky** across songs and tabs until reload. Line becomes "Suggestions hidden for this song".                                                                  | SAFE                                |
| **Back / Next** in the sticky bar           | Walks the 100. Back disabled at #1; Next disabled on an unanswered item, so you can't skip work. Past #100 returns to "Every song is labeled."                                                           | SAFE                                |
| **Save**, **Can't judge**                   | POST `/api/label`, appends one permanent line. Saving an already-labelled song does **not** overwrite — it adds a **second row for the same track**, exactly the duplicate that skews agreement numbers. | 🔴 **WRITES the frozen label file** |

**Song #100 shows:** big serif title, artist underneath (no genre line for Naits — no genres in
cache), a Spotify embed player that actually plays, an accent-bordered panel reading "The model's
guesses — these are what you are being compared against" with `Emo Rap Heartbreak 77 · Melodic Rap
Introspection 71 · Dark R&B Moody 68 · Bedroom Pop Intimacy 63 · Slowed Reverb Nostalgia 60`, then
**41 checkboxes in two columns** with In/Out definitions, shuffled per song (seeded by track id) so
list position can't bias you, then the sticky bar.

**Pairs tab → Back** — 🔴 **the dangerous one.** Shows pair #200: **"SUICIDE" — Lil Fard**, category
**Bedroom Pop Intimacy**, "The model did not rank this category for this song — it says no"
(`score: null`). Keep pressing Back for scored examples: #199 _Gold and Bones — Friday Pilots Club,
Indie & Alternative Rock,_ "scored this 78 and says yes"; #197 _Don't Blame Me — Taylor Swift, Soft
Pop Ballads,_ 88 / yes.

**There is no Save button on Pairs. The three answer buttons ARE the save.** `Yes`, `No` and
`Can't judge` each write the instant you click — no confirm. **"Accept suggestion" here also writes
immediately** (unlike the Songs tab). Four one-click writes on that screen. Click only `Back`/`Next`.

**Gold set → Back** — `190 / 190`, "Every gold-set song is labeled.", Back lands on **"Chasing
Shadows" — Alex Warren** (Singer Songwriter Intimate 85, Soft Pop Ballads 82, Indie Folk
Storytelling 78). Identical UI to Songs. Same rule.

**Relabel → "Accept all suggestions"** — swaps the link for "Save the model's answer for the 30
remaining?" with **Accept all** and **Cancel**.

- **Cancel** — SAFE, returns the link.
- **Accept all** — ⚠️ **right now it writes nothing**: all 30 are locked, the builder skips locked
  items, so it posts 0 requests, flashes `0 / 0`, re-reads state and stops. **After 12:11 AM it
  appends up to 30 pass-2 rows.** Don't click it; if you do, click Cancel.

**Keyboard:** no shortcuts exist anywhere in `src/components/label/` — no `1`–`5`, no Enter to save.
Everything is Tab + Space/Enter. Focus jumps to the song title on each new item, so Tab walks
Hide → Accept suggestions → 41 checkboxes → Back → Next → Can't judge → Save. ⚠️ **Tabbing past the
last checkbox puts you two Space presses from a permanent write.** Focus is a 2px accent outline.

**One-line rule:** everything that _navigates or reveals_ is free — tabs, Back, Next, Hide/Show,
ticking boxes, and Songs' own "Accept suggestions". Everything that _answers_ writes a permanent
line: `Save`, `Can't judge`, and on Pairs also `Yes`, `No` and `Accept suggestion`.

---

## Known rough edges

Real things you'd otherwise think you broke.

| Thing                                                            | Why it's not your fault                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`/label` opens nearly empty on Relabel**                       | It auto-selects the first queue with work left; the only one left is time-locked until 12:11 AM. Click **Songs**.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Checkboxes are empty on a song you already labelled**          | Deliberate. `LabelApp.tsx` keeps answers for Back **in memory only** ("Never loaded from disk"). The file still has all 491 rows. Same reason Pairs never shows "Saved as yes." for Sep 20–21 work.                                                                                                                                                                                                                                                                                                                                        |
| **The blindness e2e test fails, on purpose**                     | `tests/e2e/label.spec.ts:137` asserts `GET /api/label` emits no `score`, `matches`, `rank`, `bin` or `assignments` key. It fails with `GET /api/label has key "score"`. Assisted labelling (5b7bb21, 2026-09-21) put the model's scores on every GET; the guard had been unrunnable for ~27 h because the in-repo Python venv broke `next build` on 2026-09-19, and the e2e suite runs on a production build. Left failing deliberately — see commit 736780a. _(Not re-run this session: the spec replaces `cache.json` in its data dir.)_ |
| **491 rows vs 490 items**                                        | One gold track (`5zcoYCmeIL392as1bwIYce`) has two pass-1 rows, so 191 gold rows across 190 gold items. Pre-existing.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ~~"Accept all suggestions" on a fully-locked Relabel tab~~ FIXED `149a3f3` | The header only checks `items.some(i => !i.done)`, never whether any item is _open_. Clicking Accept all flashes `0 / 0` and does nothing. The one screen that lies to you.                                                                                                                                                                                                                                                                                                                                                                |
| **The Relabel confirm survives a tab switch**                    | `setMode` clears `error` and `now` but not `bulk`. Open the confirm, click Songs, click Relabel — it's still asking.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Hide doesn't un-assist the song already on screen**            | Once the guesses have painted for an item it's latched `assisted: true` even if you Hide before saving (`sawSuggestions` ref + page-level `seen` set). Hiding only produces blind rows for songs you reach _after_ hiding.                                                                                                                                                                                                                                                                                                                 |
| **Spotify embeds**                                               | Live `open.spotify.com` iframes. A network that blocks them shows Spotify's own error box inside the player; nothing else is affected.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Category order changes between songs**                         | Intentional per-track shuffle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **The landing page looks empty below the button**                | The resume banner is gated on the _last_ run having `completed_at: null`. All 7 are complete.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **`cache.json` changes while you watch it**                      | Any Spotify-backed request without a live cookie refreshes the token and re-saves the whole cache. `auth.expires_at` moved twice in 90 seconds during this session from read-only GETs alone.                                                                                                                                                                                                                                                                                                                                              |
| **The headline serif is a system font**                          | `app/fonts/` has only a README; falls through to Iowan Old Style. Intended.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`/diff` says "~5s expected" then takes 41s**                   | It re-fetches every track of 105 playlists plus Liked Songs live; it does not use the snapshot shortcut `/scan` uses.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **"Japanese Pop Hits" ×6**                                       | Six real playlists, six distinct ids. Not the dedupe bug (451f04f fixed that, and the live response has 0 duplicate ids).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`Imported` has a blank cover**                                 | Only playlist with `cover_url: null`; the grey fallback only gets an icon for Liked Songs.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Progress bar total goes 106 → 105**                            | Opening scan event counts Liked Songs, later ones don't.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Two EventSources in the Network tab**                          | React StrictMode in dev. `singleFlight` makes the second join the first, so no double billing.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **`/setup` step 4 mentions "Settings"**                          | There is no `/settings` route. Only visible inside the wizard, which you can't reach.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Deleting a category on `/review` doesn't stick**               | `patchCache` merges objects; only Re-propose's `_clear` truly removes them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`cache.playlist_snapshots` has 106 entries for 105 playlists** | The extra, `7kTRhp8EjPGEHyfDf3vx1o`, is a playlist you no longer own. Snapshots merge, never prune; the scan loop only walks `scope.included_playlist_ids`, so it's inert.                                                                                                                                                                                                                                                                                                                                                                 |

---

## Evidence classes

- **Live against real Spotify:** playlist list (105, 0 duplicate ids, 5,384 slots), the diff payload
  and its 41.3s timing, the zero-`✨`-playlists check, the token refresh observed rewriting
  `auth.expires_at`.
- **Live against the running dev server:** `/api/config`, `/api/cache`, `/api/label`, the served HTML
  of `/`.
- **Read from disk:** every count in [State on disk](#state-on-disk-right-now), all threshold
  recomputations, the label file.
- **Read from code only, never executed:** everything `/apply` does, the reclassify failure and its
  cost, the setup wizard's steps 2–4.
