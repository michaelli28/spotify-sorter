# Manual test walkthrough

Click-along guide to every page. First written against the live dev server and `data/cache.json` as of
**2026-09-22 22:32 EDT (2026-09-23 02:32 UTC)**.

**Updated 2026-09-23 ~04:00 EDT** for the whole-app UI pass on `feat/ui-pass` (`9b5d68c`…`9ef37aa`) and
the three fixes just before it (`b1c584b`, `0db0d6b`, `f6db73d`). The update was made from the code and
from `data/` on disk. The app was **not** run for it. See [Evidence classes](#evidence-classes).

Base URL: **`http://127.0.0.1:3000`**. Use the IP, not `localhost`. See [Origins](#origins-matter).

---

## Read this first

Four things in this app are irreversible. Everything else is safe to click.

| Action                                                             | Where     | What it does                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apply**                                                          | `/apply`  | Creates 41 real private playlists in your Spotify account and adds 12,194 track slots (3,172 distinct songs). Nothing in the app undoes this. The page itself is the confirmation: there is no modal any more. |
| **Re-propose → Wipe & re-propose**                                 | `/review` | Deletes all 41 categories **and** all 3,172 assignments (the $1.68 + $0.17 you already paid), then proposes new ones (~$0.14), and breaks `/label`.                                                            |
| **Classify → Proceed after Delete or Merge into…**                 | `/review` | Since `f6db73d` a deleted or merged-away category is really removed from `cache.json`. `/label` then refuses to load until `definitions.md` matches. The modal names what it deletes.                          |
| **Save / Can't judge / Yes / No / Accept suggestion / Accept all** | `/label`  | Appends permanent lines to `data/labels/labels.jsonl`. Append-only: no edit, no delete. **Relabel opened at 00:11–00:40 EDT, so `/label` now lands on a live song.**                                           |

**Classify does not cost money tonight.** A classify run finished at **02:29:30Z**. Re-read from
`cache.json` at ~03:55 EDT: 3,172 tracks, 3,172 assignments, **0 unsorted**. The `/review` cost modal
reads **$0.00**, and opening `/classify` is a free no-op. Since the UI pass it no longer writes a $0 run
row either. It re-arms the moment a scan pulls in new tracks.

Also worth knowing before you start:

- **`/scan` starts work on page load.** No confirm step. Typing the URL fires a real library read (free,
  but it writes `cache.json`). The only in-app way there is **Scan** on `/scope`.
- **`/classify` and `/review` spend on load in one case each:** `/classify` when some tracks have no
  category, `/review` when there are no categories (it proposes). Neither is true tonight. The nav and
  home check `/api/status` and never link either one in that state. A typed URL still would.
- ~~**`/api/llm/propose` is a GET.** Pasting it in the address bar starts a paid run and overwrites your
  categories.~~ FIXED `0db0d6b`: a typed URL, bookmark or new-tab link to the paid or destructive routes
  (propose, classify, reclassify, apply, label POST) gets 403 "Request must come from the app". `curl`
  sends no `Sec-Fetch-Site` header and is still allowed.
- Nothing outside `/label` touches `data/labels/labels.jsonl`.
- Nothing outside `/apply` writes to Spotify.
- **`GET /api/status` is the safe state check.** It only reads `cache.json` and never refreshes the
  token.

### Origins matter

The OAuth callback sets `sorter_access_token` on `127.0.0.1` only (`app/api/auth/callback/route.ts:71`).
`localhost` and `127.0.0.1` are separate cookie origins.

| Route                                      | On `localhost` without the cookie                     |
| ------------------------------------------ | ----------------------------------------------------- |
| `/api/spotify/playlists`, `/scan`, `/diff` | Fine: falls back to the refresh token in `cache.json` |
| `/api/spotify/playlist-tracks`             | Fine since `7a44e6b`: same refresh-token fallback     |

Before `7a44e6b` the symptom was a list that loaded while every track preview said
`Couldn't load tracks: HTTP 401`. Now a missing or expired cookie (it lasts 3,600s) only costs an extra
token refresh. A preview that does fail says "Spotify didn't send this playlist." with **Try again**. For a
fresh cookie: `http://127.0.0.1:3000/` → **Reconnect Spotify**.

`pnpm start:open` does the right thing already: `next dev -H 127.0.0.1 -p 3000` plus auto-open
(`start.ts:4`).

---

## Getting around: the site nav

New in the UI pass (`fd877a2`). Before it, nothing linked `/review`, `/classify`, `/apply` or `/label`.

A text row at the top of every page except `/`, `/setup` and `/label`: **SpotifySorter** (→ `/`), then
**Sources · Categories · Fit · Apply**, then **Labels** at the right.

| Item          | Goes to     | A link only when                   | Why                                                                 |
| ------------- | ----------- | ---------------------------------- | ------------------------------------------------------------------- |
| SpotifySorter | `/`         | always                             |                                                                     |
| Sources       | `/scope`    | a Spotify refresh token is on disk | `/scope` reads Spotify. Also marked current on `/scan` and `/diff`. |
| Categories    | `/review`   | categories > 0                     | With none, `/review` proposes (paid) on load.                       |
| Fit           | `/classify` | categories > 0 **and** 0 unsorted  | With unsorted tracks, `/classify` classifies (paid) on load.        |
| Apply         | `/apply`    | same as Fit                        |                                                                     |
| Labels        | `/label`    | always                             |                                                                     |

- A locked step is grey text (`<span role="link" aria-disabled>`), not a link.
- The nav asks `GET /api/status` again on every page change. Steps stay unclickable until it answers;
  their colour keeps the last answer meanwhile.
- **Tonight all four steps are links** (41 categories, 0 unsorted, token on disk). From `cache.json`; the
  nav itself was not loaded.
- **Nav lock:** while a page runs a job, every item goes grey and inert, wordmark and Labels included.
  Jobs: a scan, a propose, a classify run, a `/review` save, the Apply write. The items come back when
  the job ends.
- `/scan` and `/diff` are never nav targets.
- Hidden on `/label` on purpose: leaving and coming back resets its in-memory Hide choice. `/label` has
  its own **← Home**.
- The Next.js dev badge is off (`devIndicators: false`, `next.config.ts:7`). It sat on top of the bottom
  action bar.

**Bottom action bar.** `/scope`, `/review` and `/classify` pin their main control to a bar at the bottom
of the screen, with a one-line status beside it: **Scan**, **Classify**, and the slider plus **Apply to
Spotify**. The control moved there; it is not duplicated on the page.

---

## The 60-second tour

All safe. Nothing spends, nothing writes to Spotify, nothing touches the label file.

1. `http://127.0.0.1:3000/` — home. "3,172 tracks, sorted into _41 categories_." Don't click **Reconnect
   Spotify**.
2. **Sources** → `/scope` — 106 rows. Untick one and watch the bar read `105 of 106 sources`. Click a
   row's track count for a preview. Don't press **Scan**.
3. **Categories** → `/review` — 41 numbered rows. Click one open, rename it, **Close**. Click
   **Classify**, read the modal, click **Not yet**. Refresh to drop the rename.
4. **Fit** → `/classify` — free tonight: nothing is unsorted, so no run starts. Pick playlists in the
   index, drag the slider. Clicking a song opens a "Move … to…" dialog; **Cancel** it. Picking a
   destination writes.
5. **Apply** → `/apply` — the page is the confirmation. Read the list. **Don't press Apply.**
6. **Labels** → `/label` — ⚠️ it now opens straight onto a live Relabel song. Look, press nothing, leave by
   **← Home**.

Skip `/scan` and `/diff` on a short tour: `/scan` starts a real library read on load, and `/diff` is only
reachable from a scan or by typing the URL.

---

## State on disk right now

Re-read from `data/` at ~03:55 EDT.

|                  |                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache            | `data/cache.json`, version 2, 2.6 MB, last written 01:24 EDT                                                                                                  |
| Tracks / artists | 3,172 / 1,476                                                                                                                                                 |
| Categories       | 41, **all** with `spotify_playlist_id: null`                                                                                                                  |
| Assignments      | 3,172 (every track), **0 overrides**, **0 unsorted**                                                                                                          |
| Runs             | **8**: 2 propose, 6 classify. All completed.                                                                                                                  |
| Last run         | 2026-09-23 04:08:02Z, $0, "All 3172 tracks already classified — no Claude call needed." A `/classify` visit before the UI pass wrote it; visits no longer do. |
| Last paid run    | 2026-09-23 02:27:56 → 02:29:30Z, "Classified 297 new tracks. 2875 reused from cache.", $0.1747                                                                |
| Last propose     | 2026-05-16, $0.1369                                                                                                                                           |
| Scope            | 105 included, 0 excluded, Liked Songs on                                                                                                                      |
| Snapshots        | 106 (105 in scope + 1 orphan `7kTRhp8EjPGEHyfDf3vx1o`)                                                                                                        |
| Liked Songs      | 189 tracks, fetched 02:24:40Z                                                                                                                                 |
| Config           | prefix `✨`, threshold 65, `claude-haiku-4-5-20251001`                                                                                                        |
| Labels           | 491 rows in `labels.jsonl`, 0 of them pass 2. The 30 relabels opened 04:11–04:40Z (00:11–00:40 EDT).                                                          |
| Live Spotify     | 105 owned playlists, **zero** starting with `✨` (live check 09-22; nothing has applied since)                                                                |

---

## `/` — home

The front door, rebuilt for returning users (`8a7c6c8`). It is rendered on the server from the same
reader `/api/status` uses (`app/page.tsx:15`), so it never offers a page the nav keeps locked. It reads
the cache and never writes it.

**Tonight** (from the code and `cache.json`; the page was not loaded): the headline
"3,172 tracks, sorted into _41 categories_.", one line "None on Spotify yet.", and one brass action,
**Apply to Spotify**. At the right (below the action on a phone): **Categories**, **Labels**, **Check for
new tracks**, then a smaller **Reconnect Spotify**. This assumes the keys are still configured:
`/api/config` said `{"configured":true}` on 09-22 and was not re-checked.

The main action depends on state (`src/components/home/HomeView.tsx:17-24`, first match wins):

| State                           | Main action                                           | Where it goes                |
| ------------------------------- | ----------------------------------------------------- | ---------------------------- |
| Keys not configured             | Set up                                                | `/setup`                     |
| No tracks yet, or no categories | Connect Spotify (no token) / Choose playlists (token) | OAuth / `/scope`             |
| Some tracks unsorted            | Sort N tracks                                         | cost modal, then `/classify` |
| No token on disk                | Connect Spotify                                       | OAuth                        |
| Some categories not on Spotify  | **Apply to Spotify** (tonight)                        | `/apply`                     |
| All on Spotify                  | Check for new tracks                                  | `/scope`                     |

Other headlines: a first run gets "Sort your _library_ into vibes that mean something." plus one
explaining sentence; unsorted tracks give "_N of M_ tracks sorted."; everything applied gives
"_41 playlists_ on Spotify."

| Control                         | Result                                                                                                                                             | Tag                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Apply to Spotify**            | → `/apply`, which writes nothing on load.                                                                                                          | SAFE                               |
| **Categories**                  | → `/review`. Shown only when categories exist, so it never starts a propose.                                                                       | SAFE                               |
| **Labels**                      | → `/label`. Same condition. ⚠️ Lands on a live Relabel song.                                                                                       | SAFE to open                       |
| **Check for new tracks**        | → `/scope`.                                                                                                                                        | SAFE                               |
| **Reconnect Spotify**           | Full page load → PKCE → Spotify (flashes through, you've approved before) → lands on `/scope`.                                                     | **WRITES** `cache.json` auth block |
| **Sort N tracks** (not tonight) | Opens the cost modal: "Claude sorts only the N tracks without a category." **Proceed** → `/classify`, which starts a paid run. **Not yet** closes. | **SPENDS** on Proceed              |

~~Nothing below the button: `ResumePrompt` renders only when the last run has `completed_at: null`.~~
`ResumePrompt` and `ResumeBanner` were deleted in `8a7c6c8`. Their "Resume" went straight to a paid
`/classify` and "Start fresh" cleared nothing. They never rendered on real data. The main action covers
what they were for.

**What Connect / Reconnect actually does** (`app/api/auth/login/route.ts`):

1. If the host isn't `127.0.0.1:3000`, 307 to the canonical origin first.
2. Mints a 128-char PKCE verifier (`randomBytes(64)` → base64url → sliced) and a 16-byte state, both
   into HttpOnly / SameSite=Lax / **Max-Age=600** cookies. No client secret anywhere.
3. 307 to `accounts.spotify.com/authorize` with scopes `playlist-read-private
playlist-read-collaborative playlist-modify-private user-library-read user-read-private`. There
   is **no `playlist-modify-public`**: every playlist this app creates can only be private.
4. The callback verifies state, exchanges the code, overwrites `auth.refresh_token` +
   `auth.expires_at` in `cache.json`, sets `sorter_access_token` (1 hour), clears the PKCE cookies,
   307s to `/scope`.

**You can skip it.** Typing `/scope` works with no cookie at all: every Spotify route calls
`ensureFreshToken(session)`, and with no session it falls back to the refresh token already on disk
(`src/lib/spotify/client.ts:12-34`). A missing cookie is not logged-out. Cost: an extra refresh
round-trip, and `cache.json` gets rewritten.

**To check state without clicking anything:**

```
curl -s http://127.0.0.1:3000/api/status
```

Expect `{"configured":true,"connected":true,"tracks":3172,"categories":41,"unsorted":0,"applied":0,"version_mismatch":false}`
(derived from `cache.json`; the route was not called). `connected` only means a refresh token is on disk,
not that Spotify still accepts it. For the token's expiry, the older check still works:

```
curl -s http://127.0.0.1:3000/api/cache | python3 -c "import sys,json; print(json.load(sys.stdin)['auth'])"
```

Expect `{'has_token': True, 'expires_at': '…'}`. The route strips the refresh token itself, so it's safe
on a shared screen.

**Rough edges here:**

- ~~**Denying on Spotify's screen shows no error.**~~ FIXED `8a7c6c8`: `/?error=denied&detail=…` now
  shows one rust line, "Spotify didn't connect (access_denied)." above Connect Spotify, or "Spotify didn't
  reconnect (access_denied)." beside Reconnect when a token is already stored. `detail` is shown only if
  it looks like an OAuth code. From code; the deny path was not run.
- **PKCE cookies expire in 10 minutes.** Leave Spotify's approval screen sitting for 11+ minutes and
  the callback returns raw JSON, `{"error":"state mismatch"}`, HTTP 400. There is still no styled error
  page in the auth flow (out of scope for the UI pass). Recovery: back to `/`, click Reconnect.
- ~~**`<button>` nested inside `<a>`.**~~ FIXED `8a7c6c8`: the OAuth action is a plain `<a>` styled as a
  button, one Tab stop.
- **The headline serif is a system font.** `app/fonts/` holds only a README; Editorial New was never
  downloaded, so `--font-display` falls through to Iowan Old Style (`app/globals.css:30-31`).
  Documented and intended.

---

## `/setup` — the wizard you can't reach

**Tonight:** a flash of the first step, then an immediate jump back to `/`. The flash shows the step list
`01 Spotify app · 02 Client ID · 03 Anthropic key · 04 Prefix` and the title "Make a Spotify app." The
client fetches `/api/config`, sees `configured: true`, and calls `router.replace("/")`. No site nav here.

**You cannot demo this without breaking your working config.** For narration only:

| Step             | Gate                                     | Notes                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Spotify app   | Continue always on                       | Shows the Redirect URI, which must be exactly `http://127.0.0.1:3000/api/auth/callback`, with a **Copy** button ("Copied" for 1.6s).                                                                                                                     |
| 02 Client ID     | ≥ 20 chars, checked on Continue          | Short: "That's N characters; a Client ID is 32." SAFE                                                                                                                                                                                                    |
| 03 Anthropic key | `sk-ant-` prefix                         | Continue POSTs `/api/llm/validate`, a real 1-token Anthropic call. **SPENDS** (a fraction of a cent). A 401/403 says "Anthropic rejected that key."; any other failure says "Couldn't check the key with Anthropic." and the button reads **Try again**. |
| 04 Prefix        | non-empty, ≤ 8 chars (field capped at 8) | **Save** **overwrites `.env.local`** with exactly two lines and patches `config.prefix`. **WRITES, destructive.** Failure says "Couldn't save the settings." or "Couldn't reach the app to save."                                                        |

New in `cd9d689`: **Back** on steps 2–4 (keeps what you typed), Enter submits, and success replaces the
page with home so browser Back doesn't reopen setup.

**If someone asks you to re-run setup live, say no.** `POST /api/config` rewrites `.env.local`
wholesale (`route.ts:32`) and the dev server restarts on `.env` change. You'd drop mid-demo.

~~Dead reference: step 4's copy says "You can change this later in Settings" (`PrefixStep.tsx:15`).~~
FIXED `cd9d689`: the line is gone. Step 1's "the app's Settings" means the Spotify developer app's
settings page, which is real.

---

## `/scope` — pick what to read

Choose which playlists Claude may read. Read-only against Spotify; writes only the `scope` block of
`cache.json`. Reach it from the nav's **Sources**, home's **Check for new tracks**, or `/diff`'s **Change
sources**.

**Tonight:** title "What should I read?", then "Loading your playlists…" for ~1 second (measured
0.91–1.33s on 09-22), then a list. Liked Songs (a heart) sits above a hairline, then 105 playlist rows:
checkbox, 40px cover, name, track count. On desktop the filter and bulk buttons sit in a sticky left rail.
The bottom bar reads `106 of 106 sources` beside **Scan**. Your saved scope is restored; tonight that is
everything, 0 excluded.

`PlaylistCheckboxCard`'s two-column card grid (brass border and brass check on every card, eye icon on
every card) was replaced by these rows in `faeb870`.

| Control                                                      | Result                                                                                                                                                                                                                                                                                                                    | Tag                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Click a row (box, cover or name)                             | Toggles. A left-out row dims to 40%. Bar → `105 of 106 sources`.                                                                                                                                                                                                                                                          | SAFE                                 |
| **Deselect all**                                             | Every row dims, the bar says `Pick at least one source.`, Scan is disabled.                                                                                                                                                                                                                                               | SAFE                                 |
| **Select all**                                               | Back to `106 of 106 sources`.                                                                                                                                                                                                                                                                                             | SAFE                                 |
| **Filter playlists**                                         | Case-insensitive substring on name. `piano` → 2. `japanese` → **12**. `zzz` → 0 plus `No playlists match “zzz”.` **Clear** inside the field, or Escape, empties it.                                                                                                                                                       | SAFE                                 |
| Bulk buttons while filtering                                 | Read `Select these 12` / `Deselect these 12` (`this one` for a single match) and touch only the rows on screen. Liked Songs is left alone. Disabled when they'd change nothing.                                                                                                                                           | SAFE                                 |
| A row's track count (`116 tracks`; `Preview` on Liked Songs) | Opens the preview: the playlist's name, `N tracks` once loaded, a numbered list (`01`, `02`…). ~1s for a small playlist; `chills` (291 tracks) needs 6 sequential Spotify pages. Fetches the whole playlist, not a sample.                                                                                                | SAFE (read-only GET)                 |
| **Include** / **Leave out** in the preview                   | Toggles that row without closing.                                                                                                                                                                                                                                                                                         | SAFE                                 |
| Close the preview                                            | **Close**, the backdrop, or Escape. Focus returns to the count you clicked.                                                                                                                                                                                                                                               | SAFE                                 |
| A failed preview                                             | "Spotify didn't send this playlist." with **Try again**.                                                                                                                                                                                                                                                                  | SAFE                                 |
| **Scan** (bottom bar)                                        | PATCHes `{included, excluded, include_liked_songs}` and goes to `/scan` only after an OK answer. While it saves, the label stays "Scan" and the rows, bulk buttons and preview toggle freeze. A failed save says "Couldn't save your choice. Nothing was read." With no changes it rewrites the identical 105 / 0 / true. | **WRITES** `cache.json` (scope only) |
| **Skip to Scan**                                             | Keyboard only: hidden at the end of the filter rail until focused, then jumps to Scan.                                                                                                                                                                                                                                    | SAFE                                 |

One filter quirk, by design: the **Liked Songs row never filters out**. It sits outside the filtered
list, so with `zzz` you see it _and_ the no-matches line. ~~Select all / Deselect all ignore the
filter.~~ FIXED `faeb870`: see the bulk-button row above.

~~Scan is a text link 64px below the grid. Easy to scroll past.~~ Scan now lives in the bottom bar and is
always on screen.

The preview's count is **≤** the row's: the row shows Spotify's raw total, the preview counts only
tracks that survive normalisation (local files, null ids and artist-less rows are dropped).

**Looks broken, isn't:**

- **"Japanese Pop Hits" appears 6 times.** Six genuinely different playlists sharing one name: six
  distinct ids, five with 10 tracks and one with 8. Confirmed live on 09-22: 105 playlists, 105 distinct
  ids, zero duplicates. Commit 451f04f deduped on **id**; this is not that bug returning. (The _filter_
  `japanese` returns 12 rows because "backup japanese", "Japanese Pop Mix" and "Japanese Music Mix" also
  contain the word.)
- **`Imported` has no cover.** It's the only playlist with `cover_url: null`. It used to render a blank
  grey square; since `faeb870` the square shows the name's first letter, `I`, in the display serif.
- **Liked Songs shows no track count.** Its button reads `Preview` instead: the only count available is a
  fingerprint from the last scan, which could be stale.
- **`cache.json`'s mtime changes just from opening `/scope`.** Any Spotify-backed request without a
  live cookie refreshes the token, which re-saves the whole cache (`src/lib/spotify/client.ts:25-33`).
  Not corruption. (`/api/status` never does this.)

**Real rough edges:**

- ~~**`/scope` never loads your saved scope.**~~ FIXED `faeb870`: exclusions and the Liked Songs choice
  come back from `GET /api/cache` (only `scope` is read). A playlist made since the last save starts
  selected. An unreadable cache falls back to everything selected.
- ~~**`/scope` fails silently if auth dies.**~~ FIXED `faeb870`: a Spotify failure shows "Spotify didn't
  send your playlists." with Spotify's message in small type, **Try again** and **Reconnect Spotify**, and
  no list and no Scan. If `/api/status` says no token is stored, it shows "Spotify isn't connected." with
  one **Connect Spotify**.
- A request that hangs with no answer still shows "Loading your playlists…" indefinitely. No timeout was
  added.

---

## `/scan` — read the library

**It starts on mount. There is no confirm step.** Typing `/scan` in the address bar fires a real scan.
The only in-app way here is **Scan** on `/scope`.

**Tonight:** title `Reading your library…` and a stage list: `Playlists`, `Liked Songs`,
`Artist genres`. The active stage is cream. Once the server has counted, it also shows `38 of 105` with a
hairline bar under it. Finished stages turn grey. The site nav is locked while it reads.

**How long:** last night's run spanned **43.2 seconds** (first snapshot write 02:23:57.752Z → liked
fingerprint 02:24:40.981Z) and re-fetched 20 playlists. If nothing changed since, all 105 snapshot
ids match and every playlist is skipped: 106 quick metadata calls, so roughly 30–60 seconds.

**What it writes:** updated `playlist_snapshots` and `liked_songs_fingerprint`. If a playlist changed,
its tracks merge into `cache.tracks` (existing entries are never overwritten, only added) and its
artists into `cache.artists`. **WRITES** `cache.json`. No Spotify writes, no Claude call, no money.

**On finish:** the title becomes `3,172 tracks from 1,476 artists.`, and after **900ms** the page
replaces itself with `/diff`, because `cache.runs` is non-empty (8 entries). A first run goes to
`/review` instead. Since `7b9a991` this is `router.replace`, so browser Back from `/diff` returns to
`/scope`, not into a second scan.

**If it fails**, the title says what went wrong (`src/lib/scan/error-kind.ts`):

| Title                          | Line under it                                     | Buttons                                                  |
| ------------------------------ | ------------------------------------------------- | -------------------------------------------------------- |
| Spotify asked us to slow down. | Give it a minute.                                 | **Scan again**, Change sources                           |
| Spotify signed you out.        |                                                   | **Reconnect Spotify** (OAuth; **WRITES** the auth block) |
| Nothing to read.               | The sources you picked hold no tracks.            | **Change sources**                                       |
| The scan stopped.              | a collapsed **Details** with the server's message | **Scan again**, Change sources                           |

**Scan again** re-runs the read in place: a real scan, same tags as above.

**Gotchas:**

- **Don't close or reload the tab mid-scan.** `docs/superpowers/plans/2026-05-15-cache-efficiency-plan.md`
  records the hypothesis that Next aborts the route handler when the browser drops the EventSource,
  before `writeCache` runs.
- ~~**The progress total jumps 106 → 105 on the first tick.**~~ No longer visible since `7b9a991`: a count
  shows only once the server has counted something. The server still sends 106 first and 105 after.
- **Dev-mode double-mount.** React StrictMode is on by default in App Router, so the effect mounts
  twice and opens two EventSources. The first is closed at once and the UI listens to the second, so the
  screen is correct; expect stray stream errors in the dev terminal. `/api/spotify/scan` has no
  single-flight guard. _(Mechanism CONFIRMED from config and code; the doubled runtime is ASSUMED — no
  scan was run.)_
- **A rate-limited snapshot check silently becomes a full re-fetch.** `scan.ts` swallows any snapshot
  error, including a 429, and falls through to a complete playlist fetch. Throttling makes the scan
  slow, not failed.
- **No way out during the scan.** No link, and the nav is locked. There is no Stop button, on purpose:
  stopping the server job is unverified.
- The old empty-scope screen ("Your scope is empty…" + "← Change scope") is gone. `Nothing to read.`
  shows only if the cache ends the scan with zero tracks. `/scope` can't save an empty scope (Scan is
  disabled at 0 selected).

