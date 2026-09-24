# Foundation: graphics (F2)

The sleeve generator, tabs, album art, crate and press list for the Record Shop redesign.
Spec: `docs/superpowers/specs/2026-09-23-record-shop-redesign.md` §6 F2. Design: `brief.md` §4.1–4.4.

**Setup, once (F1 owns both files; neither is done yet):**

1. Mount `<SleeveDefs />` in the root layout's `<body>`. Every `<Sleeve>` masks with its
   `#rs-screen` and `#rs-grain`. A mask pointing at a missing id draws unmasked, so without
   it every sleeve of 80px or more prints its screened areas as solid ink A.
2. Register the crate's unit in `app/globals.css`:
   `@property --u { syntax: "<length>"; inherits: true; initial-value: 0px; }`. Registered, `--u`
   resolves to px once on `<CrateFigure>`. Unregistered, each `var(--u)` re-resolves `100cqw`
   against its own nearest container, so an `@container` nested in the figure halves or
   doubles every length inside it (Chromium probe: 100px becomes 50px; registered, it stays 100px).
   Until it lands, put no `@container` inside `<CrateFigure>`.

## `src/lib/sleeves/` (pure, server-safe)

A line-for-line port of `covers.py`. `tests/fixtures/sleeve-reference.json` holds covers.py's
output for the 41 real categories; the tests match every spec field and every shape's
attributes against it, and the TS proof sheet's screenshot is byte-identical to `_work/sheet-1440.png`.

