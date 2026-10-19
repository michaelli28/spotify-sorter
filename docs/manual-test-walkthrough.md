# Manual test walkthrough

A click-along guide to every page. It was first written against the live dev server and
`data/cache.json` as of **2026-09-22 22:32 EDT (2026-09-23 02:32 UTC)**.

**Updated 2026-09-23 ~04:00 EDT** for the whole-app UI pass on `feat/ui-pass`, from the code.

**Updated 2026-09-23 ~19:20 EDT** for the Record Shop redesign on `feat/redesign`. The sources were:

- the page code in the working tree (the page work was not yet committed);
- a read-only screenshot harness against the running dev server, with Spotify, Claude and every
  write faked in the browser;
- two read-only routes, `GET /api/status` and `GET /api/label`.

Each page section ends with a **Checked** line:

- **seen:** shown in the harness screenshots;
- **code only:** read from the code and not seen in a browser.

See [Evidence classes](#evidence-classes).

Base URL: **`http://127.0.0.1:3000`**. Use the IP, not `localhost`. See [Origins](#origins-matter).

---

## Read this first

Four things in this app are irreversible. Everything else is safe to click.

| Action                                                             | Where     | What it does                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apply**                                                          | `/apply`  | It creates 41 real private playlists in your Spotify account and adds about 12,192 track slots (3,172 distinct songs). Once the write finishes, the page then uploads each playlist's sleeve as its **Spotify cover**. Nothing in the app undoes either step. The page itself is the confirmation: there is no dialog.  |
| **Re-propose all… → Wipe & re-propose**                            | `/review` | It deletes all 41 categories **and** all 3,172 assignments (the $1.68 + $0.17 you already paid), then proposes new ones (~$0.14). It also breaks `/label`.                                                                                                                                                              |
| **Classify → Proceed after Delete or Merge into…**                 | `/review` | A deleted or merged-away category is really removed from `cache.json`. `/label` then refuses to load until `definitions.md` matches. The price tag names what it deletes.                                                                                                                                               |
| **Save / Can't judge / Yes / No / Accept suggestion / Accept all** | `/label`  | These append permanent lines to `data/labels/labels.jsonl`, which is append-only: no edit, no delete. **Every queue is now finished** (`GET /api/label`, ~19:13 EDT: relabel 30 of 30), so `/label` opens on "Every song is labelled." Only **Back** reaches a saved item, and saving it is refused: "The labelling study is finished, so this wasn't saved." |

**Classify does not cost money right now.** `GET /api/status` at ~19:13 EDT reported 3,172 tracks, 41
categories, **0 unsorted** and 0 applied. So:

- `/review`'s price tag reads **$0.00**.
- Opening `/classify` is a free no-op that writes no run row.
- Both re-arm the moment a scan pulls in new tracks.

Also worth knowing before you start:

- **`/scan` starts work on page load.** There is no confirm step. Typing the URL fires a real
  library read. It's free, but it writes `cache.json`. The only in-app way there is **Scan** on
  `/scope`.
- **`/classify` and `/review` each spend on load in one case:** `/classify` when some tracks have
  no category, `/review` when there are no categories (it proposes). Neither is true now. The nav
  and home check `/api/status` and never link either page in that state; a typed URL still would.
- ~~**`/api/llm/propose` is a GET.**~~ FIXED `0db0d6b`. A typed URL, bookmark or new-tab link to
  the paid or destructive routes (propose, classify, reclassify, apply, the label POST, and now
  the cover upload) gets 403 "Request must come from the app". `curl` sends no `Sec-Fetch-Site`
  header, so it is still allowed.
- **Album art is new, and fetching it writes a file.** Pages that show real covers are home, the
  review sheet, `/classify`'s song lists and `/diff`'s arrivals.
  - Each cover is `GET /api/art/<trackId>`. On a miss, the route asks Spotify's public oEmbed
    endpoint (`open.spotify.com`, no token), then stores the image URL (or "none") in
    `data/artwork.json`.
  - It never touches `cache.json` and never refreshes the token.
  - A track with no art shows a **plain sleeve** (a flat keylined square).
  - _Tested only against mocks: the route has never been checked against real oEmbed._
- Nothing outside `/label` touches `data/labels/labels.jsonl`.
- Nothing outside `/apply` writes to Spotify.
- **`GET /api/status` is the safe state check.** It only reads `cache.json` and never refreshes the
  token.

### Origins matter

The OAuth callback sets `sorter_access_token` on `127.0.0.1` only (`app/api/auth/callback/route.ts:71`).
`localhost` and `127.0.0.1` are separate cookie origins.

| Route                                      | On `localhost` without the cookie                                                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/spotify/playlists`, `/scan`, `/diff` | Fine: falls back to the refresh token in `cache.json`                                                                                                                                                                                         |
| `/api/spotify/playlist-tracks`             | Fine since `7a44e6b`: the same refresh-token fallback                                                                                                                                                                                         |
| `/api/spotify/cover` (Apply's covers)      | The same fallback. A refresh re-saves `cache.json`, which is why covers wait until the Apply write has finished (see [Known hazard](design/record-shop/foundation-data.md#known-hazard-cover-posts-during-apply-lose-cachejson-data-unfixed)) |

A missing or expired cookie (it lasts 3,600s) only costs an extra token refresh. A preview that does
fail says "Spotify didn't send this playlist." with **Try again**. For a fresh cookie, go to
`http://127.0.0.1:3000/` and choose **Reconnect Spotify**.

`pnpm start:open` does the right thing already: `next dev -H 127.0.0.1 -p 3000` plus auto-open
(`start.ts:4`).

---

## Getting around: the site nav and the top strip

**The site nav** is the masthead. It sits at the top of every page **except `/setup` and `/label`**,
and since the redesign that includes `/` too. It reads: **SpotifySorter** with a small record mark
(→ `/`), then **Sources · Categories · Fit · Apply**, then **Labels** behind a thin rule. A navy
rule closes it.

| Item          | Goes to     | A link only when                   | Why                                                                                                                          |
| ------------- | ----------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SpotifySorter | `/`         | always (except during a nav lock)  |                                                                                                                              |
| Sources       | `/scope`    | a Spotify refresh token is on disk | `/scope` reads Spotify. It is also marked current on `/scan` and `/diff`.                                                    |
| Categories    | `/review`   | categories > 0                     | With none, `/review` proposes (paid) on load.                                                                                |
| Fit           | `/classify` | categories > 0 **and** 0 unsorted  | With unsorted tracks, `/classify` classifies (paid) on load.                                                                 |
| Apply         | `/apply`    | same as Fit                        |                                                                                                                              |
| Labels        | `/label`    | categories > 0                     | **New:** it is locked like a step until categories exist (before setup and on a version mismatch there is nothing to label). |

- The current step is in dark ink with an underline that slides between steps. Available steps
  are a softer ink, and a locked step is pale text (`<span role="link" aria-disabled>`), not a
  link.
- The nav asks `GET /api/status` again on every page change. Steps stay unclickable until it
  answers, and their colour keeps the last answer meanwhile.
- **Right now all four steps and Labels are links:** 41 categories, 0 unsorted, and a token on
  disk (`/api/status`, ~19:13 EDT).
- **Nav lock:** while a page runs a job, every item goes pale and inert, wordmark and Labels
  included. The jobs are:
  - a scan;
  - saving the scope;
  - a propose, or a `/review` save or wipe;
  - a classify run, or saving the Fit on `/classify`;
  - the Apply write **and the cover uploads after it**.

  The items come back when the job ends.

- `/scan` and `/diff` are never nav targets.
- The nav is hidden on `/label` on purpose: leaving and coming back resets its in-memory Hide
  choice. `/label` has its own **← Home**.
- The Next.js dev badge is off (`devIndicators: false`, `next.config.ts:7`).

**The top strip** replaces the old bottom action bar. It is a band directly under the nav, with a
one-line status on the left and the page's **one orange button** on the right. It sticks to the top
of the screen once the nav scrolls away, and it never covers the page.

| Page        | Strip                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/scope`    | `106 of 106 sources` · **Scan**                                                                                                                                                             |
| `/diff`     | **Tune the fit**, or **Sort N tracks** when tracks wait                                                                                                                                     |
| `/review`   | "Drag a divider onto another to merge them." or what's unsaved · **Classify**                                                                                                               |
| `/classify` | the **Fit** ruler, the status · **Apply to Spotify**. On phones the ruler rides at the foot of the screen instead. During a paid run: "N of M batches" and a progress band, with no button. |
| `/apply`    | **Apply**. While writing: progress and a progress band. After: the cover tally and **Open Spotify**.                                                                                        |

Home, `/scan`, `/setup` and `/label` have no strip. The control moved into the strip; it is not
duplicated on the page.

**Checked:** seen for the nav on `/`, `/scope`, `/review`, `/classify`, `/apply` and `/diff` at
1440px and 390px, and for its absence on `/label` and `/setup`. The nav lock is code only.

---

## The 60-second tour

All safe. Nothing spends, nothing writes to Spotify, nothing touches the label file.

1. **`http://127.0.0.1:3000/` (home).** "3,172 tracks, sorted into 41 categories." beside a record
   crate. Click a few divider tabs, or ‹ ›, to flip through the crate. Don't click **Reconnect
   Spotify**.
2. **Sources → `/scope`.** 106 rows. Click a row to un-stamp it and watch the strip read
   `105 of 106 sources`. Click a row's track count for a preview. Don't press **Scan**.
3. **Categories → `/review`.** Click a divider: it is pulled into a sheet at the right. Rename it,
   pick a Colour, then **Close**. Click **Classify**, read the price tag, and click **Not yet**.
   Refresh to drop the edits.
4. **Fit → `/classify`.** Free right now: nothing is unsorted, so no run starts. Pick playlists in
   the index and drag the **Fit** ruler. Clicking a song opens a "Move … to…" dialog; **Cancel**
   it. Picking a destination writes.
5. **Apply → `/apply`.** The page is the confirmation. Read the list. **Don't press Apply.**
6. **Labels → `/label`.** Every queue is finished, so it opens on "Every song is labelled." Click the
   tabs if you like, then leave by **← Home**.

Skip `/scan` and `/diff` on a short tour: `/scan` starts a real library read on load, and `/diff`
is only reachable from a scan or by typing the URL.

---

## State on disk right now

Live from the app's read-only routes at ~19:13 EDT: `/api/status` and `/api/label`. Rows marked
_(03:55)_ come from the earlier read of `data/` and **were not re-read** for this update.

|                  |                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracks           | 3,172                                                                                                                                                                                  |
| Categories       | 41, **none on Spotify** (`applied: 0`)                                                                                                                                                 |
| Unsorted         | **0**                                                                                                                                                                                  |
| Placements at 65 | **12,192** (41 per-category counts from `/api/status`; largest Bedroom Pop Intimacy 1,442, Soft Pop Ballads 1,411, Singer Songwriter Intimate 840; smallest Stutter House Rhythmic 14) |
| Labelling study  | **Closed**: `label_study_open: false`. Songs 100/100, Pairs 200/200, Gold set 190/190, Relabel **30/30**                                                                               |
| Cache            | `data/cache.json`, version 2 _(03:55)_                                                                                                                                                 |
| Artists          | 1,476 _(03:55)_                                                                                                                                                                        |
| Runs             | 8: 2 propose, 6 classify. The last paid run was 2026-09-23 02:27:56 → 02:29:30Z, "Classified 297 new tracks. 2875 reused from cache.", $0.1747 _(03:55)_                               |
| Scope            | 105 included, 0 excluded, Liked Songs on (189 tracks) _(03:55)_                                                                                                                        |
| Config           | prefix `✨`, threshold 65, `claude-haiku-4-5-20251001` _(03:55; home's "fit 65" agrees)_                                                                                               |
| Labels file      | 491 rows at 03:55. All 30 relabels now read as done, so their pass-2 rows have been added since. The file itself was not re-read.                                                      |
| Art store        | `data/artwork.json`: not read. It exists only once a page with album art has loaded on the real server.                                                                                |
| Live Spotify     | 105 owned playlists, **zero** starting with `✨` (live check 09-22; nothing has applied since)                                                                                         |

---

## `/` — home

The front door. It is rendered on the server from the same reader `/api/status` uses
(`app/page.tsx`), so it never offers a page the nav keeps locked. It reads the cache and never
writes it.

**Now:** the site nav across the top, with the wordmark as the current page.

- **Left:**
  - the headline "3,172 tracks, sorted into 41 categories." in the big display serif;
  - the line "None on Spotify yet.";
  - the one orange button, **Apply to Spotify**;
  - a short ruled list: **Check for new tracks**, then **Reconnect Spotify** in a softer ink.

  Categories and Labels are no longer here; they're in the nav.

- **Right: the crate.** All 41 categories stand as divider cards in a wooden crate, **largest at
  the front**. Each divider has a numbered tab tinted by its mood colour, and records behind it
  drawn to scale.
  - The front divider (02 Bedroom Pop Intimacy) is pulled up, showing its printed sleeve with a
    price sticker, "1,442 tracks".
  - The key "dusk · charge · glow · haze" is stencilled on the crate's lower slat.
  - Under the crate: ‹ "02 / Bedroom Pop Intimacy" ›, then that category's first three example
    songs with their album art.
- **Below the fold: "What Apply writes".**
  - The data line "41 playlists · 12,192 adds at fit 65". A "· N tracks fit none" part appears
    only when some do; none do now.
  - Then all 41 in three columns, largest first: sleeve, number, name, count and a bar.
  - On a phone it shows the top 12, then **Show all 41**.

The main button depends on the state (`src/components/home/HomeView.tsx:24-31`, first match wins):

| State                           | Main action                                           | Where it goes                   |
| ------------------------------- | ----------------------------------------------------- | ------------------------------- |
| Keys not configured             | Set up                                                | `/setup`                        |
| No tracks yet, or no categories | Connect Spotify (no token) / Choose playlists (token) | OAuth / `/scope`                |
| Some tracks unsorted            | Sort N tracks                                         | the price tag, then `/classify` |
| No token on disk                | Connect Spotify                                       | OAuth                           |
| Some categories not on Spotify  | **Apply to Spotify** (now)                            | `/apply`                        |
| All on Spotify                  | Check for new tracks                                  | `/scope`                        |

Other states reuse the same places:

- **First run:** "Sort your library into vibes that mean something." and an explaining sentence.
  The crate is empty but for one blank dashed tab, 01.
- **Categories but nothing placed yet:** the dividers stand with no records behind them, and "What
  Apply writes" is hidden.
- **Unsorted tracks:** the headline reads "N of M tracks sorted." and "What Apply writes" is hidden,
  because Apply is locked.
- **Partly applied:** only rows already on Spotify get a small teal "on Spotify".
- **Everything applied:** the headline reads "41 playlists on Spotify." and the list is retitled
  "On Spotify".
- **Version mismatch:** one red line, "Your library file is from another version of SpotifySorter."

| Control                                 | Result                                                                                                                                                                                                                                                           | Tag                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Click a divider tab                     | Pulls that divider: the old sleeve drops away, the new one rises, and its sticker stamps on. The caption and the three songs change.                                                                                                                             | SAFE                               |
| Hover a tab (mouse)                     | Previews that tab's number and name under the crate in a softer ink, and dims the songs so they never read as its songs.                                                                                                                                         | SAFE                               |
| **‹** / **›**                           | One divider forward (larger) / back (smaller). Dimmed at either end.                                                                                                                                                                                             | SAFE                               |
| Keyboard                                | The crate is **one Tab stop**. ↑ and → go back (smaller), ↓ and ← go forward, and Home and End jump to the front or back.                                                                                                                                        | SAFE                               |
| Phone (≤720px)                          | The tabs are only an index. Use ‹ ›, or drag the sleeve sideways.                                                                                                                                                                                                | SAFE                               |
| The sleeve, or the name under the crate | → `/review#<id>`, which opens that category's sheet.                                                                                                                                                                                                             | SAFE                               |
| A song under the crate                  | A `spotify:track:` link (opens the Spotify app).                                                                                                                                                                                                                 | SAFE                               |
| A row in "What Apply writes"            | → `/review#<id>`.                                                                                                                                                                                                                                                | SAFE                               |
| **Apply to Spotify**                    | → `/apply`, which writes nothing on load.                                                                                                                                                                                                                        | SAFE                               |
| **Check for new tracks**                | → `/scope`. Listed only while the main button is Sort or Apply.                                                                                                                                                                                                  | SAFE                               |
| **Reconnect Spotify**                   | A full page load → PKCE → Spotify (it flashes through, since you've approved before) → lands on `/scope`. Spotify **will ask again** if the scope list has grown since your last approval, and it has: `ugc-image-upload` (covers) is new. _(ASSUMED; not run.)_ | **WRITES** `cache.json` auth block |
| **Sort N tracks** (not now)             | Opens the price tag: the price, then "Claude sorts only the N tracks without a category." **Proceed** → `/classify`, which starts a paid run. **Not yet** closes it.                                                                                             | **SPENDS** on Proceed              |

The crate's entrance (dividers settling, then the sleeve rising) plays once per browser session.
Reduced motion swaps every move for a short fade.

**What Connect / Reconnect actually does** (`app/api/auth/login/route.ts`):

1. If the host isn't `127.0.0.1:3000`, it 307s to the canonical origin first.
2. It mints a 128-char PKCE verifier and a 16-byte state, both in HttpOnly / SameSite=Lax /
   **Max-Age=600** cookies. There is no client secret anywhere.
3. It 307s to `accounts.spotify.com/authorize` with the scopes `playlist-read-private
playlist-read-collaborative playlist-modify-private user-library-read user-read-private
ugc-image-upload` (`src/lib/spotify/scopes.ts`).
   - **`ugc-image-upload` is new:** it lets Apply set playlist covers.
   - A token granted before it can't upload covers until you reconnect once. _(ASSUMED: the
     refresh token on disk predates it. The cache doesn't record scopes.)_
   - There is still **no `playlist-modify-public`**: every playlist this app creates is private.
4. The callback verifies the state, exchanges the code, overwrites `auth.refresh_token` and
   `auth.expires_at` in `cache.json`, sets `sorter_access_token` (1 hour), clears the PKCE
   cookies, and 307s to `/scope`.

**You can skip it.** Typing `/scope` works with no cookie at all. Every Spotify route calls
`ensureFreshToken(session)`, and with no session it falls back to the refresh token already on
disk (`src/lib/spotify/client.ts:12-36`). A missing cookie is not logged-out. The cost is an extra
refresh round-trip, and `cache.json` gets rewritten.

**To check state without clicking anything:**

```
curl -s http://127.0.0.1:3000/api/status
```

Expect `{"configured":true,"connected":true,"tracks":3172,"categories":41,"unsorted":0,"applied":0,"version_mismatch":false,"category_counts":{…41 ids…},"label_study_open":false}`
(called live at ~19:13 EDT). `connected` only means a refresh token is on disk, not that Spotify
still accepts it.

**Rough edges here:**

- ~~**Denying on Spotify's screen shows no error.**~~ FIXED `8a7c6c8`. `/?error=denied&detail=…`
  shows one red line:
  - "Spotify didn't connect (access_denied)." above the main button;
  - or "Spotify didn't reconnect (access_denied)." under Reconnect Spotify, when a token is
    already stored.

  The deny path was not run.

- **PKCE cookies expire in 10 minutes.** Leave Spotify's approval screen sitting for 11+ minutes
  and the callback returns raw JSON, `{"error":"state mismatch"}`, with HTTP 400. There is still no
  styled error page in the auth flow. To recover, go back to `/` and click Reconnect.
- ~~**The headline serif is a system font.**~~ Gone. The redesign loads Caprasimo (display) and
  Libre Franklin (body) through `next/font`.

**Checked:** seen for the returning state at 1440px (full page) and 390px, including the crate, the
caption, the three songs with art, and "What Apply writes". Flipping, peeking, the keyboard, the
swipe, the other states and the denied line are code only.

---

## `/setup` — the wizard you can't reach

**Now:** a flash of the first card, then an immediate jump back to `/`. The client fetches
`/api/config`, sees `configured: true`, and calls `router.replace("/")`. There is no site nav here.

The page is the shop counter: a kraft-brown ground with one index card on it. Four tabs sit above
the card, **01 Spotify app · 02 Client ID · 03 Anthropic key · 04 Prefix**. The current tab is
printed reversed (navy), and the card's title is set in the display serif, for example "Make a
Spotify app."

**You cannot demo this without breaking your working config.** For narration only:

| Step             | Gate                                                        | Notes                                                                                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Spotify app   | Continue always on                                          | Shows the Redirect URI, which must be exactly `http://127.0.0.1:3000/api/auth/callback`, with a **Copy** button ("Copied" for 1.6s; a failure says to copy it by hand).                                                                                                                           |
| 02 Client ID     | checked on Continue, before any request                     | Empty: "Paste the Client ID first." Short: "That's N characters; a Client ID is 32." SAFE                                                                                                                                                                                                         |
| 03 Anthropic key | must start `sk-ant-` ("Anthropic keys start with sk-ant-.") | Continue ("Checking…") POSTs `/api/llm/validate`, a real 1-token Anthropic call. **SPENDS** (a fraction of a cent). A 401 or 403 says "Anthropic rejected that key."; any other failure says "Couldn't check the key with Anthropic." and the button reads **Try again**.                         |
| 04 Prefix        | non-empty ("Pick at least one character."), ≤ 8 chars       | Previews the name on a divider tab under "In Spotify": `✨ Bedroom Pop Intimacy`. **Save** ("Saving…") **overwrites `.env.local`** with exactly two lines and patches `config.prefix`. **WRITES, destructive.** A failure says "Couldn't save the settings." or "Couldn't reach the app to save." |

- **Back** works on cards 2–4, and so do the tabs of cards you've already passed. Both keep what
  you typed.
- Enter submits.
- Success replaces the page with home, so browser Back doesn't reopen setup.

**If someone asks you to re-run setup live, say no.** `POST /api/config` rewrites `.env.local`
wholesale, and the dev server restarts on a `.env` change. You'd drop mid-demo.

**Checked:** seen for card 01 at 1440px (the harness faked `configured: false`). Cards 02–04, the
errors and the prefix tab are code only.

---

## `/scope` — pick what to read

Choose which playlists Claude may read. It is read-only against Spotify and writes only the `scope`
block of `cache.json`. Reach it from the nav's **Sources**, home's **Check for new tracks**, or
`/diff`'s **Change sources**.

**Now:**

- The title is "What should I read?". The strip shows "Loading your playlists…" for about a second
  (0.91–1.33s measured on 09-22), then `106 of 106 sources` beside **Scan**.
- Your saved scope is restored. Right now that is everything, with 0 excluded.
- **Liked Songs** (a heart) sits in its own ruled row, then the 105 playlist rows. Each row has:
  - a stamped ink check box;
  - the playlist's 40px cover (a plain sleeve when it has none, or it fails to load);
  - the name;
  - its track count at the right.
- On desktop (≥901px) the filter and the bulk buttons sit in a left rail, pinned under the strip.

| Control                                                      | Result                                                                                                                                                                                                                                                                                                    | Tag                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Click a row (the box, cover or name)                         | Toggles it. The stamp lifts, and the row's cover and name fade to a pale ink. The strip reads `105 of 106 sources`.                                                                                                                                                                                       | SAFE                                 |
| **Deselect all**                                             | Every stamp lifts, sweeping down the list. The strip says `Pick at least one source.` and Scan is disabled.                                                                                                                                                                                               | SAFE                                 |
| **Select all**                                               | Back to `106 of 106 sources`.                                                                                                                                                                                                                                                                             | SAFE                                 |
| **Filter playlists**                                         | Case-insensitive substring on the name. `piano` → 2, `japanese` → **12**, and `zzz` → 0 plus `No playlists match “zzz”.` **Clear** inside the field, or Escape, empties it.                                                                                                                               | SAFE                                 |
| Bulk buttons while filtering                                 | They read `Select these 12` / `Deselect these 12` (`this one` for a single match) and touch only the rows on screen. Liked Songs is left alone. They are disabled when they'd change nothing.                                                                                                             | SAFE                                 |
| A row's track count (`116 tracks`; `Preview` on Liked Songs) | Opens the preview, a price-tag dialog: the playlist's name, a mono sticker with its count (`116 tracks`, or `110 of 116 tracks` when a scan can't read them all), and a numbered list. It fetches the whole playlist; `chills` (291 tracks) needs 6 sequential Spotify pages.                             | SAFE (read-only GET)                 |
| **Include** / **Leave out** in the preview                   | Toggles that row without closing.                                                                                                                                                                                                                                                                         | SAFE                                 |
| Close the preview                                            | **Close**, the backdrop, or Escape. Focus returns to the count you clicked.                                                                                                                                                                                                                               | SAFE                                 |
| A failed preview                                             | "Spotify didn't send this playlist." with **Try again**.                                                                                                                                                                                                                                                  | SAFE                                 |
| **Scan** (strip)                                             | PATCHes `{included, excluded, include_liked_songs}` and goes to `/scan` only after an OK answer. While it saves, Scan is held down, the strip reads `Saving 105 of 106 sources…`, and the rows, bulk buttons and preview toggle freeze. A failed save says "Couldn't save your choice. Nothing was read." | **WRITES** `cache.json` (scope only) |
| **Back to Scan**                                             | Keyboard only. It is hidden at the end of the list until it gets focus, then moves focus up to Scan (it replaced "Skip to Scan").                                                                                                                                                                         | SAFE                                 |

The **Liked Songs row never filters out**, by design. It sits outside the filtered list, so with
`zzz` you see it _and_ the no-matches line.

The preview's count is **≤** the row's. The row shows Spotify's raw total. The preview counts only
tracks that survive normalisation: local files, null ids and artist-less rows are dropped.

**Other screens:**

- **Spotify fails:** "Spotify didn't send your playlists." in red, Spotify's message in small mono,
  a quiet **Reconnect Spotify**, and **Try again** in the strip. There is no list and no Scan.
- **No token stored:** "Spotify isn't connected." with **Connect Spotify** in the strip.
- A request that hangs with no answer still shows "Loading your playlists…" indefinitely. No
  timeout was added.

**Looks broken, isn't:**

- **"Japanese Pop Hits" appears 6 times.** These are six genuinely different playlists that share
  one name: six distinct ids, five with 10 tracks and one with 8. Confirmed live on 09-22 (105
  playlists, 105 distinct ids). Commit 451f04f deduped on **id**, so this is not that bug
  returning.
- **`Imported` has no cover.** It's the only playlist with `cover_url: null`, and it now shows the
  plain sleeve (a flat keylined square).
- **Liked Songs shows no track count.** Its button reads `Preview` instead. The only count
  available is a fingerprint from the last scan, which could be stale.
- **`cache.json`'s mtime changes just from opening `/scope`.** Any Spotify-backed request without a
  live cookie refreshes the token, which re-saves the whole cache (`src/lib/spotify/client.ts`).
  This is not corruption. `/api/status` never does this.

**Checked:** seen for the ready state at 1440px and 390px, with the harness's 41 fake playlists
(so its counts are not yours). The preview, filtering, the sweep, the save and the error screens
are code only.

---

## `/scan` — read the library

**It starts on mount. There is no confirm step.** Typing `/scan` in the address bar fires a real
scan. The only in-app way here is **Scan** on `/scope`. This page has no strip, and the nav is
locked while it reads.

**Now:**

- The title "Reading your library…" sits beside an empty crate (under the title on a phone).
- Below it is a list of stages: `Playlists`, `Liked Songs`, `Artist genres`. The stage being read
  is in bold dark ink. Finished stages turn softer and get a tick. Artist genres shows its own
  `612 of 1,480` count in mono.
- Once the server has counted playlists, the title becomes a ticking count on two lines,
  **"12 of 105 / playlists read"**.
- Each playlist read slides a plain record into the crate from the right and drops it behind the
  front slat. Record tops fill the crate from the front towards the back.
- Records queue at most one per 180ms, so a fast scan never strobes.
- Reduced motion swaps every move for fades and step changes.

**How long:** last night's run took **43.2 seconds** and re-fetched 20 playlists. If nothing has
changed since, all 105 snapshot ids match and every playlist is skipped: 106 quick metadata calls,
so roughly 30–60 seconds.

**What it writes:** updated `playlist_snapshots` and `liked_songs_fingerprint`. If a playlist
changed, its tracks merge into `cache.tracks` (existing entries are never overwritten, only added)
and its artists into `cache.artists`. **WRITES** `cache.json`. It makes no Spotify writes, no
Claude call, and costs no money.

**On finish:** the crate fills and the title becomes `3,172 tracks from 1,476 artists.` After
**900ms** the page replaces itself with `/diff`, because `cache.runs` is non-empty. A first run
goes to `/review` instead. It uses `router.replace`, so browser Back from `/diff` returns to
`/scope`, not into a second scan.

**If it fails,** the crate goes away, the title says what went wrong, and the orange button sits in the top strip (`src/lib/scan/error-kind.ts`):

| Title                          | Line under it                                     | Buttons                                                          |
| ------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| Spotify asked us to slow down. | Give it a minute.                                 | **Scan again** (orange), Change sources                          |
| Spotify signed you out.        |                                                   | **Reconnect Spotify** (orange; OAuth; **WRITES** the auth block) |
| Nothing to read.               | The sources you picked hold no tracks.            | **Change sources**                                               |
| The scan stopped.              | a collapsed **Details** with the server's message | **Scan again**, Change sources                                   |

**Scan again** re-runs the read in place: a real scan, with the same tags as above.

**Gotchas:**

- **Don't close or reload the tab mid-scan.** The working hypothesis is that Next aborts the route handler when the browser drops the EventSource,
  before `writeCache` runs.
- ~~**The progress total jumps 106 → 105 on the first tick.**~~ FIXED in the redesign. Every
  `playlists` event now carries the same total (the playlists in scope, without Liked Songs), and
  the crate never takes a record back out.
- **Dev-mode double-mount.** React StrictMode mounts the page twice, which opens two EventSources.
  The first is closed at once and the UI listens to the second, so the screen is correct, but
  expect stray stream errors in the dev terminal. `/api/spotify/scan` has no single-flight guard.
  _(The mechanism is CONFIRMED from config and code; the doubled runtime is ASSUMED, since no scan
  was run.)_
- **A rate-limited snapshot check silently becomes a full re-fetch.** `scan.ts` swallows any
  snapshot error, including a 429, and falls through to a complete playlist fetch. Throttling
  makes the scan slow, not failed.
- **No way out during the scan.** There is no link, and the nav is locked. There is no Stop button,
  on purpose: stopping the server job is unverified.

**Checked:** seen for mid-scan (the harness faked an artist-genres event: Playlists and Liked Songs
ticked, the crate full of record tops) and the rate-limit failure at 1440px. The ticking "N of M
playlists read" title, the record drop, the finish and redirect, and the other failures are code
only.

---

## `/diff` — what changed

Read-only. Nothing here mutates your account.

**No nav links to it.** Type the URL, or arrive from `/scan`. The nav marks **Sources** as current
here.

**Now:** within about 50ms (it reads the cache, not Spotify) you get:

- the title **"Nothing new to sort."**;
- **Tune the fit** in the strip (→ `/classify`);
- two quiet links under the title, **Edit categories** (→ `/review`) and **Change sources**
  (→ `/scope`);
- a footnote, "Checking Spotify for removed tracks…", which stays for about 41 seconds and then
  disappears if nothing was removed.

On 09-22, `GET /api/spotify/diff` returned
`{"added":[],"removed":[],"existing_category_count":41,"is_first_run":false}`.

The page never reads `added`: the diff route compares against a cache the scan has already
updated, so `added` is almost always empty. It counts unsorted tracks instead.

**The Spotify check still takes about 41 seconds**, but nothing waits for it. It measured **41.3s**
on 09-22. The route re-downloads the full track list of all 105 source playlists plus Liked Songs,
and deliberately ignores `playlist_snapshots` (`app/api/spotify/diff/route.ts`).

| Control (now)       | Result                                                              | Tag  |
| ------------------- | ------------------------------------------------------------------- | ---- |
| **Tune the fit**    | → `/classify`. Offered only when nothing is unsorted, so it's free. | SAFE |
| **Edit categories** | → `/review`. No LLM call on load.                                   | SAFE |
| **Change sources**  | → `/scope`.                                                         | SAFE |

Other states you won't see now:

| When                                  | Screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Some tracks have no category          | The title reads **"297 new tracks to sort."** Beside it on desktop (below it on a phone) is a delivery slip on card stock: the newest 8 unsorted tracks with album art, title and artist, then "and N more" under a dashed tear line. Songs in the labelling sample are left out, so the slip can list fewer, or none. The strip's button becomes **Sort N tracks**, which opens the price tag; **Proceed** → `/classify`, which **SPENDS**. If the slip fails: "Couldn't list the new tracks." with **Try again**. |
| Tracks were removed from your sources | "12 tracks are no longer in your sources." then up to 5 titles, "… and 7 more." Once any playlist exists on Spotify, it adds "Apply won't take them out of your ✨ playlists."                                                                                                                                                                                                                                                                                                                                   |
| The Spotify check failed              | "Couldn't check Spotify for removed tracks." with **Try again**, which re-runs only that check (about 41s).                                                                                                                                                                                                                                                                                                                                                                                                         |
| Cache unreadable                      | "Couldn't read your library." with **Try again** in the strip.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Cache from another version            | The same title, plus "Your library file is from another version of SpotifySorter.", and **Home** in the strip.                                                                                                                                                                                                                                                                                                                                                                                                      |
| No categories                         | Redirects to `/review`, which proposes on load (**SPENDS**, with no price shown).                                                                                                                                                                                                                                                                                                                                                                                                                                   |

On the first read the strip holds no button (a guess could be wrong). "Reading your library…"
appears in it only if the read is slow.

`/diff` has **no cross-site guard**. It's a read, so that's harmless, but it is
inconsistent with the guarded routes.

**Checked:** seen for the "Nothing new to sort." state at 1440px and 390px, and for the removed-tracks
note (from the harness's fake diff answer). The waiting slip and the error screens are code only:
the harness can't make real tracks unsorted.

---

## `/review` — edit the categories

The only screen where the category list itself is editable. Since the redesign it is a bin of
divider cards, with one divider at a time pulled into a sheet.

**Reach it:** the nav's **Categories**, `/diff`'s **Edit categories**, `/classify`'s **Back to
categories** after a failed run, or any `/review#<id>` link (home's crate sleeve and name, and every
"What Apply writes" row), which opens that category straight away.

**Now:**

- While `/api/cache` loads, the page is blank except for the strip, with **Classify** disabled.
- **No Anthropic call happens.** The page proposes only when `cache.categories` is empty, and you
  have 41.
- Then the title "**41 categories. Edit anything.**" and the bin, a darker paper well:
  - Its head carries the colour key "dusk · charge · glow · haze" at the left and "Tracks at fit
    65" at the right ("fit 65" on phones).
  - **41 card dividers** follow. Each has a numbered tab tinted by its mood colour, its 40px
    sleeve, the name, the description in a softer ink (truncated, hidden on phones), a bar on one
    shared scale, and the count.
  - The last divider is a dashed blank, **42 Add a category**.
  - Under the bin: **Re-propose all…** in a softer ink.
- The strip says "Drag a divider onto another to merge them." (mouse only, hidden on narrow
  screens) beside **Classify**.

**Opening a divider:** click it, or Tab to it and press Enter.

- **Desktop (≥901px):** it is pulled into a sticky **side sheet** at the right. **One at a time**:
  opening another replaces it. The divider in the bin turns blue-tinted, its tab prints reversed,
  and its sleeve slot is left as an empty dashed square. The sleeve morphs from the row into the
  sheet.
- **The sheet, top to bottom:**
  - the reversed tab;
  - the sleeve at 160px beside the editable name (in the display serif, on a dotted rule);
  - **Mostly**, the category's top artists;
  - the actions **Add example · Merge into… · Delete · Close**, pinned at the top while the sheet
    scrolls;
  - the description on a ruled index card;
  - **Colour**, with **auto · dusk · charge · glow · haze** tabs and "auto guesses haze" beside it;
  - **Tracks at each fit**: 12 columns from 40 to 95 (yours in dark ink, marked "yours"). These
    are aggregate counts per category, not per song;
  - **Examples**: the sample songs with album art, each a `spotify:` link.
- **At 900px and below:** the same editor opens inside the divider instead.
- Escape closes the sheet.
- **"Mostly" appears only while the labelling study is closed.** It is closed now
  (`label_study_open: false`), so it shows.

| Control                                    | Result                                                                                                                                                                                                                                                                                                | Tag                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Click a divider                            | Opens it (above). Focus goes to the name, and Enter in the name moves to the description.                                                                                                                                                                                                             | SAFE                                                                                |
| Edit the name                              | A local draft; the sleeve reprints for the new name. An emptied name reverts when you leave the field. A duplicate shows "Another category is called this." in red, the strip reads "2 categories are called “X”.", and Classify is disabled.                                                         | SAFE locally                                                                        |
| Edit the description                       | It matters: the description **is** what the classifier sees (`src/lib/pipeline/classify.ts`). The sample tracks are not.                                                                                                                                                                              | SAFE locally                                                                        |
| **Colour**                                 | **New.** It overrides the guessed mood colour, and the sleeve and tab reprint at once. **auto** goes back to the guess. It counts as "1 edited" and is saved with the rest on Classify → Proceed. Purely visual: the classifier never sees it.                                                        | SAFE locally                                                                        |
| **Delete**                                 | The divider is replaced by a dashed line, "Deleted X." with **Undo**. Undo reverses only that one change.                                                                                                                                                                                             | SAFE locally, **irreversible once saved**                                           |
| **Merge into…**                            | A "Type to filter" box over the other categories. Enter merges when one match is left, otherwise it moves to the first match; the arrows walk the list; Escape cancels. It leaves "Merged X into Y." with **Undo**. The target keeps its id, and its count and bar turn pale until the next Classify. | SAFE locally, **irreversible once saved**                                           |
| Drag a closed divider onto another (mouse) | It lifts and follows the pointer, and the strip says "Merge A into B". Dropping merges the same way. Touch and keyboard use Merge into….                                                                                                                                                              | SAFE locally                                                                        |
| **Add example**                            | A dialog, "Add examples to _Name_", with an autofocused "Search your scanned library…". Tick rows, then **Add N examples** or **Cancel**. Songs that are already examples are dimmed with a small tick.                                                                                              | SAFE, and **purely cosmetic**: `example_track_ids` are never sent to the classifier |
| **42 Add a category**                      | Opens a name ("e.g. trap with sad piano samples") and description ("how it feels") form. Enter or **Add** appends it with a fresh `crypto.randomUUID()`; Escape or **Cancel** closes it. Duplicate names are blocked. The new divider shows "new" instead of a count.                                 | SAFE by itself, **arms a paid re-score** (below)                                    |
| **Classify** (strip)                       | Opens the price tag only. The strip's status says what's unsaved: "Unsaved: 1 deleted · 1 renamed · 1 new · 1 edited".                                                                                                                                                                                | SAFE                                                                                |
| **Re-propose all…**                        | Opens the second price tag only.                                                                                                                                                                                                                                                                      | SAFE                                                                                |
| Refresh the page                           | Drops every unsaved edit.                                                                                                                                                                                                                                                                             | SAFE                                                                                |

### The Classify price tag — now

With no edits and 0 tracks unsorted:

```
$0.00
Every track already has a category, so Claude isn't called.
[Proceed]  [Not yet]
```

With edits, the tag adds what saving will do:

- "This also deletes N categories:" in red, followed by the names;
- "Renames N categories:" with each A → B;
- "The labelling page needs one heading per category in definitions.md, so it will refuse to load
  until that file matches.";
- notes such as "Tracks already placed in a deleted category don't move; any that fit nothing else
  end up in no playlist." and "Edited names and descriptions only steer tracks sorted from now on.";
- for a new category, the price of the re-score: "Claude re-scores your 3,172 placed tracks against
  X."

A colour change alone adds none of these lines.

- **Not yet:** closes cleanly. SAFE.
- **Proceed:** Classify reads "Saving…", the bin dims and goes inert, and the nav locks.
  - It PATCHes the whole category list into `cache.json`, replacing what's there
    (`_clear: ["categories"]`). A Colour override is saved as the category's `temperature`; auto
    leaves the key off.
  - Then it goes to `/classify`, which right now starts no run and writes nothing.
  - **WRITES** `cache.json`. It never writes to Spotify and never touches the label file.
  - A failed save says "Couldn't save your categories. …" in the strip, and Classify works again.

### The Re-propose price tag — do not confirm

```
$0.11 — $0.14
Deletes all 41 categories and every track's place in them, then Claude proposes new ones.
Sorting all 3,172 tracks again afterwards costs about $2.01.
The labelling page will refuse to load until definitions.md matches the new categories.
[Wipe & re-propose]  [Not yet]
```

The prices come from the 04:00 update and were not re-priced. **Wipe & re-propose** is printed in
red on card stock, and focus starts on **Not yet**, so Enter can't wipe anything.

Confirming immediately `_clear`s `categories` and `assignments` from `cache.json`. That's the $1.68
September classify **and** last night's $0.17.

The page then finds no categories and proposes on its own:

- "← Home" above the title "Proposing categories…";
- "Claude is reading all 3,172 tracks. Leaving this page won't stop it.";
- a bin of blank, unnumbered dashed dividers;
- a disabled Classify, and the nav locked.

The propose takes about 2 minutes, costs about $0.14, and writes brand-new categories with new ids
and new names. **SPENDS + destroys real data + breaks `/label`.**

New names mean `data/labels/definitions.md` (41 headings, exact-name match) no longer resolves, and
`/label` throws `DefinitionsError` (`src/lib/labeling/definitions.ts`). The rows in `labels.jsonl`
are keyed to category ids and a definitions sha that no longer exist.

**The backup is not an undo.** `~/spotifysorter-backup-0918/cache.json` is the _older_ world (45
categories, 2,875 tracks), so restoring it loses the current classification.

If the propose fails partway, you're left with zero categories and zero assignments, because the
wipe lands before the LLM call. The failure screen, "Claude couldn't propose categories.", offers
**Try again** in the strip, which proposes again and **SPENDS** again. A failed load says "Your
categories didn't load." with **Try again**.

### Real bugs you can hit here

- **"Add a category" → "Classify" is still a likely-fail spend, but no longer a silent one.**
  _(ASSUMED; this path has not been run.)_ **Don't demo it.**
  - The price tag prices the re-score (about $0.08–$0.12 by
    `src/lib/categories/rescore-cost.ts`).
  - Proceed saves the categories, **new one included**, then POSTs `/api/llm/reclassify`. That
    scores **all 3,172 placed tracks against the new category in one request with `max_tokens:
4000`** (`src/lib/llm/reclassify.ts:51`).
  - 4,000 output tokens hold roughly 150 entries, so the reply likely truncates and the route
    500s.
  - The page then says "Re-scoring against X failed; your categories are saved. The server
    answered 500." in red and stays on `/review`.
  - You pay for the call, and the saved new category breaks `/label` until `definitions.md` has
    its heading.
- **A save keeps each category's playlist link unless the category was renamed** (fixed
  2026-09-24; before, every save unlinked all of them and Home said "None on Spotify yet.").
  - A renamed category is unlinked, and the next Apply finds playlists by exact name, so it gets a
    second playlist and the old one stays behind.
- **Every visit downloads the whole cache** into the browser: all 3,172 tracks and 3,172
  assignment rows (about 1.5 MB, measured 09-22).

### Looks broken, isn't

- **An opened category lists fewer examples than the proposer gave it.** Only sample ids that exist
  in the cache are listed; **28** of the proposer's 208 ids are hallucinated.
- **A divider says "new" instead of a count.** It was added since the last Classify, so there's no
  saved number yet.
- **A count and bar are pale.** That category is the target of a merge; its saved number no longer
  holds until Classify.
- **Blind-label guard:** `/review` shows no per-song scores or ranks. The Fit chart and the counts
  are totals per category.

**Checked:** seen at 1440px and 390px for the bin, and with divider 04 opened (the side sheet at
1440px, inline at 390px, "Mostly" showing). The price tags, Delete/Merge/Undo, dragging, the
Colour picker changing a sleeve, Add track, Add a category, proposing and the error screens are code
only.

---

## `/classify` — tune the fit

This page scores unsorted tracks against the categories, then lets you set the **fit** (how sure
Claude must be before a song goes into a playlist) and move songs between playlists before anything
reaches Spotify.

**Reach it:** the nav's **Fit**, `/diff`'s or `/apply`'s **Tune the fit**, or **Proceed** on a
`/review` or **Sort N tracks** price tag.

**It reads the cache first, and opens the paid stream only when some tracks have no category**
(`src/components/classify/useClassifyRun.ts`). It never retries on its own. The only price tags are
on `/review`, home and `/diff`.

**Right now nothing is unsorted**, so no stream opens, no Claude call is made, and no run row is
written.

**What you'll see:**

- A blank beat while the cache loads, with the strip already in place.
- Then the title **"Tune the fit."** and an index of the 41 playlists, **sorted largest first**:
  02 Bedroom Pop Intimacy 1,442, then 12 Soft Pop Ballads 1,411, 41 Singer Songwriter Intimate 840
  and so on. Each row has its numbered, tinted tab, the name, the count and a bar.
- **Desktop (≥901px):** the largest playlist is already open beside the index. Its name is set in
  the display serif, and its songs are numbered liner notes with album art, in two columns when
  there are more than 8.
- **Below 901px:** each playlist opens in place, one at a time.
- **The strip:** the **Fit** ruler (a printed scale from 40 to 95 with an orange tag riding on your
  value), a one-line status, and **Apply to Spotify**.
- **Phones (<721px):** the ruler and its status ride in a band at the foot of the screen instead,
  and the strip holds only Apply to Spotify.
- After a paid run on this visit, the status line says "Sorted N tracks for $X.XX".

| Control                                                              | Result                                                                                                                                                                                                                                                                                                                                             | Tag                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Pick a playlist in the index                                         | Shows its songs, 100 at a time (50 below 901px), with **Show N more**.                                                                                                                                                                                                                                                                             | SAFE                                     |
| **Fit** ruler                                                        | A native range from 40 to 95 (it stretches only to show a saved value outside that): drag, arrows, Page Up/Down, Home/End. A pure client-side recount. Bars shrink on one fixed scale, and the index re-sorts by size (below 901px it waits until the open playlist closes). The status turns amber: "The fit isn't saved until Apply to Spotify." | SAFE                                     |
| Click a song                                                         | Opens "Move ‘X’ to…": a **Filter categories** box and every other category in catalogue order. **Cancel** or Escape closes it. Enter picks only after you've typed a filter.                                                                                                                                                                        | SAFE until you pick                      |
| Pick a destination, or drag a song onto an index row (mouse, ≥901px) | Pins the song to that one category (`assignments[trackId].override`) and PATCHes at once. The status says "‘X’ → Y. Also left 2 other categories." with **Undo**. Dropping a song on its own category does nothing. A failed save puts it back: "Couldn't save that move."                                                                          | **WRITES** `cache.json`                  |
| **Undo** in the status line                                          | Re-saves the song's whole previous assignment ("‘X’ is back."), only while that line is showing.                                                                                                                                                                                                                                                   | **WRITES** `cache.json`                  |
| **Apply to Spotify**                                                 | PATCHes only `config.confidence_threshold`, then goes to `/apply`. It doesn't itself touch Spotify. The nav locks while it saves. A failed save says "Couldn't save the setting. Try again."                                                                                                                                                       | **WRITES** `cache.json` (threshold only) |

**Fit stops.** The ruler can no longer reach 0 or 100.

| Fit              | Category slots | Notes                                                                                                                                                                         |
| ---------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50               | 15,378         | from the 03:55 hand recount                                                                                                                                                   |
| **65** (default) | **12,192**     | the app's own count (`/api/status`, live). The 03:55 hand recount said 12,194 _(ASSUMED: it also counted assignments for tracks no longer in the cache, which the app skips)_ |
| 80               | 4,148          | from the 03:55 hand recount                                                                                                                                                   |
| 40, 95           | not recomputed |                                                                                                                                                                               |

12,192 at 65 means the average track lands in about 3.8 playlists. For fewer playlists per song at
`/apply`, push the ruler towards 95 first, then press **Apply to Spotify** so it's saved.

**While a paid run streams** (set piece B; not seen now):

- **The title and the crate:** "Listening through your library…", "N tracks to sort.", and the
  crate with all 41 dividers.
- **After each batch:** the page re-reads the per-category counts from `/api/status` (read-only),
  and the tabs bump as their counts tick. No song is ever named.
- **The strip:** the status "N of M batches" ("Waiting for the first batch" before the first),
  and at the right, where Apply to Spotify will land, an ink progress band. There is no button,
  and the nav is locked.

**Looks broken, isn't:**

- **Counts barely drop as you raise the ruler on small playlists.** `trackPassesThreshold` falls
  back to the single top match when nothing clears the line (`src/lib/classification/threshold.ts:7-14`),
  so the ruler redistributes rather than empties. A playlist that does reach 0 shows its count in
  amber, and its pane says "Nothing lands here at 65." / "Spotify will get an empty playlist."
- **Songs without art.** Any song whose cover isn't found shows the plain sleeve.
- **Total batches can grow mid-run** ("6 of 7"). There are up to 3 rounds, and tracks the model
  left out or duplicated get resent, adding to the denominator.

**Real bugs and limits:**

- **No spend cap exists.** `capUsd` lives only in `src/lib/analysis/context-run.ts`, which only
  `scripts/context-test.ts` and `scripts/context-report.ts` import; no route does. The web path has
  an estimate, not a limit.
- **Failed runs.** Neither failure retries in place (a retry would re-bill without a price). Each
  offers **Back to categories** in the strip and a quiet **Home**.
  - A server error shows **"Sorting stopped."**, its message, and "Tracks sorted before it
    stopped are saved."
  - A dropped stream shows **"Lost the connection."** and "Claude may still be sorting on the
    server. Tracks it finishes are saved."
  - An unreadable cache shows **"Couldn't read your library."** with **Home**; no categories shows
    "No categories yet." with **Home**.
- **Closing the tab doesn't stop the run or save money.** By design, the job continues so its
  writes land.

**Checked:** seen for the tuning state at 1440px and 390px (the ruler in the strip at 1440px, at
the foot at 390px, the index largest first, the open playlist with art). The ruler dragging, the
Move dialog, dragging songs, Undo, the running crate and the failures are code only.

---

## `/apply` — the only Spotify write

**Nothing has ever been applied.**

- Three independent checks on 09-22: all 41 categories had `spotify_playlist_id: null`; a live
  `GET /api/spotify/playlists` returned 105 owned playlists and **zero** whose name starts with
  `✨`; no run row had the apply summary shape.
- `/api/status` reported `applied: 0` at ~19:13 EDT.

**Reach it:** the nav's **Apply**, home's **Apply to Spotify**, or **Apply to Spotify** on
`/classify`. Loading the page writes nothing.

**The page is the confirmation.** Once `/api/cache` loads, it reads:

```
[strip]                                                       [Apply]
What Apply writes
3,172 tracks into 41 new private playlists.
Each playlist's sleeve is sent as its Spotify cover. If Spotify says no, Reconnect Spotify and apply again.
Tune the fit
```

Below that is the press list: all 41 playlists in the order the write walks them (01 to 41), in
three columns. Each row has its sleeve, a two-digit number, the name without the `✨`, its track
count at the saved fit, and a bar. It uses one column on a phone.

- **Apply** is disabled, and the sentence empty, until the counts load. It then ignores presses for
  its first 600ms, so the second half of a double-click on `/classify`'s **Apply to Spotify** can't
  start the write.
- The quiet link is **Tune the fit** when nothing is unsorted, otherwise **Home**.
- When some playlists already exist, the sentence adds "and N you already have. Nothing is added
  twice."

| Control                                                                    | Result                                                                                                                                                                                   | Tag                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Tune the fit**                                                           | → `/classify`. Free now.                                                                                                                                                                 | SAFE                                                        |
| **Apply** (strip)                                                          | POST `/api/spotify/apply`, then the covers (below).                                                                                                                                      | **WRITES TO SPOTIFY — irreversible without manual cleanup** |
| **Try again** (after "N of 41 printed.")                                   | Re-POSTs. Every created playlist's id is already in `cache.json`, so the retry reads that playlist's tracks and adds only the missing ones. No duplicate playlists, no duplicate tracks. | **WRITES TO SPOTIFY**                                       |
| **Rejoin the write** (after "Lost the connection.")                        | Also re-POSTs: it joins the write if it's still running, otherwise it starts another pass that adds only what's missing. It was labelled "Reconnect" before the redesign.                | **WRITES TO SPOTIFY**                                       |
| **Retry covers** (after "N covers didn't upload.")                         | Uploads the failed covers again, one at a time.                                                                                                                                          | **WRITES TO SPOTIFY** (covers)                              |
| **Reconnect** (after "Reconnect Spotify to add covers, then apply again.") | OAuth (**WRITES** the auth block), landing on `/scope`. Covers then need another **Apply**, which adds no tracks twice.                                                                  | **WRITES** `cache.json`                                     |
| **Open Spotify** (strip, after success)                                    | A `spotify:` link.                                                                                                                                                                       | SAFE                                                        |
| **Home**                                                                   | → `/`. It is held (inert) while covers upload.                                                                                                                                           | SAFE                                                        |
| `GET /api/spotify/apply`                                                   | 405: the route is POST-only. A POST that isn't from the app's own pages gets 403.                                                                                                        | SAFE                                                        |

**What Apply does per category, in cache order** (`src/lib/pipeline/apply.ts`):

1. With no cached playlist id, it searches all owned playlists for an exact name match,
   `✨ <Category>`. None exist, so:
2. it sends `POST /me/playlists` to create a **private** playlist, for example
   `✨ Bedroom Pop Intimacy`;
3. it immediately writes that id into `cache.json`, so a crash mid-run is resumable;
4. it sends `POST /playlists/<id>/items` in chunks of 100 URIs. Only ids present in `cache.tracks`
   are sent.
5. It repeats this 41 times, then appends one run row.
6. **New: covers.** Only after the stream's `done`:
   - the browser draws each written playlist's sleeve to a 640×640 JPEG (≤256 KB);
   - it POSTs the JPEGs to `/api/spotify/cover` **one at a time**, which sends
     `PUT /v1/playlists/{id}/images`;
   - every Apply re-uploads the covers of the playlists it wrote;
   - **a cover failure never fails the Apply.**

   _Tested only against mocks: covers have never reached real Spotify._

It **never deletes, never unfollows, never touches your 105 source playlists, and never removes a
track.** The only account changes are new playlists, track adds, and the covers of the ✨ playlists
it wrote. 429s are retried per 100-track chunk (up to 5 times, honouring `retry-after`), precisely
so a retry can't re-add earlier chunks.

**While it runs** (not seen now):

- The title is "Placing tracks…", with the sentence and "Keep this page open: covers are sent after
  the last playlist."
- The strip reads "Starting…", then "Writing 18 of 41 · <playlist name>", beside an ink progress
  band.
- **The credits print as it goes.** Each written playlist's sleeve inks in: the first colour, then
  the second sliding into register. The slot being written is marked, and the rest wait as dashed
  blanks.
- The nav is locked, and there is no Cancel: the server job can't be cancelled.
- **Expect several minutes:** 41 creates, about 130 add-chunks, and 41 full paginations of your
  playlist list for the name lookup (about 1.2s each, measured). The rough estimate is 2–5 minutes
  plus the covers. **ASSUMED**: this path has never executed against this account.

**If it stops:**

- **An error:** the title becomes "16 of 41 printed." ("Couldn't start." when nothing was
  written), then the error and "What's written stays. Trying again picks up from there." The strip
  offers **Try again**, and the page **Home**.
- **The stream drops:** "Lost the connection.", "16 of 41 printed. The write may still be
  running." and "Nothing is added twice.", with **Rejoin the write** in the strip.
- **No categories:** "Nothing to apply yet." with **Home**.
- **An unreadable cache:** "Couldn't read your library." with **Try again** in the strip and
  **Home**.

**Success** (the one loud moment):

- The headline **"41 playlists on Spotify."** in the biggest type, then "All new · 3,172 tracks
  placed." and a quiet **Home**.
- The credits: every sleeve printed, each name linking `spotify:playlist:<id>`.
- A footer: "In Spotify desktop, select the ✨ playlists → right-click → Add to Folder."
- The strip counts the covers ("Adding covers: 12 of 41", then "Every cover added." or "38 of 41
  covers added.") beside **Open Spotify**.
- If covers need you, one line appears under the headline:
  - **"Reconnect Spotify to add covers, then apply again."** with **Reconnect**, when the token
    lacks the new cover permission or was revoked. _(ASSUMED to happen on the first Apply, since
    the stored token predates the scope.)_
  - **"N covers didn't upload."** with **Retry covers**, for any other failure.

  A sleeve whose cover didn't go on stays visibly out of register.

**Double-click guard:** a second POST (a double-click, a second tab, refresh-and-click) joins the run
in flight and streams its progress, instead of starting a second double-writing run. Opening
`/apply` in two tabs and hitting Apply in both shows this, but it still performs the real write.

**Gotchas:**

- **3,172 on the page, 12,192 in the write.** The page counts distinct songs
  (`src/components/apply/plan.ts`). The write adds 12,192 category memberships, because most songs
  sit in more than one playlist at 65. The list's per-playlist counts add up to the write.
- **A second Apply after a successful one** reads "3,172 tracks into 41 playlists you already have.
  Nothing is added twice." It adds nothing, so the credits say "Already up to date." with no
  tracks-placed line, but it **re-uploads all 41 covers**. From code (`src/components/apply/print-run.ts`),
  never run.
- **Covers wait for the whole write**, one at a time, because a cover upload can refresh the token
  and re-save `cache.json`. Uploading during the write could overwrite Apply's new playlist ids
  (CONFIRMED with stubs; see `docs/design/record-shop/foundation-data.md`, "Known hazard"). Closing
  the tab after the write but before the covers finish leaves some playlists without a cover. The
  next Apply adds them.
- **The apply run row has no `type` field and `cost_usd: 0`**, so `/classify`'s status line never
  shows it. This is intentional.
- ASSUMED, not verified: in dev, editing a source file mid-apply can hot-reload and reset the
  single-flight module state, letting a later POST start a second concurrent run. Don't edit files
  while a real apply is running.

**Checked:** seen for the confirmation page at 1440px and 390px, and for success at 1440px with the
write and the covers **faked** by the harness ("Every cover added.", every sleeve printed). In one
run, 4.5 seconds after the click, the credits still showed every slot blank and no cover count. A
second run, which waited 11 seconds, was correct. Not reproduced. Running, stopped, lost and the
cover-failure lines are code only. **Nothing here has ever run against real Spotify.**

---

## `/label` — the labelling study

Four queues. Each answer appends one immutable row to `data/labels/labels.jsonl`. It is deliberately
the quietest page: ink on card stock only, with no sleeves, no mood colours, no album art and no
motion. The mood colours encode cues that would prime a blind judgement.

**Reach it:** the nav's **Labels** (locked until categories exist). The site nav is hidden on this
page, and **← Home** at the top left is the way out.

**Current state** (live `GET /api/label` at ~19:13 EDT, counts only):

| Queue    | Done          |
| -------- | ------------- |
| Songs    | **100 / 100** |
| Pairs    | **200 / 200** |
| Gold set | **190 / 190** |
| Relabel  | **30 / 30**   |

**The study is finished.** The relabel gate opened between 00:11 and 00:40 EDT last night, and all
30 have been labelled since. `/api/status` agrees (`label_study_open: false`), which is also why
`/review` now shows "Mostly".

### Walking it

**First paint:**

- The `<h1>` is screen-reader-only.
- One header row, closed by a navy rule like the nav's, reads **← Home** | **Songs** Pairs Gold set
  Relabel, with `100 / 100` in mono at the right.
- The current queue is in dark ink with an underline.
- It lands on **Songs**, because no queue has open work, and shows "Every song is labelled." in the
  display serif with **Back** under it.
- There is no **Continue to…** (nothing else is open) and no **Accept all suggestions** (nothing
  remaining).

| Control                                            | Result                                                                                                                                                                                                        | Tag                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **← Home**                                         | → `/`. Pale and inert during a bulk run.                                                                                                                                                                      | SAFE                             |
| **Songs** / **Pairs** / **Gold set** / **Relabel** | Each shows its finished line: "Every song is labelled.", "Every pair is labelled.", "Every gold-set song is labelled.", "Every relabel is done."                                                              | SAFE                             |
| **Back**                                           | Jumps to the queue's last item, for example song #100 (**"dirty lies" — Naits** on 09-22). This is how you see the real UI on a finished queue.                                                               | SAFE                             |
| Tick / untick a box                                | Local state only. The line above Save lists the ticked names, or "Nothing ticked".                                                                                                                            | SAFE                             |
| **Accept suggestions** (in the guesses)            | Ticks the 5 suggested boxes. **Does not save.** This is genuinely different from the Pairs tab; don't carry the habit over.                                                                                   | SAFE                             |
| **Hide / Show**                                    | Collapses the guesses. It is **session-wide and sticky** across songs and tabs until reload. The line becomes "Suggestions hidden for this song".                                                             | SAFE                             |
| **Back / Next** in the sticky bar                  | Walk the queue. Back is disabled at #1, and Next is disabled on an unanswered item. Past the last one you return to the finished line.                                                                        | SAFE                             |
| **Save**, **Can't judge**                          | POST `/api/label`, which appends one permanent line. Saving an already-labelled song does **not** overwrite: it adds a **second row for the same track**, exactly the duplicate that skews agreement numbers. | **WRITES the frozen label file** |

**A song screen (Songs, Gold set, Relabel):**

- **The song:**
  - its title in the display serif, then the artist, then the genres, if any;
  - a Spotify embed player that actually plays;
  - from 901px the song holds still in a left column.
- **The model's guesses,** in a recessed well headed "The model's guesses — these are what you are
  being compared against", with **Hide** and **Accept suggestions**. The well lists five category
  names, each with the model's score. Those scores are left out of this doc on purpose (the
  blind-labelling rule).
- **The answer sheet:** the **41 categories** on card stock, each with a stamped ink box, its name
  and its In/Out definition. They are shuffled per song (seeded by track id) so list position can't
  bias you.
- **A sticky bar:** the ticked-names line, **Back** · **Next**, then **Can't judge** and **Save**.
  Save is a card-and-navy button; no orange prints on this page.

**Pairs → Back** is **the dangerous one.** It shows pair #200: **"SUICIDE" — Lil Fard** with the
category **Bedroom Pop Intimacy** (names from 09-22).

- The category name is in the display serif, with its definition.
- The guesses well gives the model's verdict for the pair. It is a sentence that includes its
  score, not reproduced here.
- **There is no Save button on Pairs. The answer buttons ARE the save.**
  - **Yes** and **No** (card-and-navy buttons) and **Can't judge** each write the instant you
    click, with no confirm.
  - **"Accept suggestion" here also writes immediately**, unlike on Songs.

  That makes four one-click writes on that screen.

- **Back** and **Next** sit below a rule, away from Yes. Click only those.

**Gold set → Back** shows `190 / 190` and "Every gold-set song is labelled."; Back lands on
**"Chasing Shadows" — Alex Warren** (09-22). The UI is identical to Songs, and so is the rule.

**Accept all suggestions** appears only while a queue has open items, so right now nowhere. When it
shows:

- It asks "Save the model's answer for the N remaining?" on its own row, with **Accept all** and
  **Cancel**. Focus starts on Cancel.
- **Accept all** writes up to N rows, one request at a time. The row reads "Saving N of M" with
  **Stop**, and everything else is locked. It ends with "Saved N of M."

**Keyboard:** there are no shortcuts anywhere in `src/components/label/`: no `1`–`5`, no Enter to
save. Everything is Tab plus Space or Enter.

- Focus jumps to the song title on each new item.
- From there, Tab walks: the Spotify player → Hide → Accept suggestions → the 41 boxes → Back →
  Next → Can't judge → Save.
- Disabled buttons are skipped.
- Focus is a 2px dark-ink outline (it was brass before the redesign).

**One-line rule:** everything that _navigates or reveals_ is free: tabs, Continue to…, Back, Next,
Hide/Show, ticking boxes, and Songs' own "Accept suggestions". Everything that _answers_ writes a
permanent line: `Save`, `Can't judge`, `Accept all`, and on Pairs also `Yes`, `No` and `Accept
suggestion`.

**Checked:** seen for the finished Songs line at 1440px and 390px (the site nav absent, the header
row, the counter). The song and pair screens are code only: with every queue finished, no open item
exists to shoot, and the harness pressed nothing.

---

## Known rough edges

Real things you'd otherwise think you broke.

| Thing                                                            | Why it's not your fault                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/label` opens on "Every song is labelled."**                  | Every queue is finished. **Back** shows the last item of a queue; don't save there.                                                                                                                                                                                                                                                     |
| **Checkboxes are empty on a song you already labelled**          | This is deliberate. `LabelApp.tsx` keeps answers for Back **in memory only** ("Never loaded from disk"), though the file still has every row. It's the same reason Pairs never shows "Saved as yes." for older work.                                                                                                                    |
| **The blindness e2e test fails, on purpose**                     | `tests/e2e/label.spec.ts:137` asserts that `GET /api/label` emits no `score`, `matches`, `rank`, `bin` or `assignments` key. It fails with `GET /api/label has key "score"`, because assisted labelling (5b7bb21, 2026-09-21) put the model's scores on every GET. It is left failing deliberately; see commit 736780a. _(Not re-run.)_ |
| **Some songs show a flat square instead of a cover**             | That's the plain sleeve. Spotify's oEmbed had no art for that track, or `/api/art` answered 404, 502 or 504. A "no art" answer is retried after 24 hours.                                                                                                                                                                               |
| **`data/artwork.json` appears or changes**                       | Album art on home, `/review`, `/classify` and `/diff` records each cover's URL there. It never touches `cache.json`.                                                                                                                                                                                                                    |
| **The first Apply asks you to reconnect for covers**             | The cover permission (`ugc-image-upload`) is new, and a token granted before it can't upload. Reconnect, then Apply again (no tracks are added twice). _(ASSUMED; never run.)_                                                                                                                                                          |
| **Hide doesn't un-assist the song already on screen**            | Once the guesses have painted for an item, it's latched `assisted: true` even if you Hide before saving. Hiding only produces blind rows for songs you reach _after_ hiding.                                                                                                                                                            |
| **Spotify embeds**                                               | These are live `open.spotify.com` iframes. A network that blocks them shows Spotify's own error box inside the player; nothing else is affected.                                                                                                                                                                                        |
| **Category order changes between songs**                         | An intentional per-track shuffle.                                                                                                                                                                                                                                                                                                       |
| **The home crate doesn't replay its entrance**                   | It plays once per browser session (`sessionStorage`). A new tab or window plays it again.                                                                                                                                                                                                                                               |
| **A nav step ignores a click for a beat after a page change**    | It waits for this page's `/api/status` answer before becoming a link; its colour shows the previous answer meanwhile.                                                                                                                                                                                                                   |
| **Every nav item goes pale mid-job**                             | The nav lock. A scan, a scope save, a propose, a `/review` save, a classify run, a Fit save, or an Apply and its covers is running. The items come back when it ends.                                                                                                                                                                   |
| **`cache.json` changes while you watch it**                      | Any Spotify-backed request without a live cookie refreshes the token and re-saves the whole cache. `auth.expires_at` moved twice in 90 seconds on 09-22 from read-only GETs alone. `/api/status` and `/api/art` never do this.                                                                                                          |
| **"Japanese Pop Hits" ×6**                                       | Six real playlists with six distinct ids. Not the dedupe bug.                                                                                                                                                                                                                                                                           |
| **Two EventSources in the Network tab**                          | Only on `/scan`: React StrictMode in dev mounts it twice, and the first stream is closed at once. `/classify` and `/review` read the cache first and never open the discarded mount's stream.                                                                                                                                           |
| **`cache.playlist_snapshots` has 106 entries for 105 playlists** | The extra, `7kTRhp8EjPGEHyfDf3vx1o`, is a playlist you no longer own. Snapshots merge and never prune, and the scan loop only walks `scope.included_playlist_ids`, so it's inert.                                                                                                                                                       |
| **491 rows vs 490 items** (as of 03:55)                          | One gold track (`5zcoYCmeIL392as1bwIYce`) has two pass-1 rows. Pre-existing.                                                                                                                                                                                                                                                            |
| ~~**Progress total goes 106 → 105**~~                            | Fixed in the redesign: every scan progress event carries the same total.                                                                                                                                                                                                                                                                |
| ~~**The headline serif is a system font**~~                      | Fixed in the redesign: Caprasimo and Libre Franklin load through `next/font`.                                                                                                                                                                                                                                                           |
| ~~**`/label` opens on a live Relabel song**~~                    | No longer true: all 30 relabels are done.                                                                                                                                                                                                                                                                                               |

---

## Evidence classes

- **Live against real Spotify (09-22):** the playlist list (105, 0 duplicate ids, 5,384 slots), the
  diff payload and its 41.3s timing, the zero-`✨`-playlists check, and the token refresh observed
  rewriting `auth.expires_at`.
- **Live against the running dev server:**
  - 09-22: `/api/config`, `/api/cache`, `/api/label`, the served HTML of the old `/`.
  - 09-23 ~19:13 EDT, read-only: `/api/status` (the counts, `label_study_open: false`) and
    `/api/label` (queue progress only; no score was printed).
- **Read from disk (09-22, and again 09-23 ~03:55 EDT):** the rows marked _(03:55)_ in
  [State on disk](#state-on-disk-right-now), the fit recounts at 50 and 80, and the label file.
  `data/` was **not** read for the redesign update.
- **The redesign update (09-23 ~19:20 EDT):**
  - **Code:** every heading, button, state and destination was read from the page code in the
    `feat/redesign` working tree. Page builders were still editing it; for example, "cutoff"
    became "fit" across the UI during this update, and this doc uses the newer word.
  - **Harness screenshots:** each page's **Checked** line names what was seen. The harness is
    `scratchpad/harness/shoot.mjs`, a local run against the dev server with Spotify, Claude, album
    art and every write faked in the browser; only `GET /api/cache`, `/api/config`, `/api/label`
    and `/api/status` reach the real server. Shots are in
    `scratchpad/redesign/build/docs/r1`–`r3`.
  - **Not covered:** the evening (dark) stock and reduced motion were not shot for this doc.
- **Read from code only, never executed:** everything `/apply` does (the write **and** the cover
  upload), the reclassify failure and its cost, and the setup wizard's cards 2–4.
  `tests/e2e/happy-path.spec.ts` was not run for this update.