---

## `/diff` — what changed

Read-only. Nothing here mutates your account.

**No nav links to it.** Type the URL, or arrive from `/scan`. The nav marks **Sources** as current here.

**Tonight:** within ~50 ms (it reads the cache, not Spotify) you get **"Nothing new to sort."** and three
actions: **Tune the fit** (brass, → `/classify`), **Edit categories** (→ `/review`) and a small **Change
sources** (→ `/scope`). Under them a footnote, "Checking Spotify for removed tracks…", stays for ~41
seconds and then disappears if nothing was removed. On 09-22 `GET /api/spotify/diff` returned
`{"added":[],"removed":[],"existing_category_count":41,"is_first_run":false}`.

Rebuilt in `b287507`. The old "Your library is unchanged." screen with its single "← Back to start" link
was a dead end, and "unchanged" was wrong after a real re-scan: the diff route compares against a cache
the scan has already updated, so `added` is ~always empty. The page no longer reads `added`; it counts
unsorted tracks instead.

**The Spotify check still takes ~41 seconds**, but nothing waits for it now. Measured **41.3s** on 09-22.
The route re-downloads the full track list of all 105 source playlists plus Liked Songs and
deliberately ignores `playlist_snapshots` (`app/api/spotify/diff/route.ts:24-33`). The old "~5s
expected" caption is gone. In dev it now sends that request once per visit, not twice.