| Module                 | Exports                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `temperature.ts`       | `TEMPERATURES` (`dusk`, `charge`, `glow`, `haze`, as const; tie order), `Temperature`. The cache schema imports it.                                                                       |
| `lexicon.ts`           | `CUES`, `guessTemperature(name, description, seed)`, `effectiveTemperature(c)` (= `c.temperature ?? guess`), `sleeveSeed(c)`, `SleeveSource` (`{ id, name, description?, temperature? }`) |
| `inks.ts`              | `INKS` (9 riso OKLCH inks), `InkName`, `TEMP_INK`, `B_INKS`, `PAPER`, `tabTint(t)` (`var(--t-<t>)`, F1's token: ink A 42% on tab stock in OKLab; a test pins the pairing)                 |
| `spec.ts`              | `SleeveSpec` (`seed, temp, inkA, inkB, motif, turn, dx, dy`), `MOTIFS`, `MOTIF_CAP`, `catalogueSpecs(cats)`, `specInCatalogue(c, cats)`, `specFor(c)`                                     |
| `svg.ts`               | `sleeveSvgString(spec, size, { defs?, title?, className? })`, `SLEEVE_DEFS`                                                                                                               |
| `geometry.ts`          | `sleeveArt(spec, size)` (the shapes), `SCREEN_MIN_PX` (80), `GRAIN_MIN_PX` (120)                                                                                                          |
| `hash.ts`, `format.ts` | `fnv1a32`, `mulberry32`; `pyFixed`, `fmt` (Python's number formatting)                                                                                                                    |

```ts
// Categories in catalogue order (cache order), each with its id. An owner override counts.
const specs = catalogueSpecs(categories); // Map<id, SleeveSpec>
const one = specInCatalogue(draft, saved); // prints `draft` itself, in `saved`'s context
```

`specInCatalogue(c, cats)` prints `c` as given: an unsaved rename, description or Colour
override reprints it even when `cats` is the saved list. It computes as if `c` replaced its
entry in `cats`, or, when `cats` lacks it (just added), as if appended at the end, which is
the sleeve it gets once saved. The saved list is memoised per array; an edited `c` recomputes
(about 0.2ms on the 41 real categories, measured in Node).

Renaming reprints a sleeve (the seed is `id|name`). Adding a category never reprints earlier
ones; deleting or renaming can reprint later ones. `categories` must be the whole list in
catalogue order.

**Two deliberate differences from covers.py** (identical output everywhere covers.py succeeds):

1. A temperature has 24 (motif, ink B) pairs. covers.py raises at the 25th category of one
   temperature (CONFIRMED: 30 "Chill N" categories fail at the 25th). `catalogueSpecs` reuses a
   pair instead, so a page still renders.
2. `fnv1a32` hashes UTF-16 code units as the brief specifies. covers.py hashes code points, so
   a name with an emoji outside the Basic Multilingual Plane (🎵) gets a different seed there.

## `src/components/graphics/`

| Export                                                                                             | File                | Client? |
| -------------------------------------------------------------------------------------------------- | ------------------- | ------- |
| `SleeveDefs`                                                                                       | `SleeveDefs.tsx`    | no      |
| `Sleeve`, `registrationShift`, `GroupMotion`                                                       | `Sleeve.tsx`        | yes     |
| `PlainSleeve`                                                                                      | `PlainSleeve.tsx`   | no      |
| `Tab`, `TemperatureKey`                                                                            | `Tab.tsx`           | no      |
| `AlbumArt`                                                                                         | `AlbumArt.tsx`      | yes     |
| `CRATE`, `orderBySize`, `tracksPerU`, `dividerDepth`, `crateLayout`, `recordHairlines`             | `crate-geometry.ts` | pure    |
| `CrateFigure`, `CrateLayer`, `CrateBack`, `CrateDivider`, `CrateTab`, `CrateSlats`, `CRATE_Z`, `u` | `Crate.tsx`         | yes     |
| `PressList`, `PressRow`                                                                            | `PressList.tsx`     | yes     |
| `sleeveToJpeg`, `pickJpeg`, `CoverTooLargeError`, `COVER_PX`, `COVER_MAX_BASE64`, `QUALITIES`      | `sleeve-to-jpeg.ts` | browser |

### Sleeve

```tsx
<Sleeve spec={spec} size={40} />                                      // decorative (aria-hidden)
<Sleeve category={c} catalogue={cats} size={160} title={`Cover for ${c.name}`} />
<Sleeve spec={spec} size={96} drumB={{ initial: registrationShift(spec, 4), animate: { x: 0, y: 0 }, transition: SPRING_SETTLE }} />
```

`size` is the rendered px and picks the print: dot screen from 80px (a flat 42% tint below),
speckle from 120px. Give a sleeve its keyline with `className` (1px ink; 1.5px at 160/220).
`drumA` and `drumB` are motion props for two `motion.g`s. Drum B's sits inside its static
misregistration offset, so `{x: 0, y: 0}` is at rest. `registrationShift(spec, k)` is where
drum B sits at k times its offset: 4 is the print-in start and the rename slide-out.

### PlainSleeve, AlbumArt

```tsx
<PlainSleeve size={44} />                                             // role="img" "No cover art"
<AlbumArt trackId={id} label={`${title} by ${artist}`} />             // its own spotify: link
<a href={`spotify:track:${id}`}><AlbumArt trackId={id} link={false} />…title…</a>
```

`AlbumArt` loads `/api/art/<id>` (next/image, `unoptimized`, lazy, 44px default, 1px ink keyline).
It prints the plain sleeve instead when the load fails, including a failure before hydration,
or when the id isn't 22 base-62 characters. It never requests a bad id. A linked `AlbumArt`
requires `label` (the type rejects one without), so a row of records never reads as three
identical "Open in Spotify" links; `link={false}` takes no label.

### Tab, TemperatureKey

```tsx
<Tab catalogueNo={4} temperature="haze" size="review" reversed={open} className="absolute -top-4 left-[63px]" />
<Tab catalogueNo={42} temperature={null} size="review" />             // dashed blank (Add a category)
<Tab catalogueNo={null} temperature={null} size="review" />           // unnumbered blank (review, proposing)
<Tab catalogueNo={7} temperature="haze" size="crate">{number}{count}</Tab> // children replace the number
<TemperatureKey className="text-[var(--ink-2)]" />                    // dusk · charge · glow · haze
<TemperatureKey explained={open} explainId={id} onExplain={toggle} />  // + "what they mean"
{open && <TemperatureLegend id={id}>page note</TemperatureLegend>}     // one line per colour
```

`TEMPERATURE_MEANINGS` (`src/lib/sleeves/temperature.ts`) is the one source for what each colour
means; the legend and the review Colour picker both print it. Home and the review bin offer the
legend; classify's key is decoration and doesn't.

A `<span>` with no positioning of its own. `size="review"` is 16px tall. `size="crate"` is 18u
tall and fills its `CrateTab`'s width. `reversed` is the open or current tab: `--tab-pressed`,
lifted 3px (review) or 3u (crate). The colour picker's swatches can reuse `tabTint(t)`.
`catalogueNo={null}` prints no number (a slot waiting for a real category). `children` print
in place of the number: classify's crate puts its number and live count there.

### Crate (home and classify)

```tsx
const layout = crateLayout(orderBySize(entries)); // entries: { id, catalogueNo, count, … }
<CrateFigure role="group" aria-label="…">                // 440u wide at any width; sets --u
  <CrateLayer>                                          // SVG in bin units
    <CrateBack />
    {[...layout].reverse().map((d) => (                 // back to front
      <CrateDivider key={d.entry.id} divider={d} temperature={t(d)} current={cur === d.entry.id}
        initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: EASE_OUT, delay: d.settle * 0.009 }} />
    ))}
  </CrateLayer>
  {layout.map((d) => (
    <CrateTab key={d.entry.id} divider={d}>
      <button type="button" className="block w-full" aria-pressed={…} aria-label={…}>
        <Tab catalogueNo={d.entry.catalogueNo} temperature={t(d)} size="crate" reversed={…} />
      </button>
    </CrateTab>
  ))}
  {/* home: the pulled sleeve, z CRATE_Z.sleeve, at u((440 - 220) / 2), u(CRATE.SLEEVE_TOP) */}
  <CrateSlats><TemperatureKey /></CrateSlats>
</CrateFigure>
```

- Depth = `3.2u + count / perU`. `perU` fits the tracks in front of the back divider into
  the room between the front and back dividers, less their cards (169u for 41 categories,
  so 72.06 tracks per u on this library). `crateLayout(entries, { perU })` holds a fixed scale while
  counts tick (classify). A divider with no records gets `stack.height === 0` (just proposed).
- Limit: `CRATE.MAX_DIVIDERS` (93). Past it the cards alone fill the crate, so `tracksPerU` is 0
  and no stacks draw (it would look like nothing is placed), and from 96 the back tabs rise
  above the figure. The real library has 41.
- Each `DividerLayout` has `top`, `depth`, `x`, `width`, `stack`, `tab` (`column` 0–5, `left`,
  `top`, `width`), `z` and `settle` (the back-first stagger index), all in u. Use `u(n)` for
  inline lengths.
- Layers: `CrateLayer` < `CrateTab`s (z 10) < the pulled sleeve (`CRATE_Z.sleeve`, 60) <
  `CrateSlats` (70). Tabs never overlap a divider in front of them, so the separate HTML
  layer paints like the mockup. `CrateFigure` is its own stacking context (`isolate`), so
  those z-indexes never reach the z-30 top strip or a z-50 dialog.
- Home adds the sleeve, the sticker, flipping and the roving tabindex (`classify/roving.ts`).
  Classify puts a `Tab` plus a mono count in each `CrateTab` and bumps it (`SPRING_SNAP`).

### PressList ("What Apply writes", home and apply)

```tsx
<PressList rows={orderBySize(rows)} onSpotify={appliedIds} />
<PressList rows={rows} max={1442} phoneLimit={12}
  renderSleeve={(row, i) => <Sleeve spec={row.spec} size={36} drumB={…} />}
  renderTrailing={(row) => <span>{status(row)}</span>} />
```

`PressRow` is `{ id, catalogueNo, name, count, spec, href? }`. `href` defaults to `/review#<id>`
(a `next/link`, so client navigation); `null` means no link. **Contract for the review page:**
`/review#<id>` must open that category's sheet. Nothing tests that yet. The list keeps the order
it's given. Bars use `scaleX = count / max` (default: the largest count), clamped to 1, and grow
in 480ms `EASE_OUT`, staggered 12ms. A count of 0 draws no bar (the brief keeps no-data
categories out of the list; the component doesn't enforce that). "on Spotify" prints after the
bar, under the count (brief, "States that change what the numbers mean": partly applied), only
while some rows, but not all, are on Spotify. Every row then reserves the mark's slot, so all
bars keep one scale, and the mark adds no height to its row. `onSpotify` is a Set, which a
server component can pass. At ≤720px, rows past `phoneLimit` hide behind "Show all N" /
"Show the top N". The heading and data line belong to the page.

### sleeveToJpeg (Apply covers, spec §3.4)

```ts
try {
  const jpegBase64 = await sleeveToJpeg(spec); // 640×640, base64 without "data:", ≤ 256 KB
} catch (e) {
  /* CoverTooLargeError or a canvas failure: a cover failure never fails Apply */
}
```

It steps JPEG quality 0.92 → 0.85 → … → 0.5 until the base64 payload is ≤ 262,144 bytes,
then throws `CoverTooLargeError`. It refuses a canvas that fell back to PNG. Checked in
headless Chromium for all 41 real sleeves: every one is a JPEG, 61,848 to 254,512 bytes of
base64. The upload to Spotify has never run live.

## Which page uses what (planned; no page uses these yet)

| Page     | Uses                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Home     | Crate primitives + `Sleeve` (220) + `TemperatureKey`, `AlbumArt` (44) under the crate, `PressList`                               |
| Review   | `Tab` (review), `Sleeve` (40/36 rows; 160/120/96 sheet), `TemperatureKey`, `AlbumArt` (44), colour picker swatches via `tabTint` |
| Classify | Crate primitives (per-tab counts, bumps), `AlbumArt` (40–44) in song lists                                                       |
| Apply    | `PressList` with `renderSleeve`/`renderTrailing` (credits), `registrationShift`, `sleeveToJpeg`                                  |
| Diff     | `AlbumArt`                                                                                                                       |
| Scope    | `PlainSleeve` as the playlist-image fallback                                                                                     |
| Label    | nothing: no sleeves, ink or art (the blind-labelling rule)                                                                       |

## Reduced motion

- The root's `MotionConfig reducedMotion="user"` makes transforms instant. Divider settles,
  drum registration and bar growth land at once; opacity fades still run. A page adds its own
  150ms opacity fade where the brief asks for one (credits, sleeve crossfade).
- `Tab`'s hover and lift transition has `motion-reduce:transition-none`.
- Nothing here loops or bounces.

## CSS tokens relied on

`--paper-deep`, `--card`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-strong`, `--success`,
`--kraft`, `--hollow`, `--rec-edge`, `--t-dusk`, `--t-charge`, `--t-glow`, `--t-haze`, `--tab-ink`, `--tab-pressed`,
`--tab-pressed-ink`, `--tab-pressed-edge`, `--font-mono` (all in `app/globals.css`). A sleeve's
paper and the tab tints stay the same on the evening stock. The plain sleeve and the blank tab
use page tokens, so they follow the stock.
