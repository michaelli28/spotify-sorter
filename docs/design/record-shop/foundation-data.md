# Record Shop — data and server foundation (F3)

What the page agents build against. Spec: `docs/superpowers/specs/2026-09-23-record-shop-redesign.md`
§3.3, §3.4, §3.6–3.8, §4.3, §4.4.

## Never run live

- **Cover upload** (`POST /api/spotify/cover` → `PUT /v1/playlists/{id}/images`): tested only against
  msw. It has never reached real Spotify, and no real token has held `ugc-image-upload` yet. The
  Apply write it follows has never run live either. The `reconnect` answer (revoked refresh token)
  is tested against an msw `invalid_grant` only.
- **256 KB cap**: read as 262,144 characters of base64 (Spotify: "maximum payload size is 256 KB").
  Unverified whether Spotify means 256,000.
- **`/api/art`**: tested only against msw. oEmbed itself was verified live on 2026-09-23 by the
  mockup's Python script (113 of 115, hosts `image-cdn-{fa,ak}.spotifycdn.com`), not by this route.
- Smoke-tested on the dev server against real `data/` (read-only): `/api/status` (41 counts summing
  to 12,192 at cutoff 65, the brief's figure), `/api/library/unsorted` (0 unsorted), and the 400 paths
  of `/api/art` and `/api/library/unsorted`. No valid `/api/art` id was requested: that writes
  `data/artwork.json` and calls oEmbed.

## Known hazard: cover POSTs during Apply lose `cache.json` data (unfixed)

CONFIRMED with fetch stubbed (reviewer probe `scratchpad/redesign/build/f3-review/cover-race.probe.test.ts`,
re-run after these fixes): a cover POST without the access cookie goes through `withSpotify` →
`ensureFreshToken` (`src/lib/spotify/client.ts:18-34`), which reads `cache.json`, refreshes and writes it
back. A running Apply keeps the cache in memory from its start (`src/lib/pipeline/apply.ts:38`) and writes
that copy back at each new playlist (`:79`) and at the end (`:111`).

- Apply's next write restores the refresh token the cover route just replaced (probe: `rt2` → `rt1`).
- A cover refresh that read the cache before Apply's write erases Apply's new playlist id and its run
  record (probe: `c2 pl after cover: null`, `runs: 0`).
- When: `sorter_access_token` has `Max-Age=3600` (`app/api/auth/callback/route.ts:71`) and nothing sets it
  again, so from an hour after connecting every cover POST refreshes.
- ASSUMED: if Spotify retires the old refresh token when it issues a new one, the owner must reconnect
  after the first such Apply.
- Fix (files F3 doesn't own): `ensureFreshToken` keeps the fresh access token in memory until it
  expires; `runApplyFromCache` re-reads the cache before each write and patches only its own keys (or
  one in-process lock around every cache read-modify-write); a test running Apply and covers together.
- Until then: POST covers only after the Apply stream's `done` event, one at a time. `done` is sent
  after `runApplyFromCache` resolves (`src/lib/pipeline/event-stream.ts:21`), so no write overlaps.
  This departs from spec §3.4 ("after the category event for i+1").

## Routes

### `GET /api/art/[trackId]`

The `src` of `<AlbumArt>`. Reads and writes only `data/artwork.json`, never `cache.json`.

| Case                                                                | Response                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `Sec-Fetch-Site: cross-site` (another website's `<img>`)            | `403 {error:"cross_site"}`, no fetch                           |
| id not `^[A-Za-z0-9]{22}$`                                          | `400 {error:"bad_track_id"}`                                   |
| stored url on an allowed host                                       | `302 Location: <url>`, `Cache-Control: private, max-age=86400` |
| stored `url: null`, fetched < 24 h ago                              | `404 {error:"no_art"}` (no fetch)                              |
| miss (or null ≥ 24 h, or stored url on a foreign host) → oEmbed     | see below                                                      |
| oEmbed `thumbnail_url` on `https:` + `*.spotifycdn.com`/`i.scdn.co` | stored, `302` as above                                         |
| oEmbed 4xx (not 429), no thumbnail, or a foreign host               | stored as `url: null`, `404 {error:"no_art"}`                  |
| oEmbed 429, 5xx, network failure, or a 200 body that isn't JSON     | `502 {error:"upstream"}`, nothing stored                       |
| oEmbed headers or body slower than 8 s                              | `504 {error:"timeout"}`, nothing stored                        |

At most 4 oEmbed requests in flight per server process (a module-level queue). `SPOTIFY_OEMBED_BASE`
overrides `https://open.spotify.com`, like `SPOTIFY_API_BASE`.

### `GET /api/library/unsorted?limit=N`

Read-only (`readCache` only). `limit` is an integer 1–200, default 50; anything else is
`400 {error:"bad_limit"}`. A cache from another version answers `409 {error:"cache_version_mismatch"}`.

```json
{ "total": 297, "tracks": [{ "id": "…", "title": "…", "artist": "…" }] }
```

`total` counts every unsorted track (no assignment, the `unsortedTrackIds` rule). `tracks` is sorted newest scan first (by `first_seen`; Spotify's order inside a scan), blind-filtered, then cut to `limit`, so older leftovers never push the latest scan out. The list can hold fewer than `total`.

### `POST /api/spotify/cover`

Guarded by `rejectUnlessFromApp` (403 text). Body (zod):
`{ categoryId: string (min 1), jpegBase64: bare base64, 1…262,144 chars }`. No `data:` prefix.

| Case                                                   | Response                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| body over 262,144 + 1,024 bytes (read stops there)     | `413 {error:"too_large"}`                                         |
| body fails the schema or isn't JSON                    | `400 {error:"bad_body"}`                                          |
| cache from another version                             | `409 {error:"cache_version_mismatch"}`                            |
| category unknown, or its `spotify_playlist_id` is null | `404 {error:"no_playlist"}`                                       |
| not connected (`auth` null), or refresh token revoked  | `401 {error:"reconnect"}` → "Reconnect Spotify to add covers"     |
| Spotify 401 or 403 (token predates `ugc-image-upload`) | `403 {error:"missing_scope"}` → "Reconnect Spotify to add covers" |
| uploaded (Spotify 202)                                 | `200 {ok:true}`                                                   |
| anything else (Spotify 5xx, other refresh failure)     | `502 {error:"upload_failed"}` → "N covers didn't upload" + Retry  |

The token comes from the `sorter_access_token` cookie through `withSpotify`, like the other Spotify
routes. An expired cookie refreshes the token and re-saves the cache: see **Known hazard** above. A 429
retries through `withRetry429`. Upload covers one at a time: the route has no queue of its own.

### `GET /api/status` (`readAppStatus()`): two new fields

Still `readCache` only.

- `category_counts: Record<categoryId, number>`: tracks per category at the saved threshold. Apply's
  rule: existing categories only, only tracks still in the library, and a track below the cutoff
  still counts in its top match. `{}` on a version mismatch. Re-fetch after each classify `batch` event.
- `label_study_open: boolean`: `isLabelStudyOpen()`. Render "Mostly" only when it is `false`.

### `PATCH /api/cache`: `temperature`

A category may carry `temperature: "dusk" | "charge" | "glow" | "haze"`. Save it through
`buildCategoriesPatch` (the draft's `temperature` is copied when set). "Auto (guess)" = leave it off
the draft; the key is then absent from the file (never `null`). An unknown value answers
`400 {error:"bad body"}` and nothing is written. "A rename never clears it" holds for these helpers; the
review page's real save path still drops it (see **For the page agents**).

## Helpers

| Module                        | Export                                                        | What it does                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/sleeves/temperature` | `TEMPERATURES`, `Temperature`                                 | the one `as const` list; schema and sleeves derive from it                                                                                                                                                                                                               |
| `src/lib/cache/schema`        | `CategorySchema.temperature`                                  | `z.enum(TEMPERATURES).optional()`, no version bump                                                                                                                                                                                                                       |
| `src/lib/categories/merge`    | `DraftCategory.temperature?`                                  | carried by rename and merge (merge keeps the target's)                                                                                                                                                                                                                   |
| `src/lib/labeling/blind`      | `blindTrackIds()`                                             | `{ids, sample: "present" \| "missing"}` from `sample.json` (random, relabel, pairs[].track_id) and `gold-sample.json` (the gold set is labelled blind too); missing = empty set; malformed = throws                                                                                                                                  |
|                               | `filterBlind(ids)`                                            | `ids` minus the sample and gold set, order kept                                                                                                                                                                                                                                       |
|                               | `isLabelStudyOpen()`                                          | true while any random, gold, pair or relabel item has no label, from `sample.json`, `gold-sample.json` and `labels.jsonl` only (never definitions or category names, so a rename can't reopen a finished study). No sample = false. A file it can't read or parse = true |
| `src/lib/artwork/store`       | `readArtwork()`, `recordArtwork(id, url \| null, fetchedAt)`  | missing or corrupt file = empty; writes serialized in-process, re-read inside the queue, tmp + rename                                                                                                                                                                    |
| `src/lib/artwork/oembed`      | `fetchThumbnail(id)`, `isAllowedArtUrl(url)`, `ArtFetchError` | the 4-slot, 8 s oEmbed fetch and the host allowlist                                                                                                                                                                                                                      |
| `src/lib/spotify/cover`       | `uploadPlaylistCover(playlistId, jpegBase64, token)`          | `PUT …/images`, `image/jpeg`, base64 body, `withRetry429`; throws `{status}`                                                                                                                                                                                             |
|                               | `MAX_COVER_BASE64_BYTES`                                      | 262,144: import it in the canvas export instead of repeating the number                                                                                                                                                                                                  |
| `src/lib/spotify/scopes`      | `SPOTIFY_SCOPES`                                              | now includes `ugc-image-upload`                                                                                                                                                                                                                                          |
| `src/lib/pipeline/scan`       | `runScan` progress                                            | every `playlists` event carries `total = included playlists`. Liked Songs reports only on its own `liked` stage, as before                                                                                                                                               |

`runApplyFromCache`'s result names each playlist's `category_id`, so the credits match rows by
id: a rename in another tab between page load and Apply changes the name, never the id.

## For the page agents

- **Review:** `src/components/review/useCategorySource.ts` `categoriesFrom()` builds drafts without
  `temperature`. Until it copies `c.temperature`, any save clears the owner's colour. Also, a colour
  change is not yet counted by `categoryEdits` (`src/lib/categories/edits.ts`).
- **Diff:** the arrivals list is `GET /api/library/unsorted`. Build the sentence from `total`, not the
  list length.
- **Apply:** POST covers after the stream's `done` event, one at a time, until the **Known hazard** is
  fixed. `missing_scope` and `reconnect` → the Reconnect line, no Retry. Everything else → Retry
  covers.
- **Scan:** `playlists` totals no longer include Liked Songs. The first event used to be N+1.