| Control (tonight)   | Result                                                              | Tag  |
| ------------------- | ------------------------------------------------------------------- | ---- |
| **Tune the fit**    | → `/classify`. Offered only when nothing is unsorted, so it's free. | SAFE |
| **Edit categories** | → `/review`. No LLM call on load.                                   | SAFE |
| **Change sources**  | → `/scope`.                                                         | SAFE |

Other states you won't see tonight:

| When                                  | Screen                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Some tracks have no category          | "Waiting to be sorted.", the newest 8 of them (title · artist), "and N more", then **Sort N tracks** in place of Tune the fit. It opens the cost modal; **Proceed** → `/classify`, which **SPENDS**. |
| Tracks were removed from your sources | "12 tracks are no longer in your sources." then up to 5 titles, "… and 7 more." Once any playlist exists on Spotify it adds "Apply never takes tracks out of your ✨ playlists."                     |
| The Spotify check failed              | "Couldn't check Spotify for removed tracks." with **Try again**, which re-runs only that check (~41s).                                                                                               |
| Cache unreadable                      | "Couldn't read your library." with **Try again**.                                                                                                                                                    |
| Cache from another version            | Same title, "Your library file is from another version of SpotifySorter.", and **Home**.                                                                                                             |
| No categories                         | Redirects to `/review`, which proposes on load (**SPENDS**, no price shown). The redirect no longer waits for Spotify first.                                                                         |

