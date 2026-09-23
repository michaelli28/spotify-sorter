# Daylight Record Shop — design DNA

**Three words:** printed, crate-dug, generous.

**Concept.** Your library as a record shop. The 41 categories are divider cards standing in one wooden crate, each with its own two-ink risograph sleeve. The records behind each divider are drawn to scale, so the crate is also the chart of your library: the biggest categories stand at the front as thick stacks, the smallest are thin slivers at the back. Apply is the moment the shop prints its playlists.

**Theme: paper by day, an evening stock by night.**

- **Day (default):** risograph ink only reads as ink when it lands on paper, where two inks overprint (multiply) into a third. A paper page also stays legible on an interview screen-share in a lit room.
- **Evening stock:** the owner sorts in the evening and at 1am with headphones on, and impeccable's theme table says "music app for headphone listening at night → dark". So when macOS is in dark mode (`prefers-color-scheme: dark`), the shop switches stock:
  - The navy ink becomes the paper, and a cream "riso white" becomes the ink.
  - The printed objects keep their own stock: sleeves, divider tabs and album art.
- **Action for the owner:** `.impeccable.md` says "dark by default". If this direction wins, that line becomes "paper by day, evening stock when the OS is dark".

**Mockups** (all numbers and songs are real, from `context/data.json`):