~~**Apply with existing categories**~~ was replaced by **Sort N tracks**: its label said Apply, but it
started a paid classification with no price shown.

`/diff` has **no cross-site guard**. It's a read, so that's harmless, but an interviewer might spot the
inconsistency.

---

## `/review` — edit the categories

The only screen where the category list itself is editable. Rebuilt in `004f796` as a numbered index,
one line per category, instead of 41 tall cards.

**Reach it:** the nav's **Categories**, home's **Categories**, `/diff`'s **Edit categories**, or
`/classify`'s **Back to categories** after a failed run.

**Tonight:** the page is blank while `/api/cache` loads. The old flash of "Thinking / Proposing
categories…" is gone: it claimed Claude was working while the page was only loading. **No Anthropic call
happens.** The page proposes only when `cache.categories` is empty
(`src/components/review/useCategorySource.ts:117-124`), and you have 41.

Then: title "**41 categories. Edit anything.**", 41 rows staggering in (`01`…`41`, name in serif, a
one-line description on desktop), a last row `42  Add a category`, a small **Re-propose** under the list,
and the bottom bar with **Classify**. The old eyebrow, stat footer and "Last propose 129d ago · $0.14" are
gone.

| Control                                     | Result                                                                                                                                                                                                                                                         | Tag                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Click a row                                 | Opens it in place. Name and description become fields, focus goes to the name, Enter moves to the description. Below: the sample tracks, then **Add track · Merge into… · Delete · Close**. Escape or Close collapses it.                                      | SAFE                                                                                |
| Edit the name                               | Local draft. An emptied name reverts when you leave the field. A duplicate says "Another category is called this.", turns rust and disables Classify.                                                                                                          | SAFE locally                                                                        |
| Edit the description                        | **Now possible** (it wasn't before the UI pass). It matters: the description **is** what the classifier sees (`src/lib/pipeline/classify.ts:29-35`); the sample tracks are not.                                                                                | SAFE locally                                                                        |
| **Delete**                                  | The row is replaced by "Deleted X." with **Undo**. Undo reverses only that one change.                                                                                                                                                                         | SAFE locally, **irreversible once saved**                                           |
| **Merge into…**                             | A filter box over the other categories. Enter merges when one match is left, otherwise moves to the first match; arrows walk the list; Escape cancels. Leaves "Merged X into Y." with **Undo**. The target keeps its id (`src/lib/categories/merge.ts:19-21`). | SAFE locally, **irreversible once saved**                                           |
| Drag a closed row onto another (mouse only) | The bar says "Merge A into B" while you drag; dropping merges the same way. Touch and keyboard use Merge into….                                                                                                                                                | SAFE locally                                                                        |
| **Add track**                               | Dialog "Add tracks to _Name_", autofocused search "Search your scanned library…". Empty query → first 50; typing filters title and artist, capped at 100. Tracks already in it are dimmed with a small tick.                                                   | SAFE, and **purely cosmetic**: `example_track_ids` are never sent to the classifier |
| **Add a category**                          | The last row opens a name + description form; Enter or **Add** appends it with a fresh `crypto.randomUUID()`, Escape or **Cancel** closes. Duplicate names are blocked.                                                                                        | SAFE by itself, **arms a paid re-score** (below)                                    |
| **Classify** (bottom bar)                   | Opens the cost modal only. The bar's status line says what's unsaved: "Unsaved: 1 deleted · 1 renamed · 1 new · 1 edited".                                                                                                                                     | SAFE                                                                                |
| **Re-propose**                              | Opens the second cost modal only.                                                                                                                                                                                                                              | SAFE                                                                                |
| **Refresh the page**                        | Drops every unsaved edit.                                                                                                                                                                                                                                      | SAFE                                                                                |

### The Classify modal — tonight

With no edits and 0 tracks unsorted:

```
$0.00
Every track already has a category, so Claude isn't called.
[Proceed]  [Not yet]
```

With edits, the modal adds what saving will do: "This also deletes N categories: …" in rust, "Renames N
categories: A → B", a line that the labelling page needs one heading per category in `definitions.md`
and will refuse to load until it matches, and notes such as "Tracks already placed in a deleted category
don't move; any that fit nothing else end up in no playlist." A new category also prices the re-score:
"Claude re-scores your 3,172 placed tracks against X."

- **Not yet** — closes cleanly. SAFE.
- **Proceed** — Classify reads "Saving…", the list dims, the nav locks. It PATCHes the whole category list
  into `cache.json`, replacing what's there (`_clear: ["categories"]`, `f6db73d`), then goes to
  `/classify`. Tonight `/classify` starts no run and writes nothing. **WRITES** `cache.json`. It never
  writes to Spotify and never touches the label file. A failed save says "Couldn't save your
  categories. …" in the bar, and Classify works again.

### The Re-propose modal — do not confirm

```
$0.11 — $0.14
Deletes all 41 categories and every track's place in them, then Claude proposes new ones.
Sorting all 3,172 tracks again afterwards costs about $2.01.
The labelling page will refuse to load until definitions.md matches the new categories.
[Wipe & re-propose]  [Not yet]
```

**Wipe & re-propose** is rust, and focus starts on **Not yet**, so Enter can't wipe anything.

Confirming immediately `_clear`s `categories` and `assignments` from `cache.json`. That's the $1.68
September classify **and** tonight's $0.17. The page then reloads, finds no categories, and proposes on
its own: "Proposing categories…", "Claude is reading all 3,172 tracks. Leaving this page won't stop it.",
a **← Home** link, the nav locked. The propose takes ~2 min, costs ~$0.14, and writes brand-new
categories with new ids and new names. **SPENDS + destroys real data + breaks `/label`.**

New names mean `data/labels/definitions.md` (41 headings, exact-name match) no longer resolves, `/label`
throws `DefinitionsError` (`src/lib/labeling/definitions.ts:45-50`), and the 491 rows in `labels.jsonl`
are keyed to category ids and a definitions sha that no longer exists. **The backup is not an undo**:
`~/spotifysorter-backup-0918/cache.json` is the _older_ world (45 categories, 2,875 tracks), so
restoring it loses the current classification. If propose fails partway you're left with zero categories
and zero assignments, because the wipe lands before the LLM call. The failure screen, "Claude couldn't
propose categories.", offers **Try again**, which proposes again and **SPENDS** again.

### Real bugs you can hit here

- ~~**Deleting or merging a category does not persist.**~~ FIXED `f6db73d`: the save now replaces the
  whole category map, so deletes and merges stick. That is why "Classify → Proceed after a Delete" is in
  [Read this first](#read-this-first).
- **"Add a category" → "Classify" is still a likely-fail spend, but no longer a silent one.** The modal
  now prices the re-score (about $0.08–$0.12 by `src/lib/categories/rescore-cost.ts`). Proceed saves the
  categories, **new one included**, then POSTs `/api/llm/reclassify`, which scores **all 3,172 placed
  tracks against the new category in one request with `max_tokens: 4000`**
  (`src/lib/llm/reclassify.ts:51`). 4,000 output tokens hold roughly 150 score entries, so the reply
  likely truncates and the route 500s. The page now checks: the bar says "Re-scoring against X failed;
  your categories are saved. The server answered 500." in rust and stays on `/review`. You pay for the
  call, and the saved new category breaks `/label` until `definitions.md` has its heading. _(ASSUMED —
  this path has not been run.)_ **Don't demo it.**
- **After an Apply, saving here forgets the playlist ids.** The save writes `spotify_playlist_id: null`
  for every category (`src/lib/categories/patch-body.ts:36`). Home would drop back to "None on Spotify
  yet.", and the next Apply finds playlists by exact name, so a renamed category would get a second
  playlist. From code, never run. Irrelevant until the first Apply.
- **Every visit downloads the whole cache** into the browser: all 3,172 tracks and 3,172 assignment rows
  (~1.5 MB measured 09-22). The page stays blank until it arrives.

### Looks broken, isn't

- ~~**"Samples · estimated 5" but only 2–4 rows.**~~ Gone with the UI pass. The over-label was removed.
  An opened row lists only the sample ids that exist in the cache (**28** of the proposer's 208 ids are
  hallucinated, e.g. `2After Dark`), with no count to contradict.
- ~~**The drag handle overlaps the trash icon area.**~~ Gone: the icon-only trash and the hover grip were
  replaced by the Delete and Merge into… text actions inside an opened row.
- ~~**"Last propose 129d ago" ignores classify runs.**~~ The line was removed.
- **Blind-label guard:** `/review` shows no per-song scores or ranks, and none of the 30 songs awaiting
  their second labelling pass appear as sample tracks in any row. Demoing this page does not contaminate
  the study.

---

## `/classify` — tune the fit

Score unclassified tracks against the 41 categories, then set a confidence threshold and move songs
between playlists before anything reaches Spotify. Rebuilt in `5b20d1a`.

**Reach it:** the nav's **Fit**, `/diff`'s or `/apply`'s **Tune the fit**, **Proceed** on a `/review` or
**Sort N tracks** cost modal. The page's own "← Categories" link was dropped; the nav covers it.

**It reads the cache first, and opens the paid stream only when some tracks have no category**
(`src/components/classify/useClassifyRun.ts:85-95`). Before the UI pass it opened
`EventSource("/api/llm/classify")` on every visit. It never retries on its own. The only cost modals are
on `/review`, home and `/diff`.

**Tonight nothing is unsorted**, so no stream opens, no Claude call is made, and no run row is written.

**What you'll see:** a blank beat while the cache loads, then the title **"Tune the fit."** and a numbered
index of the 41 playlists (`01`…`41`) with a count each. On a wide screen the selected playlist's songs
sit beside it; under 768px each playlist opens in place, one at a time. The bottom bar holds the
**Confidence** slider, a one-line status, and **Apply to Spotify**. The boxed run banner with "Dismiss"
is gone. After a paid run on this visit, the status line says "Sorted N tracks for $X.XX".

| Control                                                              | Result                                                                                                                                                                                                                                                                    | Tag                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Pick a playlist in the index                                         | Shows its songs as numbered rows, 100 at a time (50 on a phone), with **Show N more**.                                                                                                                                                                                    | SAFE                                     |
| Confidence slider                                                    | A native range: drag, arrows, Page Up/Down, Home/End. Pure client-side recount. The status turns gold: "Confidence isn't saved until Apply to Spotify."                                                                                                                   | SAFE                                     |
| Click a song                                                         | Opens "Move ‘X’ to…": a filter and every other playlist in library order. **Cancel** or Escape closes. Enter picks only after you've typed a filter.                                                                                                                      | SAFE until you pick                      |
| Pick a destination, or drag a song onto an index row (mouse, ≥768px) | Pins the song to that one playlist (`assignments[trackId].override`) and PATCHes at once. The status says "‘X’ → Y. Also left 2 other playlists." with **Undo**. Dropping a song on its own playlist does nothing. A failed save puts it back: "Couldn't save that move." | **WRITES** `cache.json`                  |
| **Undo** in the status line                                          | Re-saves the song's whole previous assignment, so the override goes back to none. Only while that line is showing; the next move or note replaces it.                                                                                                                     | **WRITES** `cache.json`                  |
| **Apply to Spotify**                                                 | PATCHes only `config.confidence_threshold`, then goes to `/apply`. Doesn't itself touch Spotify. A failed save says "Couldn't save the setting. Try again."                                                                                                               | **WRITES** `cache.json` (threshold only) |

**Slider stops, recomputed against tonight's 3,172 assignments:**

| Threshold        | Category slots | Notes                                                                                                                                                            |
| ---------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0                | 15,860         |                                                                                                                                                                  |
| 50               | 15,378         |                                                                                                                                                                  |
| **65** (default) | **12,194**     | biggest _Bedroom Pop Intimacy_ 1,442, _Soft Pop Ballads_ 1,412, _Singer Songwriter Intimate_ 840, _Dream Pop Ethereal_ 823; smallest _Stutter House Rhythmic_ 14 |
| 80               | 4,148          |                                                                                                                                                                  |
| 100              | 3,172          | exactly one playlist per track                                                                                                                                   |

12,194 at the default means the average track lands in ~3.8 playlists. For roughly one playlist per
track at `/apply`, push the slider to ~90–100 first, then press **Apply to Spotify** so it's saved.

**Looks broken, isn't:**

- ~~**"0 of 1 batches"** for the first second.~~ Gone: during a paid run the title is "Listening through
  your library…" with a progress bar, and `N of M` appears only after the first batch reports.
- **Counts barely drop as you raise the slider on small playlists.** `trackPassesThreshold` falls back to
  the single top match when nothing clears the line (`src/lib/classification/threshold.ts:7-14`), so the
  slider redistributes rather than empties. A playlist that does reach 0 shows its count in gold, and its
  pane says "Nothing lands here at 65." / "Spotify will get an empty playlist."
- ~~**Two EventSource connections in the Network tab.**~~ No longer expected here: the stream opens only
  after an awaited cache read with a cancel check, so React's discarded dev mount never opens one (from
  code, not observed). `singleFlight` still makes a second visit _join_ a running job, so you'd be billed
  once.
- **Total batches can grow mid-run** ("6 of 7"): up to 3 rounds, and tracks the model left out or
  duplicated get resent, adding to the denominator.

**Real bugs:**

- **No spend cap exists.** `capUsd` lives only in `src/lib/analysis/context-run.ts`, imported solely by
  `scripts/context-test.ts` and `scripts/context-report.ts`, never by a route. The web path has an
  estimate, not a limit.
- ~~**A failed run hangs the page forever.**~~ FIXED `5b20d1a`. A server error shows **"Sorting
  stopped."**, its message, and "Tracks sorted before it stopped are saved." A dropped stream shows
  **"Lost the connection."** and "Claude may still be sorting on the server. Tracks it finishes are
  saved." Both offer **Back to categories** and **Home**. Neither retries in place, because a retry would
  re-bill without a price. The stream is closed first, so EventSource can't reconnect into a second paid
  run. An unreadable cache shows **"Couldn't read your library."** with **Home** only; no categories
  shows "No categories yet." with **Home**.
- **Closing the tab doesn't stop the run or save money.** By design (`event-stream.ts` `cancel()` only
  unsubscribes) the job continues so its writes land. In-flight calls are billed either way. The nav is
  locked during a run so a stray click can't do this by accident.
- ~~**"Apply to Spotify" silently rewrites your prefix to `✨`**~~ FIXED `5b20d1a`: it saves only the
  threshold. The prefix and model stay whatever `/setup` chose.

---

## `/apply` — the only Spotify write

**Nothing has ever been applied.** Three independent checks on 09-22: all 41 categories had
`spotify_playlist_id: null`; a live `GET /api/spotify/playlists` returned 105 owned playlists and
**zero** whose name starts with `✨`; no run row has the apply summary shape. Re-read tonight: still 0
playlist ids in `cache.json`.

(`playlist_snapshots` is a red herring here: its 106 entries are scan bookkeeping for _source_
playlists.)

**Reach it:** the nav's **Apply**, home's **Apply to Spotify**, or **Apply to Spotify** on `/classify`.
Loading the page writes nothing.

**The page is the confirmation.** `ApplyConfirmationModal` was deleted in `e0cad1f`, and "Review and
apply" went with it. Once `/api/cache` loads, it reads:

```
About to apply.
3,172 tracks into 41 new private playlists.
[Apply]   Tune the fit
```

Below that is a list of all 41 playlists, in the order the write walks them: a two-digit number, the name
without the `✨`, and its track count at the saved threshold. One column on a phone, two from 768px, three
from 1024px.