| File                                            | What it shows                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `home.html`                                     | returning user: 3,172 tracks, 41 categories, none on Spotify                                                                                                                                     |
| `review.html`                                   | the 41 categories, with 04 open                                                                                                                                                                  |
| `shots/{home,review}-{1440,390}.png`            | full page, day stock (in the full-page captures the fixed action bar appears mid-page; that is how full-page capture draws fixed elements)                                                       |
| `shots/{home,review}-fold-{1440,390}.png`       | first screen, day stock                                                                                                                                                                          |
| `shots/{home,review}-night-fold-{1440,390}.png` | first screen, evening stock (captured with `_work/night.mjs`, which is `snap.mjs` plus `colorScheme: "dark"`; adding `?stock=night` to either file's URL previews it on a machine in light mode) |

**Generators** (in `_work/`):

- `run.py` builds both pages.
- `covers.py` is the reference implementation of the sleeve algorithm (`python3 covers.py sheet.html` prints all 41).
- `contrast.py` computed every ratio in this file.
- `detail.mjs`, `bin.mjs` and `interact.mjs` are the measurement and interaction checks quoted below.

---

## 1. Palette (OKLCH)

The neutrals are tinted toward the navy of the text ink. By day, text is printed in navy riso ink, never black. Orange is the only action ink and never appears in a sleeve.

### Day stock

| Token                              | OKLCH                                             | sRGB              | Role                                                                        |
| ---------------------------------- | ------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `--paper`                          | `oklch(0.958 0.017 88)`                           | #f6f1e5           | page background (with a 7% navy fibre-noise tooth)                          |
| `--paper-deep`                     | `oklch(0.922 0.026 84)`                           | #ede4d2           | the review bin, the crate's divider bodies, plain sleeves                   |
| `--card`                           | `oklch(0.978 0.010 90)`                           | #faf8f0           | lifted stock: divider rows, open sheet, dialog                              |
| `--ink`                            | `oklch(0.285 0.075 266)`                          | #18274f           | text 1, keylines, focus ring, bars                                          |
| `--ink-2`                          | `oklch(0.435 0.060 266)`                          | #425073           | text 2: lede, descriptions, artists, status                                 |
| `--ink-3`                          | `oklch(0.500 0.045 266)`                          | #57637e           | text 3: catalogue numbers, chart axes, the empty sleeve slot                |
| `--rule`                           | `oklch(0.815 0.030 262)`                          | #b8c3d7           | hairlines between rows                                                      |
| `--rule-strong`                    | `oklch(0.600 0.050 264)`                          | #71809f           | input and card keylines, the chart's other bars, button underlines          |
| `--tint`                           | `oklch(0.905 0.030 264)`                          | #d6e0f4           | the open divider's fill (desktop)                                           |
| `--accent`                         | `oklch(0.735 0.165 52)`                           | #f88736           | riso orange: the one primary action per view                                |
| `--accent-press`                   | `oklch(0.690 0.170 48)`                           | #ed7429           | primary, pressed                                                            |
| `--success`                        | `oklch(0.500 0.085 195)`                          | #017272           | "on Spotify" marks, apply credits                                           |
| `--danger`                         | `oklch(0.500 0.170 22)`                           | #af2934           | Delete, errors, Wipe & re-propose                                           |
| `--warn` / `--warn-ink`            | `oklch(0.850 0.140 88)` / `oklch(0.500 0.100 72)` | #f4c855 / #865812 | warning fill / warning text                                                 |
| `--kraft`                          | `oklch(0.845 0.045 72)`                           | #dfc8ad           | the crate's wood: slats, sides, back rail (graphic, and ground for the key) |
| `--hollow`                         | `oklch(0.560 0.035 70)`                           | #82715e           | the crate's inside: hand-hold and slat gap (graphic only)                   |
| `--rec-edge`                       | `oklch(0.700 0.040 264)`                          | —                 | record-top hairlines in the crate (graphic only)                            |
| `--on-accent`                      | `oklch(0.285 0.075 266)`                          | #18274f           | the label on orange and on a warn fill: navy in **both** stocks             |
| `--tab-stock` / `--tab-ink`        | card / navy                                       | —                 | a divider tab's own card and its number: the same in both stocks            |
| `--tab-pressed` / `-ink` / `-edge` | navy / paper / navy                               | —                 | the open or current tab, printed reversed                                   |
| `--scrim`                          | navy at 48%                                       | —                 | behind the price tag (the checklist asks for 40 to 60%)                     |

### The four temperatures (what a tab's colour means)

Every category has a temperature, read from cue words in its name (see 4.1). **Each temperature has exactly one ink A,** and a divider tab is that ink at 42% on tab card, mixed in OKLab (an OKLCH mix toward paper swings blue through green):

| Temperature | Means                    | Ink A  | Tab       | On this library                                                                                     |
| ----------- | ------------------------ | ------ | --------- | --------------------------------------------------------------------------------------------------- |
| dusk        | dark, moody, heavy       | violet | `#cdbfe2` | 8 categories, 1,837 adds                                                                            |
| charge      | high energy, EDM, trap   | pink   | `#ffb6ce` | 12 categories, 1,777 adds                                                                           |
| glow        | warm, sunny, dance, soul | yellow | `#f9f2b4` | 8 categories, 1,500 adds                                                                            |
| haze        | soft, dreamy, intimate   | aqua   | `#c1e3ed` | 13 categories, **7,078 adds** (all five of the largest categories are haze, and the crate shows it) |

Tokens: `--t-dusk`, `--t-charge`, `--t-glow` and `--t-haze`, each `color-mix(in oklab, <ink A> 42%, var(--tab-stock))`. The one-line key "dusk · charge · glow · haze" (tab-shaped swatches, mono) sits under the home crate, stencilled on its lower slat, and at the left of the review bin's column head.

### Riso inks (the drums)

There are 9 riso-ink approximations, all inside sRGB. Orange is excluded because it is the action ink. Sunflower and mint were dropped when ink A became one per temperature.

| Ink      | OKLCH                    | sRGB    | Drum                       |
| -------- | ------------------------ | ------- | -------------------------- |
| yellow   | `oklch(0.915 0.175 103)` | #f9e740 | A (glow)                   |
| pink     | `oklch(0.68 0.215 355)`  | #f64e9f | A (charge), B (glow, haze) |
| violet   | `oklch(0.62 0.13 300)`   | #9372c8 | A (dusk), B (charge, haze) |
| aqua     | `oklch(0.78 0.10 222)`   | #67c6e5 | A (haze)                   |
| red      | `oklch(0.64 0.185 20)`   | #e7515b | B (glow)                   |
| teal     | `oklch(0.555 0.090 200)` | #158388 | B (all four)               |
| mblue    | `oklch(0.48 0.14 264)`   | #3458ac | B (dusk, charge, haze)     |
| fblue    | `oklch(0.44 0.09 264)`   | #395184 | B (dusk, charge)           |
| burgundy | `oklch(0.48 0.10 345)`   | #84446a | B (dusk, glow)             |

### Evening stock (`prefers-color-scheme: dark`)

The same hue (navy 266) at three lightness steps, so depth comes from surface lightness, never shadow. The navy is at chroma 0.06 to 0.085, a real navy stock rather than slate grey. Accents keep their hue.

| Token                                   | OKLCH                                                   | sRGB                        | Role                                                  |
| --------------------------------------- | ------------------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| `--paper`                               | `oklch(0.235 0.068 266)`                                | #0f1b3e                     | page (with a 4.5% cream fibre tooth)                  |
| `--paper-deep`                          | `oklch(0.200 0.058 266)`                                | #091430                     | wells: the review bin, the crate's dividers           |
| `--card`                                | `oklch(0.275 0.074 266)`                                | #16254c                     | lifted: rows, sheet, dialog                           |
| `--tint`                                | `oklch(0.345 0.085 266)`                                | #243665                     | the open divider                                      |
| `--ink` / `--ink-2` / `--ink-3`         | `0.925 0.024 86` / `0.815 0.030 84` / `0.735 0.032 82`  | #ede5d5 / #ccc1ad / #b3a893 | cream text; body weight drops to 370 on this stock    |
| `--rule` / `--rule-strong`              | `0.390 0.060 266` / `0.600 0.055 266`                   | #364465 / #7180a2           | hairlines / keylines and the chart's other bars       |
| `--accent` / `--accent-press`           | `0.735 0.155 52` / `0.690 0.160 48`                     | #f48a41 / #e87835           | orange, a touch less chroma                           |
| `--danger` / `--success` / `--warn-ink` | `0.745 0.135 24` / `0.790 0.085 192` / `0.860 0.110 88` | #f68882 / #75ccc8 / #efcd79 | lifted for a dark ground                              |
| `--kraft` / `--hollow`                  | `0.500 0.055 66` / `0.175 0.030 62`                     | #795d41 / #1a0d03           | the crate under a lamp                                |
| `--tab-pressed` / `-ink`                | cream / paper-deep                                      | —                           | the open tab prints in the ink, as by day (spec §7.6) |
| `--scrim`                               | `oklch(0.130 0.040 266 / 0.66)`                         | —                           | behind the price tag                                  |

Unchanged on purpose: `--on-accent` (navy), the tab tints, and the sleeves' own card-coloured paper. On the navy page, sleeves and tabs read as physical objects laid on a dark counter.

### WCAG contrast (computed by `_work/contrast.py`, not estimated)

**Day stock**

| Foreground on background              | Ratio        | Needs          | Where                                  |
| ------------------------------------- | ------------ | -------------- | -------------------------------------- |
| ink on paper                          | 12.83        | 4.5            | body, headings, h1                     |
| ink-2 on paper                        | 7.06         | 4.5            | lede, status line                      |
| ink-3 on paper                        | 5.33         | 4.5            | catalogue numbers                      |
| ink on paper-deep                     | 11.50        | 4.5            | text in the bin                        |
| ink-2 on paper-deep                   | 6.33         | 4.5            | column head, key                       |
| ink on card                           | 13.61        | 4.5            | divider rows, sheet, dialog            |
| ink-2 on card                         | 7.49         | 4.5            | descriptions, artists, dialog body     |
| ink-3 on card                         | 5.65         | 4.5            | chart axis labels                      |
| ink on tint / ink-2 on tint           | 10.92 / 6.01 | 4.5            | open divider                           |
| paper on ink                          | 12.83        | 4.5            | reversed tab                           |
| on-accent on accent / accent-press    | 5.86 / 4.92  | 4.5            | primary label                          |
| danger on card / on paper             | 6.16 / 5.81  | 4.5            | Delete, errors                         |
| success on paper                      | 5.09         | 4.5            | "on Spotify", credits                  |
| warn-ink on paper / on-accent on warn | 5.42 / 9.13  | 4.5            | warnings                               |
| ink on kraft                          | 8.97         | 4.5            | the key stencilled on the crate's slat |
| rule-strong on card / on paper        | 3.71 / 3.50  | 3.0 (non-text) | keylines, chart bars, underlines       |

**Evening stock:** ink on paper 13.46, ink-2 on paper 9.46, ink-3 on paper 7.14, ink on card 12.00, ink-2 on card 8.43, ink-3 on card 6.37, ink on tint 9.35, ink-2 on tint 6.57, danger on card 6.24, success on paper 9.00, warn-ink on paper 10.95, ink on kraft 4.87 (the key), on-accent on accent 5.88 (pressed 4.94), open tab (paper-deep on cream) 14.58, rule-strong on card 3.78 (non-text).

**Divider tabs (navy number on the tint, both stocks):** dusk 8.40, charge 8.88, glow 12.67, haze 10.70.

**Result: 0 failing pairs in either stock.** Text never sits on a sleeve's inks. Sleeves are graphics, and their labels always sit on paper or card.

---

## 2. Type

The font-selection procedure, as `impeccable` prescribes it:

1. **Brand words:** printed, crate-dug, generous.
2. **The reflexes I rejected:** Space Grotesk and DM Serif Display, which are on the reject list, and Archivo Black, the stock "poster" grotesk.
3. **The physical object:** the soft, fat serif of 1960s and 70s record sleeves and shop windows. The _Pet Sounds_ cover is set in Cooper Black, and hand-lettered bin dividers use the same shape.
4. **Cross-check:** it isn't a trend serif and isn't on the list, and it has a concrete physical referent.

| Role    | Font                                                                                                                       | Source and licence                                   | Loading                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Display | **Caprasimo** 400 (a free, Cooper-descended soft fat face)                                                                 | Google Fonts, SIL OFL 1.1                            | `next/font/google` (`Caprasimo`, weight 400, present in next's font-data.json) |
| Body    | **Libre Franklin**, variable 350 to 700 (the American newspaper and poster gothic, the lettering of shop signs)            | Google Fonts, SIL OFL 1.1                            | `next/font/google` (`Libre_Franklin`, variable axis)                           |
| Mono    | **Geist Mono** 400/500, for catalogue numbers, stickers, the key and chart axes only; never prose, never as "tech flavour" | `geist` npm package (already installed), SIL OFL 1.1 | `geist/font/mono` (already in `app/layout.tsx`)                                |

The Pangram fonts are not used.

Caprasimo is for display only: page titles, the h1, a category's name in the open sheet and under the crate, the price in a dialog, and the primary button's label. List rows use Libre Franklin 600. **Caprasimo ships 400 roman only,** so display headings set `font-synthesis: none` and `em { font-style: normal }`. `HomeView`'s `headline()` wraps words in `<em>`, and those now print as plain text instead of a faked italic. The `<em>`s can stay.

**Scale: 1.25 (major third), fixed rem in the product UI and fluid only for display.**

| Token              | Size                       | Use                                                          |
| ------------------ | -------------------------- | ------------------------------------------------------------ |
| `--text-label`     | 0.8rem                     | mono catalogue numbers, stickers, the key, axes. Never prose |
| `--text-body`      | 1rem                       | all prose, links, status, row descriptions                   |
| `--text-lead`      | 1.25rem                    | row names, lede, primary button, wordmark                    |
| `--text-title`     | 1.563rem                   | category name in the sheet and under the crate               |
| `--text-display-3` | 1.953rem                   | spare step (setup and apply section heads)                   |
| `--text-display-2` | clamp(2.441rem → 3.052rem) | page titles, "What Apply writes", dialog price               |
| `--text-display-1` | clamp(3.052rem → 5.96rem)  | home h1 and the apply credits headline                       |

Tabular lining numerals (`.num`) apply wherever a count sits in a column. Display text uses a line-height of 0.98 to 1.02 with -0.01em tracking. Body is 1.55. The crate's tabs are the one place label type may drop to 11px (at 390, where the tabs are an index, not a control). Everywhere else it holds at 0.8rem.

**Spacing (4pt, semantic names):** `--space-3xs` 4 · `2xs` 8 · `xs` 12 · `sm` 16 · `md` 24 · `lg` 32 · `xl` 48 · `2xl` 64 · `3xl` 96. Also `--gutter: clamp(16px, 4vw, 48px)` and `--page: 1200px`. Rhythm comes from contrast: tight inside a row (8 to 12), 8px between review dividers, and 64 to 96 between sections.

---

## 3. Layout

### Home (returning user)

Archetype: _dashboard, one primary signal_, without the hero-metric template: the number is a sentence, not a big stat over a small label.

- **Masthead:** the wordmark only. The IA spec hides SiteNav on `/`, and the home's own routes are its ways on, so no link is printed twice.
- **Left column:**
  - The h1 "3,172 tracks, sorted into 41 categories." is the headline sentence, followed by the lede "None on Spotify yet."
  - Then the one primary action, **Apply to Spotify**.
  - At the bottom, aligned with the crate's base, is a ruled list of routes: Check for new tracks, Categories, Labels, and Reconnect Spotify in ink-2. It has no notes.
- **Right column, the crate (the signature graphic, and a chart):**
  - The 41 dividers stand in one kraft crate drawn in perspective (back rail, sides, two front slats), **ordered by size, largest at the front**.
  - Behind each divider stand its records, drawn as record-top hairlines tinted with the divider's temperature. The depth they take is its track count: 3.2u for the divider card plus 1u per 72 tracks. So Bedroom Pop (1,442) is a 23.2u stack at the front, and Stutter House (14) a 3.4u sliver at the back.
  - The five largest categories are all haze, so the front of the crate reads aqua. That is the library's real shape.
  - Tabs carry catalogue numbers, the same numbers as the press list and the review tabs. They stagger across six columns as in a real bin.
  - The current divider's tab is reversed, and its record stack is outlined in ink with darker hairlines.
  - Its sleeve is pulled up in front, printed with its riso cover, with a price-gun sticker giving the real track count. The key "dusk · charge · glow · haze" is stencilled on the lower slat.
- **Under the crate:**
  - ‹ number, name › and the category's first three real records (album art, title, artist).
  - **Hovering a tab previews its number and name there** in ink-2, and the records dim to 30% so they never mislabel. Leaving the crate restores it.
  - Clicking pulls that sleeve. The sleeve and the name both open that category in Categories.
- **Flipping:**
  - Mouse: tabs, or ‹ ›.
  - Keyboard: the crate is **one Tab stop** (a roving tabindex on the current tab; reuse `src/components/classify/roving.ts`). ↑ and → go one divider back (smaller), ↓ and ← go one forward, and Home and End jump to the front and back.
  - Touch (≤720px): the tabs leave the tab order and ignore pointer events. ‹ › and a sideways drag on the sleeve flip the crate.
- **Below the fold, "What Apply writes", the crate's legend:**
  - All 41 playlists in the crate's order (largest first), in three columns, each with its sleeve, catalogue number, name, count, and a bar growing from the left.
  - Under the heading, one data line: "**41** playlists · **12,192** adds at [cutoff 65](/classify) · **2** tracks fit none".
  - On a phone it shows the top 12, then "Show all 41".
- **Other home states** reuse the same slots (see "States" below for the press list):
  - First run shows an empty crate (no dividers, one dashed blank tab) plus "Set up" or "Connect Spotify".
  - With unsorted tracks, the primary becomes "Sort N tracks" through ClassifyGate's price tag.
  - When everything is applied, the primary becomes "Check for new tracks".
  - `?error=denied` and a version mismatch each show one danger line: at Reconnect when it is present, otherwise above the primary.

### Review (categories)

Archetype: _list + detail_. On desktop both panes stay alive; on phones it is one pane at a time.

- **The h1** is exactly "41 categories. Edit anything." (the e2e test relies on it), with nothing beside it.
- **The bin (left):**
  - A kraft surface whose column head carries the key (left) and the mono "Tracks at cutoff 65" (right, shortened to "cutoff 65" on phones).
  - Each category is a card-stock divider row: its sleeve at 40px, its name (Franklin 600, 1.25rem) with the description on the same line in ink-2, truncated with an ellipsis, then a left-anchored bar on the 1,442 scale and the count.
  - **Tabs:** 16px tall and in one column at the name's left edge, so the catalogue numbers read as a column. Dividers are 8px apart, so each tab tucks over the bottom padding of the card behind it, as a front divider's tab covers the one behind. A tab costs no height of its own.
  - **Pitch:** 66px at desktop and 62px on phones (it was 100px and 88px). At 1440×900, 8 dividers are fully visible above the action bar (it was 5); at 1280×800, 7 (it was 4). The page is 3,173px tall at 1440 (it was 4,560).
  - The open divider has a `--tint` fill, an ink border and a reversed tab, and **its sleeve slot is left empty** (a dashed ink-3 square). The sleeve has been pulled out into the sheet.
  - The last divider is a dashed blank tab, 42, holding **Add a category**. The bin's foot, after it, holds **Re-propose all…** in ink-2, where Re-propose sits in today's app.
- **The pulled sheet (right, sticky):**
  - Its tab is reversed above its top-left corner.
  - Head: the riso sleeve at 160px beside the editable name (Caprasimo, dotted underline) and "Mostly" (the top artists at the cutoff).
  - **Actions directly under the head:** Add track · Merge into… · Delete · Close (at the end), on a hairline.
  - Then the description on a ruled index card, the **Tracks at each Fit cutoff** chart, and **Examples** with real album art.
  - The framed sheet is capped at `100dvh − action bar − 48px` and scrolls inside its own keyline (`overscroll-behavior: contain`). Its action row is sticky at the top of that scroll.
  - Measured at 1440×900: the actions sit at y 396 to 441 at rest and at 233 to 278 after scrolling the page 1,200px. The bar starts at 807, so they are never under it. After scrolling the sheet itself, the actions stay pinned at its top edge.
- **The action bar:**
  - It pins **Classify** (the only orange on the page) beside the status line: "Unsaved: 1 edited", clash and naming errors, drag hints, and re-scoring progress.
  - When nothing is pending, the status line reads "Drag a divider onto another to merge them." Today it is blank.
  - Desktop: 93px. Phones: **one row**, with the truncating status and a content-width Classify at 52px, 73px in all.
- **At 900px and below:** the sheet opens inline inside the divider. The row gives way to the editor, so the name is never printed twice. The open divider turns to card stock there, so its chart keeps 3:1 (it was 2.98:1 on the tint). The sheet's actions stay under its head.
- **At 720px and below:** the bin goes full-bleed, descriptions are hidden, and count sits over a left-anchored bar in a 56px column.

### States that change what the numbers mean

The counts and bars come from the saved classification, so they get these rules:

| State                                      | Review                                                                                               | Home                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Just proposed, nothing placed (placed = 0) | the qty column and its column-head label are hidden, never 41 zeros; the sheet shows no cutoff chart | the crate draws dividers with no record stacks, and "What Apply writes" is hidden (the primary is "Sort N tracks") |
| A category was added and has no data yet   | its qty cell says "new" in mono ink-3, with no bar; its sheet shows no chart                         | not in the crate or press list until Classify places tracks                                                        |
| A merge target, before Classify            | its count and bar print in ink-3 (the saved number, marked as stale); Classify restores ink          | unchanged until saved                                                                                              |
| Unsorted tracks remain (unsorted > 0)      | as normal                                                                                            | "What Apply writes" is hidden (Apply is locked in the nav, so the list would promise something that can't happen)  |
| Partly applied (0 < applied < categories)  | as normal                                                                                            | title stays; only rows already on Spotify get a mono "on Spotify" in `--success` after the count                   |
| All applied (applied === categories)       | as normal                                                                                            | retitled "On Spotify", with no per-row marks (every row would carry the same one)                                  |

### How the language extends to the other screens

- **Setup, the shop counter.** Four index cards with tabs 01 to 04 on the kraft surface:
  - 01, Spotify app: the developer-app instructions, and the redirect URI with Copy beside it.
  - 02, Client ID.
  - 03, Anthropic key.
  - 04, Prefix: previews its result on a divider tab ("✨ Bedroom Pop Intimacy"), so the owner sees what will print on Spotify.

  Inputs are underlined on card stock. Enter submits, Back sits on cards 02 to 04, and errors appear under the field in danger.

- **Scope, choosing which crates to dig.**
  - Each Spotify playlist is a ruled row with its real playlist image, falling back to a plain sleeve, plus its track count and an Include / Leave out toggle printed as a stamped box.
  - Filter, bulk buttons and preview (a pull-out sheet with the same look as the price tag) keep their current behaviour.
  - **Scan** moves into the action bar in orange.
  - The error state is one danger line with Try again and Reconnect, and no Scan button.
- **Scan:** set piece A below. The title counts playlists read ("12 of 40 playlists read"), because that is what the stream reports. The error state keeps Scan again, Change scope and Reconnect.
- **Diff, new arrivals as a delivery note** on card stock.
  - Its sentence and list come from **`library.unsorted`**, not `added`: the spec (line 147) notes that `/api/spotify/diff` compares against a cache the scan already updated, so `added` is about 0. The sentence reads "N new tracks to sort".
  - The list shows those unsorted tracks with real art, minus any track in the labelling sample (see 4.3).
  - The removed note is in ink-2.
  - Actions are unchanged: Sort N tracks (ClassifyGate), or Tune & apply, Edit categories and Change sources.
- **Classify (Fit), the crate at full width.**
  - The 41 tabs carry their counts while the stream runs (set piece B).
  - Afterwards, the cutoff slider is a printed ruler from 40 to 95 with an orange thumb, sitting in the sticky bar beside Apply to Spotify.
  - Dragging it re-flows the 41 counts and their bars from `tracks_by_threshold`, which is aggregate only. Song lists per playlist are liner-notes lists with real art.
  - The Move dialog is a price-tag sibling. No per-song score is ever printed.
- **Apply:** the press list from home, the same component, _is_ the manifest. The orange **Apply** is the confirmation.
  - The run is set piece C, the credits, and the page's one loud moment. It ends with Open Spotify and Home.
  - Error and connection-lost states show how far the print run got ("12 of 41 printed").
- **Label:** deliberately the quietest page, with ink on card stock only. **No sleeves, no ink colours, no album art, no motion.** The sleeves' colour temperatures encode mood cues, so showing them beside a blind judgement would prime the labeller. The blind-labelling rule outranks the identity system here.

---

## 4. Graphics system

### 4.1 Sleeve generator: deterministic, pure SVG, no libraries

The reference is `_work/covers.py`, written to port to TypeScript line by line. It produces one `<svg viewBox="0 0 100 100">` per category, cheap enough to render all 41 at once (about 1 to 3 KB each).

1. **Seed:** `seed = fnv1a32(id + "|" + name)`: 32-bit FNV-1a over UTF-16 code units (`charCodeAt`), with offset `0x811C9DC5` and prime `0x01000193` (use `Math.imul`, then `>>> 0`). Renaming reprints the sleeve on purpose: the sleeve belongs to the name.
2. **Temperature (the meaning):**
   - Count cue words from four lexicons in the name. Fall back to the description only when the name has no cue at all, and fall back to `TEMPS[seed % 4]` when neither has one.
   - Ties resolve in the order dusk, charge, glow, haze. Words match on a leading word boundary, case-insensitive.
   - `dusk` (dark, moody, brood, melanchol, heartbreak, pain, turmoil, witch, eerie, gothic, aggressive, heavy, metal, phonk, drift, emo, angst, shoegaze)
   - `charge` (edm, festival, anthem, euphoric, hyperpop, glitch, chaotic, trap, banger, dubstep, bass, trance, nightcore, sped, energy, techno, hypnotic, epic, cinematic, synthwave, stutter, punk)
   - `glow` (sunset, tropical, summer, groov, soul, latin, afro, dance, infectious, slap, k-pop, j-pop, global, inspirational, uplifting, celebrat, rock)
   - `haze` (dream, ethereal, ambient, lo-fi, chill, relax, soft, bedroom, intimate, acoustic, folk, piano, neoclassical, slowed, reverb, nostalg, ballad, classical, gufeng, introspect, songwriter, storytelling, vaporwave)
   - On this library: 13 haze, 12 charge, 8 dusk, 8 glow.
3. **Ink A = the temperature's one ink:** dusk violet, charge pink, glow yellow, haze aqua. This is what makes a tab's colour answerable.
4. **Candidates:** `bump` from 0 to 23 gives motif `MOTIFS[((seed >> 16) % 6 + bump) % 6]` and ink B `B_INKS[temp][((seed >> 6) & 3) + floor(bump / 6)) & 3]`.
   - `MOTIFS` = groove · split · sleeves · waves · pull · spines.
   - `B_INKS`:
     - dusk: fblue · burgundy · mblue · teal
     - charge: mblue · fblue · violet · teal
     - glow: red · pink · burgundy · teal
     - haze: mblue · violet · teal · pink
5. **Choosing (`catalogueSpecs`), in catalogue order:**
   - A category never takes a (temperature, motif, ink B) an earlier category holds.
   - It never takes a motif already used 7 times (6 × 7 = 42 slots; past 42 categories the cap lifts to the least-used motif).
   - Among what's left, it takes the motif its own temperature has used least so far, then the smallest bump.

   Result on this library: 41 of 41 unique; groove, split, sleeves, pull and spines at 7 each, waves at 6. No (motif, ink A) pair is shared by more than 3 categories, the minimum possible with 13 haze categories and 6 motifs. So same-coloured sleeves differ in shape first. Adding a category never reprints an existing one. Deleting or renaming can reprint only later categories.

6. **Geometry:** `rand = mulberry32(seed ^ 0x9E3779B9)` drives every position and size inside the motif. **Every motif lays solid B over solid A somewhere**, so the third (overprint) colour always prints, not only where B crosses the dot screen.

   | Motif   | Drum A                                           | Drum B                                               | Guaranteed overlap                                        |
   | ------- | ------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
   | groove  | a disc r44 and a screened field                  | five grooves and a centre label                      | grooves and label over the disc                           |
   | split   | a solid triangle and a screened triangle         | a quarter-disc, r 78 to 90, and a dot                | r > 70.7, so the quarter-disc always crosses the diagonal |
   | sleeves | squares 1 and 3 (3 screened), each rotated ±8°   | square 2                                             | the squares step 16u and are 46 to 58u wide               |
   | waves   | a screened field and a solid disc                | three sine strokes                                   | the disc is centred on the middle stroke                  |
   | pull    | a sleeve (square) and a screened band            | a record with its label hole, half out of the sleeve | the disc's centre is 78 to 92% across the sleeve          |
   | spines  | spines 1, 3 and 5 (5 screened), leaning 8 to 15° | spines 2, 4 and 6                                    | neighbours overlap by 2.2u                                |

   Pull and spines replace the earlier sun-over-horizon and arches, which read as mid-century wall prints; both new motifs come from the shop itself. **No motif may read as a chart:** spines keep equal heights and only ever stand upright (turn 0° or 180°), because turned 90° they read as a striped list.

7. **Printing:**
   - `rotate((seed >> 26) % 4 × 90°)` about the centre (spines: `& 2`).
   - Drum B is drawn in a `<g style="mix-blend-mode:multiply" transform="translate(dx dy)">`, with `dx` and `dy` picked from ±1.6 or ±2.4 by `mulberry32(seed)`. That is the misregistration, and the overprint makes the third colour.
   - **Dot screen:** screened areas use one shared `<mask>` (3u pitch, 15°) at 80px and up, and a flat `fill-opacity: 0.42` below, because 1px dots moiré.
   - **Ink speckle:** at 120px and up, both drums are masked by one shared, pre-rendered `<pattern>` of 46 paper voids in a 23u tile (rotated 7°). No filter runs per sleeve. Drum B's copy moves with its misregistration, so the two passes starve in different places, like two real drums.
   - A sleeve's paper is always card-coloured (`oklch(0.978 0.010 90)`), on both stocks.
   - The masks' `white` and `black` are luminance values, never painted.
8. **Where sleeves appear:**
   - Home: the pulled sleeve at 220u (220px at 1440), and the press list at 36px.
   - Review: rows at 40px (36px on phones); the open sheet at 160px (120px at ≤1100px, 96px on phones).
   - Classify tabs and the Apply credits.
9. **Rename moment:** 400ms after typing stops, the old sleeve's drum B slides out by 4× its offset and fades (160ms, ease-in). The new sleeve prints in with set piece C in miniature.

### 4.2 Library visuals: what each mark encodes

| Visual                        | Where                | Data (data.json)                                                                                                                                                                  | Encoding                                                                                                                                                                                                                           |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The crate**                 | home hero            | `tracks_at_threshold` for all 41                                                                                                                                                  | dividers ordered by size, front to back. The depth of each record stack is `3.2u + count / 72.06` (the scale fits the 12,178 tracks in front of the back divider into 169u), a linear length. The stack's tint is the temperature. |
| **Tabs**                      | crate, review, sheet | catalogue order, temperature                                                                                                                                                      | a tab's number is the catalogue number (the category's identity on every page). Its colour is the temperature, explained by the key. It encodes no quantity.                                                                       |
| **Price sticker**             | on the pulled sleeve | `tracks_at_threshold`                                                                                                                                                             | "1,442 tracks", mono                                                                                                                                                                                                               |
| **What Apply writes**         | home, below the fold | `tracks_at_threshold` for all 41, sorted descending; `library.total_playlist_adds_at_threshold` (12,192); `tracks_with_no_playlist_at_threshold` (2); `confidence_threshold` (65) | the crate's legend in the crate's order: horizontal bars growing from the left, `scaleX = count / 1,442`, a value on every row (UXPM chart rule for 20 to 50 categories)                                                           |
| **Row bars**                  | review rows          | `tracks_at_threshold`                                                                                                                                                             | a 96px bar anchored left, on the same 1,442 scale as home, then the count, so the same count reads the same way on both pages. The small categories (14, 33, 34) stand out as merge candidates.                                    |
| **Tracks at each Fit cutoff** | review sheet         | `tracks_by_threshold` at cutoffs 40 to 95 (aggregate counts)                                                                                                                      | 12 columns. Yours (65) is in ink and labelled "yours". Values are labelled at 40, 65 and 95 ("742 · 665 · 0" for 04), and the aria-label lists all 12.                                                                             |
| **Mostly**                    | review sheet         | `top_artists` (counted at the cutoff)                                                                                                                                             | text line                                                                                                                                                                                                                          |

Deliberately left out:

- `top_genres` (Spotify's artist tags, whose small counts cover a fraction of the library and would mislead).
- `library_growth_by_month`: 2,875 in May and 297 in September are both the app's own scan dates, and all 3,172 are already sorted. Beside "Check for new tracks", "297 arrived" read as 297 waiting.
- The cost and run totals.
- Anything per song besides title, artist and art. No scores, ranks or bins, ever.

### 4.3 Real album art

- **Home:** the first three example tracks of the pulled category, at 44px, under the crate (they change with every flip).
- **Review sheet:** every example track, at 44px.
- **Classify song lists and diff arrivals:** 40 to 44px.
- **Apply credits:** none. The credits are the sleeves.
- Art is always square with a 1px ink keyline, is `loading="lazy"`, and links to `spotify:track:<id>`.
- **Fallback, the plain sleeve:** a flat `--paper-deep` square with the same keyline. It has no rings and no ink, so it never reads as a groove sleeve or the brand mark, and never repeats the category it sits in. It has `role="img" aria-label="No cover art"` (see "Holding On" and "Sick and Tired…" in the 04 sheet).
- **Data path (the art does not exist in the cache today):** `TrackSchema` is `{artist_id, title, first_seen}` (`src/lib/cache/schema.ts:31-35`), and `writeCache`'s zod parse strips unknown fields. The mockup's art came from oEmbed (`scratchpad/redesign/fetch_art.py`). To ship it:
  1. Add an **optional** `art_url: z.string().url().optional()` to `TrackSchema`. Being optional, it does not bump the cache version, so nobody hits `version_mismatch`.
  2. Capture `track.album.images` in `fetchPlaylistTracks`: the smallest image that is at least 64px.
  3. Backfill once through `GET /v1/tracks?ids=`, 50 ids per call, about 64 calls for 3,172 tracks. A re-scan will not backfill, because playlists with an unchanged `snapshot_id` are skipped (`src/lib/pipeline/scan.ts:55-58`).
  4. Until that has run, every track shows the plain sleeve.
- **Blind-labelling filter:** until the labelling study ends, every per-song list this redesign adds (the home records under the crate, the diff arrivals) drops any track in `data/labels/sample.json`: `random_track_ids`, `pairs[].track_id` and `relabel_track_ids`. The mockups' tracks were checked: none of the 167 example tracks is in the sample.

### 4.4 Motion (framer-motion 12)

**Tokens** (extend `useMotionConfig`):

- `EASE_OUT = [0.16, 1, 0.3, 1]` (expo out): entrances and interactions.
- `EASE_IN = [0.7, 0, 0.84, 0]`: exits only.
- `EASE_IN_OUT = [0.65, 0, 0.35, 1]`: moves with both ends on screen (FLIP, nav underline).
- `SPRING_SETTLE = { type: "spring", stiffness: 200, damping: 28.3, mass: 1 }`, damping ratio 1.00 (critically damped): things landing.
- `SPRING_SNAP = { type: "spring", stiffness: 500, damping: 44.7, mass: 1 }`, damping ratio 1.00: small acknowledgements.
- Durations: press 100, hover 180, state 240, scene 320 to 520.
- Transform and opacity only. The single exception is the grid-template-rows trick for inline expansion.
- No bounce, no elastic, no infinite loops.
- The root has `MotionConfig reducedMotion="user"`. Every set piece below also names its own reduced version.

**Page entrances.** The h1 goes `y: 14 → 0` with opacity 0 → 1, 520ms EASE_OUT, and the primary follows at +80ms. Lists use `staggerChildren: 0.024, delayChildren: 0.06`, capped at index 12. Review dividers flip up (`rotateX: -38 → 0, y: 8 → 0, transformPerspective: 900`, 420ms EASE_OUT, origin at the bottom edge). The action bar comes in `y: 100% → 0`, 420ms EASE_OUT at +200ms. Reduced: opacity only, 120ms, no stagger.

**Home crate, entrance and flip.**

- _Entrance:_ the 41 dividers settle `y: -18u → 0` with opacity, 360ms EASE_OUT, staggered 9ms from back to front (0.36s in all). Then the sleeve is pulled up from inside the crate (`y: 90u → 0`, 520ms EASE_OUT at +300ms). The slats sit above it in z-order, so it rises from behind them.
- _Flip:_ `AnimatePresence mode="wait"` keyed by category id.
  - The old sleeve drops `y: +70u` to opacity 0 (200ms EASE_IN), and the new one rises with SPRING_SETTLE.
  - The pressed tab lifts `y: -3u` with SPRING_SNAP.
  - The record stack's outline changes on the same frame.
  - The sticker is stamped (`rotate: 12 → 4, scale: 0.92 → 1`, 240ms EASE_OUT at +160ms), and the caption crossfades (160ms).
- _Peek:_ the caption's name swaps with no motion, and the records' opacity eases to 0.3 over 180ms.
- _Touch:_ `drag="x"` on the sleeve with `dragConstraints={{left: 0, right: 0}}`, advancing past 60px or 400px/s.
- Reduced: the sleeve crossfades in place (120ms), with no travel and no stamp.

**A. Scan: records into the crate.**

- One empty crate on the page. For each playlist event from the stream, a plain-sleeve record slides in from the right (`x: 120 → 0, rotate: 6 → 0`, SPRING_SETTLE), then drops `y: 0 → 40u` (240ms EASE_IN) behind the slats. Records are queued at most one per 180ms, so a fast scan never strobes.
- The fill behind the slats is **playlists done ÷ playlists total**, which is what the stream sends: `onProgress("playlists", done, total)` in `scan.ts:33,57,68`. It carries no track count. A pre-rendered stack of record tops is revealed by a mask moving up with `translateY`.
- The title ticks "12 of 40 playlists read" with a motion value (800ms EASE_OUT per update, tabular figures). If a `tracks` field is added to the event later, the counter can switch to tracks.
- ScanStages rows tick off with a 240ms opacity change and `x: -4 → 0`.
- Reduced: the counter and fill update in steps with no travel, and the records appear with a 120ms opacity change.

**B. Classify: filing into dividers.**

- The crate at full width, all 41 tabs with a mono count under each.
- When the stream assigns a track, its category's tab bumps `y: -4u → 0` with SPRING_SNAP and its count ticks. **Only counts move, and no song title is ever named:** a track has up to 5 scored matches (`schema.ts:57`), so naming the one it was filed under would reveal its top-ranked match. Bumps and counts are batched every 250ms (at most 12 bumps per second across the crate), so 3,172 tracks read as a steady filing rhythm.
- An ink progress band grows `scaleX: done / total` with SPRING_SETTLE.
- _Afterwards (Tune):_ dragging the cutoff ruler re-flows each count and bar with SPRING_SNAP, and re-sorting uses `layout` (FLIP), 240ms EASE_IN_OUT.
- Reduced: counts and progress update in place, with no bump and no FLIP.

**C. Apply credits: the print run** (the one loud moment).

- One sleeve per playlist enters the credits as Spotify confirms it. **`onProgress("category", i, …)` fires _before_ playlist i is written** (`apply.ts:55`), so event i prints sleeve i − 1, and `done` prints the last. A sleeve never claims a playlist is on Spotify before it is.
- Each sleeve prints in two passes. Drum A goes `opacity 0 → 1, x: -6 → 0` (180ms EASE_OUT). Drum B (`motion.g`) starts at 4× its misregistration offset and settles to identity with SPRING_SETTLE: the registration visibly locks in. Then the price sticker stamps.
- The name and track count are set underneath like record credits, in Caprasimo and mono.
- _Pacing:_ it follows real progress and caps at 30ms per sleeve once the writes have landed (41 × 30 = 1.2s), so it never outlasts the work.
- _Close:_ a success line ("41 playlists on Spotify."), then Open Spotify (primary) and Home. On error: "12 of 41 printed".
- Reduced: sleeves appear with a 150ms opacity change, already in register.

**Review interactions.**

- _Open:_ one `LayoutGroup`. **Exactly one element owns `layoutId={'sleeve-'+id}` at a time: the sheet's sleeve while the divider is open.** The open row renders its empty dashed slot, a plain element with no layoutId, so nothing blanks. Opening morphs the row's sleeve into the sheet's (240ms EASE_IN_OUT), and closing sends it back. On phones the inline editor's 96px sleeve owns the id. The sheet body crossfades with `y: 8 → 0` (240ms), and the inline editor opens with `grid-template-rows: 0fr → 1fr` (240ms EASE_OUT).
- _Delete:_ exit `x: 24` to opacity 0 (180ms EASE_IN), siblings use `layout` (240ms EASE_IN_OUT), and the Undo line enters `y: 8 → 0` (240ms).
- _Drag to merge:_ the divider lifts with `scale: 1.02, rotate: -1` (180ms EASE_OUT) and follows the pointer with no easing. The target's tab rises `y: -4` (SPRING_SNAP) and its card tints. On drop, the source goes `scale: 0.96` to opacity 0 (180ms EASE_IN) into the target, whose count turns ink-3 until Classify.
- _Price tag:_ hangs in `y: -12, rotate: -1.5 → 0`, 320ms EASE_OUT, from the top-centre (its eyelet). It exits with a 200ms opacity change, EASE_IN.
- _Nav:_ the current underline slides between steps with `layoutId`, SPRING_SNAP.
- Reduced: no transforms, a 120ms opacity change or an instant swap, and focus unchanged.

---

## 5. Component language

- **Primary button:**
  - Orange ink (`--accent`) with a navy (`--on-accent`) Caprasimo label at 1.25rem, min-height 56 (52 in the phone action bar) and radius 3.
  - Its 1.5px `--ink` keyline is printed **4px out of register** (navy by day, cream at night). Hover and focus pull it into register (`translate(4px,4px) → 0`, 180ms EASE_OUT), and pressing darkens the ink.
  - `white-space: nowrap`. On phones it spans the full width on home, and is content-width in the review action bar.
  - Only one per view: Apply on home, Classify on review, Proceed in the price tag.
- **Secondary (quiet) button:** Franklin 500 in ink with a 1.5px `--rule-strong` underline, offset 6px, that darkens to ink on hover, and a 44px target. `.is-2` sets it in ink-2 for lower-stakes routes (Re-propose all…, Reconnect Spotify, Close).
- **Danger:** a quiet button in `--danger` with a 45% danger underline. When danger is the confirming action in a dialog (Wipe & re-propose), it becomes a card-fill button with danger text and a danger keyline printed out of register, and focus starts on "Not yet".
- **Icon button:** a 44px circle (‹ ›), Lucide-style 1.75 stroke, `--paper-deep` on hover, always with an `aria-label` ("Previous category (larger)" / "Next category (smaller)" on the crate).
- **Inputs:**
  - The category name is set in Caprasimo on a dotted `--rule-strong` underline, which turns solid ink on focus.
  - Descriptions are a ruled index card: card stock whose ruling follows the line-height, with a keyline that turns ink on focus.
  - Filters and search (Merge into…) use an underline input with a visible label.
  - Errors sit under the field in danger with `role="alert"`: "Another category is called this."
  - Validation runs on blur, and clashes stay marked in the row after close.
- **Tabs:** card stock tinted with the temperature (`--t-*`), a 1px `--rule-strong` keyline open at the bottom, and a navy mono catalogue number.
  - Review: 16px tall, in one column at the name's left edge, tucked over the card behind.
  - Crate: 18u tall, in six staggered columns.
  - Open or current: reversed (`--tab-pressed`), lifted 3px, with a cream keyline at night.
  - The crate's tabs are one roving Tab stop. At ≤720px they leave the tab order and ignore pointer events.
- **Lists:**
  - Liner-notes rows: a sleeve or art square with a 1px ink keyline, then title in Franklin 600, artist in ink-2, catalogue numbers in mono ink-3, and counts in tabular 600.
  - Review divider rows are card stock with name and description on one line, a left-anchored bar, then the count.
  - Hover underlines the name and lifts the tab 3px.
  - Open = `--tint` fill (card on phones), an ink border, a reversed tab and an empty sleeve slot.
- **Dialog (the price tag):**
  - Card stock with a 1.5px ink border and radius 4.
  - A **real hole** is punched through it: a radial-gradient mask, so the dimmed page shows through. It is ringed by a two-ring eyelet (a 22px paper-deep grommet with an ink rim, and a 13px inner ring), so it reads as a hang tag, not an empty radio button.
  - The heading _is_ the price, in Caprasimo display-2. Notes sit under a hairline.
  - Actions: the primary and "Not yet".
  - Scrim: `--scrim` (navy at 48% by day, 66% at night), **no blur**.
  - Behaviour: `role="dialog"`, `aria-modal`, labelled by the price, focus trapped, Escape and backdrop close it, and focus returns on close. The existing Dialog primitive keeps its behaviour; only the look changes.
- **Site nav (masthead):**
  - The wordmark in Caprasimo with a small record mark, then the steps Sources · Categories · Fit · Apply as Franklin 500 text, then Labels behind a 1px rule. A 1.5px ink rule closes the masthead.
  - Current step: ink with a 2px underline at offset 8. Available: ink-2. Locked: ink-3 in a `span[aria-disabled]`.
  - No icons, counts or orange. The gating and NavLock rules are unchanged.
  - **Hidden on `/`, `/setup` and `/label`** (as the IA spec says). Home shows the wordmark row alone.
  - Phones: wordmark and Labels on row 1, the four steps spread across row 2.
- **Action bar:** fixed, on paper with a 1.5px ink top rule. The status line (ink-2, polite, truncating) sits on the left and the page's one primary on the right, on one row at every width (93px desktop, 73px phone).
- **Focus:** a 2px ink outline at offset 3 (6 on the primary, so it clears the keyline), plus the primary's keyline pulling into register. The browser's blue ring is never shown.
- **Touch:** every control has a 44px target. The crate's tabs are an index on phones, not a control: there, ‹ › and the sleeve drag are the controls.

---

## 6. Every existing action survives

The build checklist:

| Page   | Existing action or state                                                                                            | Where it lives now                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home   | Apply to Spotify (primary for "apply")                                                                              | orange primary under the lede                                                                                                                                                                                             |
| Home   | Set up / Connect Spotify / Choose playlists / Sort N tracks (ClassifyGate) / Check for new tracks (other primaries) | the same primary slot                                                                                                                                                                                                     |
| Home   | Categories, Labels, Check for new tracks                                                                            | the ruled routes list only (no site nav on `/`); the sleeve and the name under the crate also open that category                                                                                                          |
| Home   | Reconnect Spotify                                                                                                   | last route, ink-2                                                                                                                                                                                                         |
| Home   | `?error=denied` line; version-mismatch line                                                                         | one danger line, at Reconnect when present, else above the primary                                                                                                                                                        |
| Review | Classify (Saving…, Re-scoring…) + CostPreviewModal (Proceed / Not yet)                                              | action bar → price tag                                                                                                                                                                                                    |
| Review | Re-propose → "Wipe & re-propose" (danger, focus on Not yet)                                                         | "Re-propose all…" at the bin's foot, after Add a category (where it sits today) → price tag                                                                                                                               |
| Review | Open row / Close                                                                                                    | click or Enter on a divider; Close at the end of the sheet's action row                                                                                                                                                   |
| Review | Rename; edit description; duplicate-name error; empty-name revert                                                   | Caprasimo field; ruled card; alert under the field; the row stays marked                                                                                                                                                  |
| Review | Add track (TrackSearchModal)                                                                                        | first action under the sheet head                                                                                                                                                                                         |
| Review | Merge into… (filter picker); drag to merge (mouse) with status-line hints                                           | sheet action; drag divider onto divider. The status line gives the drag hints as today, and its idle text says drag-to-merge exists                                                                                       |
| Review | Delete + one-slot Undo line                                                                                         | danger action under the sheet head; the Undo line takes the divider's place                                                                                                                                               |
| Review | Add a category (name, description, Add/Cancel, clash error)                                                         | dashed blank divider 42                                                                                                                                                                                                   |
| Review | Example tracks (spotify: links)                                                                                     | Examples with real art or the plain sleeve                                                                                                                                                                                |
| Review | loading / loadError (Try again) / proposeError / proposing (ThinkingIndicator) / work (inert, dimmed)               | the same states. Proposing shows the empty bin with blank dividers beside the ThinkingIndicator's token count, and the dividers print in when the categories arrive. Errors are one ink-2 message with Try again and Home |

The one behaviour change to confirm with the owner: at desktop only one divider is open at a time (the pulled sheet); today several rows can be expanded at once.

---

## 7. Frameworks, as applied

- **impeccable:**
  - Followed the font procedure (above).
  - Colours are OKLCH, with neutrals tinted to the brand navy. No pure black or white is painted anywhere: the masks' `white` and `black` are luminance.
  - **Theme derived from the context,** not picked: paper by day for the riso concept and screen-shares, and an evening stock for the 1am headphone sessions its own table points to. The evening stock follows impeccable's dark-mode rules: the same hue, lighter surfaces for elevation, no shadows, lighter body weight (370), and accents with slightly less chroma.
  - Both absolute bans were checked in the built HTML: no side stripe wider than 1px (the only `border-left` is the 1px nav separator) and no `background-clip:text`. No glassmorphism or blur, no bounce, no hero-metric template, no identical icon-heading-text grids.
  - Accordion motion uses grid rows.
- **UI/UX Pro Max:**
  - `--design-system` returned "Dark Mode (OLED), Righteous/Poppins, #2563EB primary". The fonts and colours were rejected because impeccable's bans and the seed win. Its dark-mode instinct fed the evening stock.
  - Used:
    - horizontal bars sorted descending with value labels for 20 to 50 categories (the press list, the crate's order);
    - one primary CTA per screen;
    - animate one or two key elements per view;
    - 44×44 targets with 8px spacing;
    - inline validation on blur;
    - destructive actions separated and in danger colour;
    - undo for delete and merge;
    - keyboard navigation for composite widgets (the roving crate);
    - reduced motion everywhere.
- **layout-patterns:** home is the dashboard archetype (one ranked signal, not equal cards). Review is list + detail: both panes alive, a sticky detail with its actions in reach, one pane at a time on phones, and the active row clearly marked (tint, reversed tab, empty slot).
- **motion-recipes:** the two duration tiers; the list enter/leave and FLIP values; the number ticker (800ms, tabular); drag lift, follow and settle (the follow is never eased); the accordion's grid rows; shared-element morph with one owner per `layoutId`.
- **dataviz:** every mark encodes one number on a linear scale from zero. The crate's colour is categorical with a printed key. Bars on both pages grow from the same side, and values are labelled on the mark, not in a legend.
- **design-dna, colorize, bolder, delight, overdrive, typeset:**
  - One committed identity.
  - Colour carries meaning: four temperatures, one action ink.
  - Bold means one hero graphic per page that is also data.
  - The delight is the sticker stamp, the registration settling and the ink speckle, all under a second and all skippable.
  - Overdrive is spent on exactly one moment, the Apply credits.
- **Owner's taste rules:** the deletion test removed the "297 arrived" note, the home site nav, the three-line explainer under "What Apply writes", the tab stagger on review, and the category tint on the plain sleeve. Marks only where they differ: every tab colour, sleeve, stack depth and bar differs by category. The only per-row status mark ("on Spotify") appears only in the partly applied state, where it differs.

## 8. Rounds of iteration (from the screenshots)

1. **Round 1** (inherited): the bin was a stack of colourful sleeve edges that read as a barcode. There were 41 Caprasimo row names, a two-line primary button at 390, a column header that wrapped three times, and "groove" (concentric targets) as the most common motif.
2. **Round 2:**
   - Rebuilt the bin as numbered divider tabs with kraft bodies, perspective and slats.
   - Rows moved to Franklin 600, and the primary gained `nowrap` with a full-width phone layout.
   - Sleeves got the temperature lexicon and catalogue de-dup.
   - Real records moved under the bin as a vertical list.
3. **Round 3:**
   - Deletion-test removals; the sheet head became cover + name + Mostly.
   - Teal pulled into gamut.
   - Fixed a screenshot artefact: bars restarted their animation when the full-page capture re-laid the page. CONFIRMED by a probe.
4. **Round 4 (the two critiques):**
   - _The crate became the chart._ Dividers are ordered by size and the records behind each are drawn to scale. First render: the stacks were neutral hairlines and too faint to read as data, so they took their temperature's tint. The current stack's hairlines were full ink and read as a barcode, so they dropped to ink-2. Kraft sides and a back rail turned a stack of files into a crate.
   - _Covers:_ ink A became the temperature. Sun and arches were replaced by pull and spines. Spines turned 90° read as a striped list, so they were limited to upright turns (seen on the 41-cover proof sheet `_work/sheet-1440.png`). Every motif now overprints solid on solid, and large sleeves carry an ink speckle.
   - _Review:_
     - The pitch went from 100 to 66px.
     - Actions moved under the sheet head.
     - The sheet first scrolled inside a sticky aside, which clipped its bottom keyline. Now the framed sheet itself scrolls.
     - At 390 the key wrapped to two lines, so the column label shortens to "cutoff 65". The inline action band overflowed its divider by 6px, fixed by matching its margin to the phone padding.
   - _Evening stock:_ built and shot. The reversed open tab vanished (dark on dark), so pressed tabs gained a cream keyline token.

---

## 9. Critic responses

Every must-fix from both critiques is applied. Where I applied one differently from its wording, or two instructions collided, this is why.

1. **Crate depth is linear, not `sqrt` (craft 3).** The suggestion was `dy = 4u + 60u·sqrt(count/1442)`.
   - On this library the square roots sum to 16.45, so that is 987u of stacks, over twice the whole hero.
   - Scaled to fit, a sqrt still misstates ratios: it draws Stutter House (14) at a third of Bedroom Pop's (1,442) data depth, when the true ratio is 1%.
   - I used a length that is honest: a constant 3.2u for the divider card itself, plus one u per 72 tracks. The small categories still stay visible (at least 3.4u), because the divider has thickness, not because the data is bent.
2. **Tab order follows the crate, not 01→41 (craft 7).** That fix was written when the bin was in catalogue order. The crate is now ordered by size, so its DOM order, arrow keys, and ‹ › follow what you see: front (largest) to back. The intent of the fix, that Tab and arrows match the visual order and cross the bin in one stop, holds. Tabs still show catalogue numbers, so each one matches its press-list row and its review tab.
3. **(motif, ink A) can't be unique once ink A is the temperature (product 6 vs craft 4).**
   - Craft 4 makes ink A mean the temperature. With 13 haze categories and 6 motifs, some haze sleeves must share (motif, aqua).
   - So de-duplication keeps the full (temperature, motif, ink B) unique, caps every motif at 7 as asked, and spreads motifs within each temperature first.
   - The worst sharing is 3 categories, the minimum possible. Those three differ in ink B, which dominates at 36 to 48px in every motif (grooves, strokes, the record, the dark spine).
4. **The plain sleeve drops the category's ink (product 6, which conflicts with a craft "keep").** The craft critic asked to keep "the white-label fallback printed in the category's ink". The product critic's must-fix asked for a flat square with no rings and no tint. The must-fix wins: the fallback only ever appears inside its own category, so the tint repeated what the page already says, and its rings read as a groove sleeve and as the brand mark.
5. **Review tabs stop staggering (product 3), and tuck over the card behind (craft 2).** Both are applied together: one column at the name's edge, 16px tall, tucked over the card behind, so it adds 0px. The stagger (the bin look) moves to where it belongs, the home crate, where tabs are a physical index rather than a column you scan.
6. **Theme: an evening stock rather than asking the owner to accept light-only (product 10).** It is built, contrast-checked (0 failures) and shot (`shots/*-night-fold-*.png`). Rewriting `.impeccable.md`'s "dark by default" line is still the owner's call if this direction wins.
7. **The static drag hint left the column head (craft 4 put the key there).** Today's app has no static drag hint; the status line speaks only during a drag. The column head now carries the key and the cutoff label. The hint became the status line's idle text, so it stays on screen whenever nothing is pending.
8. **Home keeps no site nav (craft 5, product 5a).** The masthead nav was removed rather than the spec changed. The routes list is the home's only set of links.

Not done because it is the owner's call, not a design fix: whether the "Add track" action should stay. The spec notes it edits examples the classifier never reads, and it survives here as an existing action.