- **Apply** is disabled, and the sentence empty, until the counts load.
- **Tune the fit** shows only when nothing is unsorted; otherwise the second button is **Home**.
- When some playlists already exist, the sentence adds "and N you already have. Nothing is added twice."

| Control                                      | Result                                                                                                                                                                                           | Tag                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Tune the fit**                             | → `/classify`. Free tonight.                                                                                                                                                                     | SAFE                                                        |
| **Apply**                                    | POST `/api/spotify/apply`.                                                                                                                                                                       | **WRITES TO SPOTIFY — irreversible without manual cleanup** |
| **Try again** (after "Stopped at…")          | Re-POSTs. Every created playlist's id is already in `cache.json`, so the retry reads that playlist's current tracks and adds only the missing ones. No duplicate playlists, no duplicate tracks. | **WRITES TO SPOTIFY**                                       |
| **Reconnect** (after "Lost the connection.") | Also re-POSTs: it joins the write if it's still running, otherwise starts another pass that adds only what's missing.                                                                            | **WRITES TO SPOTIFY**                                       |
| **Home**                                     | → `/`.                                                                                                                                                                                           | SAFE                                                        |
| `GET /api/spotify/apply`                     | 405: the route is POST-only. A POST that isn't from the app's own pages gets 403 (`0db0d6b` tightened this from cross-site only).                                                                | SAFE                                                        |

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

**While it runs:** title "Placing tracks…", and a block pinned at the top, "18 of 41 · <playlist
name>" ("Starting…" before the first event), with a progress bar. In the list, written rows turn cream,
the current one is brass with an underline, and pending rows are grey. The nav is locked. There is no
Cancel: the server job can't be cancelled. **Expect several minutes**: 41 creates, ~130 add-chunks, and
41 full paginations of your playlist list for the name lookup (~1.2s each, measured). Rough estimate 2–5
minutes. **ASSUMED**: this path has never executed against this account.

**If it stops:** "Stopped at 16 of 41." ("Couldn't start." when nothing was written), the error, and
"What's written stays. Trying again picks up from there." The failed row is rust. **If the stream
drops:** "Lost the connection." / "The write may still be running." Other screens: no categories shows
"Nothing to apply yet." with Home; an unreadable cache shows "Couldn't read your library." with **Try
again** and **Home**.

**Success screen** (the one loud moment): an italic "41 new playlists", then "3,172 tracks placed.", then
all 41 names sorted by track count, descending, numbered `01`–`41`, without the `✨`. It closes with "In
Spotify desktop, select the ✨ playlists → right-click → Add to Folder.", **Open Spotify** (a `spotify:`
link) and **Home**. The old "Side A" / "Side B." labels are gone. Each name is an
`<a href="spotify:playlist:…">`; in a browser with no handler registered it may appear to do nothing.

**Double-click guard:** a second POST (double-click, second tab, refresh-and-click) joins the run in
flight and streams its progress instead of starting a second double-writing run. Opening `/apply` in two
tabs and hitting Apply in both shows this, but it still performs the real write.

**Gotchas:**

- **3,172 on the page, 12,194 in the write.** The page counts distinct songs
  (`src/components/apply/plan.ts`). The write adds 12,194 category memberships, because 3,082 of the
  3,172 songs sit in more than one playlist at threshold 65. The list's per-playlist counts add up to
  12,194.
- ~~**The modal flashes 0 / 0 / 0.**~~ FIXED `e0cad1f`: Apply stays disabled and the sentence empty until
  the counts load.
- **A second apply after a successful one** reads "3,172 tracks into 41 playlists you already have.
  Nothing is added twice." It adds nothing, so the credits say "Already up to date." with no
  tracks-placed line. From code (`SuccessCredits.tsx:26-36`); never run.
- **The apply run row has no `type` field and `cost_usd: 0`**, so `/classify`'s status line never shows
  it. Intentional; the row reads "41 created, 0 updated, 12194 tracks added."
- ASSUMED, not verified: in dev, editing a source file mid-apply can hot-reload and reset the
  single-flight module state, letting a later POST start a second concurrent run. Don't edit files
  while a real apply is running.
- Correction to earlier notes: there is no `src/lib/pipeline/diff.ts`. Diff logic lives in
  `src/lib/classification/diff.ts`; the orchestration is inline in `app/api/spotify/diff/route.ts`.

---

## `/label` — the labelling study

Four queues; each answer appends one immutable row to `data/labels/labels.jsonl`.

**Reach it:** the nav's **Labels**, or home's **Labels**. Both are new; before the UI pass nothing linked
here. The site nav is hidden on this page. **← Home** at the top left is the way out (`9ef37aa`).

**Current state** (live `GET /api/label` on 09-22; `labels.jsonl` is unchanged since 09-21 and has 0
pass-2 rows; the relabel open times were recomputed tonight):

| Queue    | Done          | Notes                                                        |
| -------- | ------------- | ------------------------------------------------------------ |
| Songs    | **100 / 100** |                                                              |
| Pairs    | **200 / 200** | 25 have `score: null`; 125 are a model "yes" at threshold 65 |
| Gold set | **190 / 190** |                                                              |
| Relabel  | **0 / 30**    | **all 30 open** since 00:40 EDT                              |

`labels.jsonl`: 491 rows = 200 pair + 191 gold pass-1 + 100 random pass-1, written 2026-09-20T00:08Z →
2026-09-21T14:36Z. 489 of 491 are `assisted: true`; 1 is `prior_exposure: true`; 0 are `cant_judge`.

### The timing trap — it has sprung

**The 48-hour gate opened between 12:11 and 12:40 AM EDT tonight.** Earliest `opens_at` was
`2026-09-23T04:11:05.824Z`, the last `04:40:16Z`. Each is a song's first pass-1 label + 48 h
(`src/lib/labeling/store.ts:88-103`, recomputed from `labels.jsonl`). No pass-2 row exists yet. So
Relabel now shows a real song with live `Save` / `Can't judge` buttons, and **Accept all suggestions is a
30-row write.** Treat Relabel exactly like the other tabs: look, never save.

### Walking it

**First paint** — no visible heading (the `<h1>` is screen-reader-only). One header row, the bulk button
under it, then a song:

```
← Home    Songs   Pairs   Gold set   Relabel                 0 / 30
                                            Accept all suggestions
```

**Relabel is pre-selected** because the page opens on the first queue with unfinished work
(`firstUnfinishedMode`), and Relabel is the only one left. With every relabel open, it now shows the first
one: a song, the model's guesses, 41 checkboxes, and the sticky bar. **Back** and **Next** are disabled
there (nothing open behind it, and Next needs an answered song). **Can't judge** and **Save** are live.
This is a writable screen, not a locked one.

A tab that isn't active shows a small count of its open items. Tonight only Relabel has any, so you see
`Relabel 30` once you switch away from it.

| Control                                     | Result                                                                                                                                                                                                                                                           | Tag                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **← Home**                                  | → `/`. Greyed and inert during a bulk run.                                                                                                                                                                                                                       | SAFE                                |
| **Songs** tab                               | Counter → `100 / 100`, "Every song is labeled.", with **Continue to Relabel** (primary) and **Back**.                                                                                                                                                            | SAFE                                |
| **Continue to Relabel**                     | Same as clicking the Relabel tab: lands on a live song.                                                                                                                                                                                                          | SAFE (navigation)                   |
| **Back**                                    | Jumps to song #100, **"dirty lies" — Naits**. This is how you see the real UI on a finished queue.                                                                                                                                                               | SAFE                                |
| Tick / untick a checkbox                    | Local state only. The line above Save lists the ticked names, or "Nothing ticked".                                                                                                                                                                               | SAFE                                |
| **Accept suggestions** (in the guess panel) | Ticks the 5 suggested boxes. **Does not save.** Genuinely different from the Pairs tab; don't carry the habit over.                                                                                                                                              | SAFE                                |
| **Hide / Show**                             | Collapses the guesses. **Session-wide and sticky** across songs and tabs until reload. The line becomes "Suggestions hidden for this song".                                                                                                                      | SAFE                                |
| **Back / Next** in the sticky bar           | Walks the queue. Back disabled at #1; Next disabled on an unanswered item, so you can't skip work. Past the last one returns to the finished line.                                                                                                               | SAFE                                |
| **Save**, **Can't judge**                   | POST `/api/label`, appends one permanent line. On Relabel tonight that is the study's first pass-2 row. Saving an already-labelled song does **not** overwrite: it adds a **second row for the same track**, exactly the duplicate that skews agreement numbers. | 🔴 **WRITES the frozen label file** |

**Song #100 shows:** big serif title, artist underneath (no genre line for Naits: no genres in cache), a
Spotify embed player that actually plays, and an accent-bordered panel, "The model's guesses — these are
what you are being compared against". The panel lists five category names, each with the model's score.
The scores are left out of this doc on purpose (blind-labelling rule). Then come **41 checkboxes** with
In/Out definitions, shuffled per song (seeded by track id) so list position can't bias you, then the
sticky bar. From 1024px the song stays in a sticky left column and the checkboxes run in one column
beside it. Between 768 and 1023px they sit in two columns.

**Pairs tab → Back** — 🔴 **the dangerous one.** Shows pair #200: **"SUICIDE" — Lil Fard**, category
**Bedroom Pop Intimacy**. The accent panel states the model's verdict for the pair ("The model scored
this … and says …", or "did not rank this category for this song — it says no"). Keep pressing Back for
more pairs.

**There is no Save button on Pairs. The answer buttons ARE the save.** `Yes`, `No` and `Can't judge` sit
on their own row and each write the instant you click, with no confirm. **"Accept suggestion" here also
writes immediately** (unlike the Songs tab). Four one-click writes on that screen. **Back** and **Next**
sit below a hairline, away from Yes. Click only those.

**Gold set → Back** — `190 / 190`, "Every gold-set song is labeled.", and Back lands on **"Chasing
Shadows" — Alex Warren**. Identical UI to Songs. Same rule.

**Relabel → "Accept all suggestions"** — shows "Save the model's answer for the 30 remaining?" on its own
row, with **Accept all** and **Cancel**. Focus starts on Cancel, so a second Enter cancels.

- **Cancel** — SAFE, brings the button back.
- **Accept all** — 🔴 **writes up to 30 pass-2 rows, now.** One request at a time. The row reads "Saving
  N of 30" with **Stop**, which takes effect between requests (the one in flight still lands). Tabs, Save,
  Can't judge, the checkboxes and ← Home are locked meanwhile. It ends with "Saved N of 30.". Don't click
  it.

**Keyboard:** no shortcuts exist anywhere in `src/components/label/`: no `1`–`5`, no Enter to save.
Everything is Tab + Space/Enter. Focus jumps to the song title on each new item. From there Tab walks the
Spotify player → Hide → Accept suggestions → 41 checkboxes → Back → Next → Can't judge → Save. Disabled
buttons are skipped. ⚠️ **On a fresh relabel song Back and Next are disabled, so one Tab past the last
checkbox lands on Can't judge: one Space is a permanent write.** Focus is a 2px brass outline.

**One-line rule:** everything that _navigates or reveals_ is free: tabs, Continue to…, Back, Next,
Hide/Show, ticking boxes, and Songs' own "Accept suggestions". Everything that _answers_ writes a
permanent line: `Save`, `Can't judge`, `Accept all`, and on Pairs also `Yes`, `No` and `Accept
suggestion`.

---

## Known rough edges

Real things you'd otherwise think you broke.

| Thing                                                                      | Why it's not your fault                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/label` opens on a live song**                                          | Relabel is the only queue with work, and all 30 opened at 00:11–00:40 EDT. Before that it opened nearly empty. Don't save; click **Songs** to see a finished queue.                                                                                                                                                                                                                                                                                                                                                          |
| **Checkboxes are empty on a song you already labelled**                    | Deliberate. `LabelApp.tsx` keeps answers for Back **in memory only** ("Never loaded from disk"). The file still has all 491 rows. Same reason Pairs never shows "Saved as yes." for Sep 20–21 work.                                                                                                                                                                                                                                                                                                                          |
| **The blindness e2e test fails, on purpose**                               | `tests/e2e/label.spec.ts:137` asserts `GET /api/label` emits no `score`, `matches`, `rank`, `bin` or `assignments` key. It fails with `GET /api/label has key "score"`. Assisted labelling (5b7bb21, 2026-09-21) put the model's scores on every GET; the guard had been unrunnable for ~27 h because the in-repo Python venv broke `next build` on 2026-09-19, and the e2e suite runs on a production build. Left failing deliberately; see commit 736780a. _(Not re-run: the spec replaces `cache.json` in its data dir.)_ |
| **491 rows vs 490 items**                                                  | One gold track (`5zcoYCmeIL392as1bwIYce`) has two pass-1 rows, so 191 gold rows across 190 gold items. Pre-existing.                                                                                                                                                                                                                                                                                                                                                                                                         |
| ~~"Accept all suggestions" on a fully-locked Relabel tab~~ FIXED `149a3f3` | The header only checks `items.some(i => !i.done)`, never whether any item is _open_. Clicking Accept all flashes `0 / 0` and does nothing. The one screen that lies to you.                                                                                                                                                                                                                                                                                                                                                  |
| ~~**The Relabel confirm survives a tab switch**~~ FIXED `149a3f3`          | Switching queues now clears the confirm (`LabelApp.tsx:147-149`).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Hide doesn't un-assist the song already on screen**                      | Once the guesses have painted for an item it's latched `assisted: true` even if you Hide before saving (`sawSuggestions` ref + page-level `seen` set). Hiding only produces blind rows for songs you reach _after_ hiding.                                                                                                                                                                                                                                                                                                   |
| **Spotify embeds**                                                         | Live `open.spotify.com` iframes. A network that blocks them shows Spotify's own error box inside the player; nothing else is affected.                                                                                                                                                                                                                                                                                                                                                                                       |
| **Category order changes between songs**                                   | Intentional per-track shuffle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ~~**The landing page looks empty below the button**~~                      | Gone in `8a7c6c8`: `ResumePrompt`/`ResumeBanner` were deleted, and a returning user gets a library summary plus page links.                                                                                                                                                                                                                                                                                                                                                                                                  |
| **A nav step ignores a click for a beat after a page change**              | It waits for this page's `/api/status` answer before becoming a link; its colour shows the previous answer meanwhile.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Every nav item goes grey mid-job**                                       | The nav lock. A scan, propose, classify run, `/review` save or Apply is running; the items come back when it ends.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **`cache.json` changes while you watch it**                                | Any Spotify-backed request without a live cookie refreshes the token and re-saves the whole cache. `auth.expires_at` moved twice in 90 seconds on 09-22 from read-only GETs alone. `/api/status` never does this.                                                                                                                                                                                                                                                                                                            |
| **The headline serif is a system font**                                    | `app/fonts/` has only a README; falls through to Iowan Old Style. Intended.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ~~**`/diff` says "~5s expected" then takes 41s**~~ FIXED `b287507`         | The actions render from the cache in ~50 ms. The 41 s Spotify re-read is now a footnote, "Checking Spotify for removed tracks…", that nothing waits for.                                                                                                                                                                                                                                                                                                                                                                     |
| **"Japanese Pop Hits" ×6**                                                 | Six real playlists, six distinct ids. Not the dedupe bug (451f04f fixed that, and the live response has 0 duplicate ids).                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`Imported` has no cover art**                                            | Only playlist with `cover_url: null`. Since `faeb870` its square shows a serif `I` instead of blank grey.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ~~**Progress bar total goes 106 → 105**~~                                  | No longer visible since `7b9a991`: `/scan` shows a count only once the server has counted.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Two EventSources in the Network tab**                                    | Only on `/scan` now: React StrictMode in dev mounts it twice and the first stream is closed at once. `/classify` and `/review` read the cache first and never open the discarded mount's stream. `singleFlight` covers classify and propose either way, so no double billing.                                                                                                                                                                                                                                                |
| ~~**`/setup` step 4 mentions "Settings"**~~ FIXED `cd9d689`                | The line is gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ~~**Deleting a category on `/review` doesn't stick**~~ FIXED `f6db73d`     | It sticks now, which makes Classify → Proceed after a delete irreversible.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **`cache.playlist_snapshots` has 106 entries for 105 playlists**           | The extra, `7kTRhp8EjPGEHyfDf3vx1o`, is a playlist you no longer own. Snapshots merge, never prune; the scan loop only walks `scope.included_playlist_ids`, so it's inert.                                                                                                                                                                                                                                                                                                                                                   |

---

## Evidence classes

- **Live against real Spotify (09-22):** playlist list (105, 0 duplicate ids, 5,384 slots), the diff payload
  and its 41.3s timing, the zero-`✨`-playlists check, the token refresh observed rewriting
  `auth.expires_at`.
- **Live against the running dev server (09-22):** `/api/config`, `/api/cache`, `/api/label`, the served
  HTML of the old `/`.
- **Read from disk (09-22, and again 09-23 ~03:55 EDT):** every count in
  [State on disk](#state-on-disk-right-now), all threshold recomputations, the label file, the relabel
  open times.
- **Read from code only, never executed:** everything `/apply` does, the reclassify failure and its
  cost, the setup wizard's steps 2–4.
- **The UI-pass update (09-23):** every heading, button, state and destination from the UI pass was read
  from the committed code on `feat/ui-pass`. This update ran nothing, so none of it was checked in a browser
  against the real server. The page builders checked their pages with unit tests (mocks) and a local
  harness with Spotify and Claude faked. `tests/e2e/happy-path.spec.ts` was not run for the pass.
