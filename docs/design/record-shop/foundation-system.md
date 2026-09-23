# Record Shop foundation: tokens, components, contracts

What page builders code against. Values and reasons live in `brief.md`; this file is names
and APIs only. Source: `app/globals.css`, `app/layout.tsx`, `src/components/design/*`.

**Three rules.** Use the utilities below, never raw hex, `white`, `black` or a `--color-*`
legacy var. One `variant="primary"` per view. Never edit these files: list what you need
under "Foundation requests".

## 1. Colour

Every token is a raw CSS var (`var(--ink)`, for SVG and inline styles) and a Tailwind
colour (`bg-*`, `text-*`, `border-*`, `fill-*`, `stroke-*`, `decoration-*`). All of them
switch to the evening stock automatically under `prefers-color-scheme: dark`.

| Name                                                   | Role                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `paper`                                                | page ground                                                      |
| `paper-deep`                                           | wells: the review bin, crate dividers, plain sleeve, hover       |
| `card`                                                 | lifted stock: rows, sheet, dialog                                |
| `tint`                                                 | the open divider's fill (desktop)                                |
| `ink` / `ink-2` / `ink-3`                              | text 1 · text 2 (lede, artists, status) · text 3 (cat. nos)      |
| `rule` / `rule-strong`                                 | hairlines between rows · keylines, inputs, chart bars            |
| `accent` / `accent-press` / `on-accent`                | the one primary action · pressed · its label (navy, both stocks) |
| `danger` · `success` · `warn` / `warn-ink`             | delete, errors · "on Spotify", credits · warning fill / text     |
| `kraft` · `hollow` · `rec-face` · `rec-edge`           | crate graphics only                                              |
| `tab-stock` · `tab-ink`                                | a divider tab's card and number (same in both stocks)            |
| `tab-pressed` · `tab-pressed-ink` · `tab-pressed-edge` | the open/current tab, printed reversed                           |
| `t-dusk` · `t-charge` · `t-glow` · `t-haze`            | tab tint per temperature (`bg-t-haze`)                           |
| `scrim`                                                | behind a dialog                                                  |

Raw vars only (no utility): `--riso-{yellow,pink,violet,aqua,red,teal,mblue,fblue,burgundy}`,
`--grain` (the fibre-noise tile), `--weight-body` (400 day, 370 night). A sleeve exported to
canvas can't read CSS vars: use literals there.

**Legacy, do not use:** `--color-bg-*`, `--color-text-*`, `--color-border-*`,
`--color-accent` and `--color-accent-strong` (now ink), `--color-accent-soft` (now
rule-strong), `--color-warning`, `--ease-out-expo`. They exist only so
unmigrated pages keep rendering; they go once every page is migrated. Migrate as you touch:
`text-[var(--color-text-secondary)]` → `text-ink-2`, `bg-[var(--color-bg-elevated)]` →
`bg-card`, `border-[var(--color-border-default)]` → `border-rule`.

## 2. Type

Fonts: `font-display` (Caprasimo 400, display only), `font-body` (Libre Franklin variable,
the default), `font-mono` (Geist Mono: numbers, stickers, key, axes; never prose). Every
stack ends in the CJK fallback. Caprasimo has no bold or italic: headings and `.font-display`
set `font-synthesis: none`, and `<em>` inside them prints roman.

| Utility          | Size                     | Use                                      |
| ---------------- | ------------------------ | ---------------------------------------- |
| `text-label`     | 0.8rem                   | mono catalogue numbers, key, axes        |
| `text-body`      | 1rem, lh 1.55            | all prose, links, status                 |
| `text-lead`      | 1.25rem                  | row names, lede, primary label, wordmark |
| `text-title`     | 1.563rem                 | category name in the sheet, dialog title |
| `text-display-3` | 1.953rem                 | setup/apply section heads                |
| `text-display-2` | 2.441 → 3.052rem (fluid) | page titles, "What Apply writes", price  |
| `text-display-1` | 3.052 → 5.96rem (fluid)  | home h1, apply credits headline          |

Page title: `<h1 className="font-display text-display-2">`. Helpers: `num` (tabular lining
figures for counts in a column), `mono` (= `font-mono text-label` + 0.02em tracking).

## 3. Space, layout, breakpoints

- 4pt scale = Tailwind's numeric steps: 3xs `1` (4px) · 2xs `2` · xs `3` · sm `4` · md `6` ·
  lg `8` · xl `12` · 2xl `16` · 3xl `24` (96px). Raw: `--space-md` etc. There is deliberately
  no `p-md`: a `--spacing-md` token would turn every `max-w-md` into 24px.
- Roles: `px-gutter` (16 → 48px), `p-panel` (24px), `mt-section` (64 → 96px), `top-strip`
  (the top strip's height, `--strip-h`: 93px, 73px below `tab:`).
- `page-frame`: the 1200px column plus gutters. The nav, the strip and `PageShell` use it.
- Breakpoints: `tab:` ≥ 721px, so `max-tab:` is the phone layout; `desk:` ≥ 901px (list +
  side sheet), `max-desk:` is the inline editor. Tailwind's `md`/`lg` still exist; prefer
  these two.
- Surfaces: `paper-tooth` (paper + fibre tooth, for anything that must hide what scrolls
  under it), `ruled-card` (a description's ruled index card). Radius: `rounded-[3px]`
  (cards, buttons), `rounded-[4px]` (dialog).
- Focus is global: a 2px ink outline at offset 3. The design components adjust it (the
  primary sits at offset 6; `Input` swaps it for its ink underline). Pages don't restyle it.

## 4. Motion (`src/components/design/motion.ts`)

```ts
import {
  EASE_OUT,
  EASE_IN,
  EASE_IN_OUT,
  SPRING_SETTLE,
  SPRING_SNAP,
  DURATION,
  STAGGER,
  staggerDelay,
} from "@/src/components/design/motion";
```

| Token           | Value                                                                         | Use                                  |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| `EASE_OUT`      | `[0.16, 1, 0.3, 1]`                                                           | entrances, interactions              |
| `EASE_IN`       | `[0.7, 0, 0.84, 0]`                                                           | exits only                           |
| `EASE_IN_OUT`   | `[0.65, 0, 0.35, 1]`                                                          | both ends on screen: FLIP, underline |
| `SPRING_SETTLE` | spring 200 / 28.3 / 1 (ζ = 1)                                                 | things landing                       |
| `SPRING_SNAP`   | spring 500 / 44.7 / 1 (ζ = 1)                                                 | small acknowledgements               |
| `DURATION`      | press .1 · hover .18 · state .24 · sceneMin .32 · scene .52 · reduced .12 (s) |                                      |
| `STAGGER`       | each .024 · delay .06 · cap 12                                                | `staggerDelay(i)` for item i         |

CSS: `ease-out`, `ease-in`, `ease-in-out` are these curves; durations are `duration-100`,
`duration-180`, `duration-240`, `duration-520`.

In components, take transitions from the hook so reduced motion is handled:
`const { reduced, snap, settle, spring, fade, pageEase, stagger, item, itemDelay } = useMotionConfig();`
Every value comes from the tokens above: `snap` = `SPRING_SNAP`, `settle` and `spring` =
`SPRING_SETTLE`, `stagger` = `STAGGER` as `{ staggerChildren, delayChildren }`, and
`itemDelay(i)` = `staggerDelay(i)`. Under reduced motion all of them go to 0. Use `itemDelay`,
not `staggerDelay`, in components: only the hook's version handles reduced motion. The hook's
`SPRING` and `EASE_OUT_EXPO` exports are legacy names for `SPRING_SETTLE` and `EASE_OUT`. The
root has
`<MotionConfig reducedMotion="user">`, so transforms already stop under reduced motion; give
every set piece its opacity-only version (`DURATION.reduced`). Transform and opacity only,
no bounce, no loops. `PageTransition` stays a fade-in: never add `AnimatePresence` or an exit
to it.

## 5. Components

### Button, ButtonLink, buttonClass (`design/Button`)

`variant`: `primary` (orange, Caprasimo label, keyline 4px out of register until hover or
focus) · `quiet` (ink, underlined) · `ghost` (quiet in ink-2: Re-propose all…, Reconnect,
Close) · `danger` (quiet in danger) · `danger-confirm` (card fill, danger keyline: a dialog's
destructive confirm, e.g. Wipe & re-propose; start focus on "Not yet") · `icon` (44px
circle; always `aria-label`; Lucide icon with `strokeWidth={1.75}`). `size`: `md` (primary
56px / quiet 1rem) or `sm` (primary 44px / quiet 0.875rem). Default is `primary md`.
Primary keeps 4px right/bottom margin for its keyline; in the top strip on phones it drops
to 52px by itself.

```tsx
<Button onClick={apply}>Apply to Spotify</Button>
<Button variant="quiet" onClick={add}>Add track</Button>
<Button variant="icon" aria-label="Next category (smaller)"><ChevronRight strokeWidth={1.75} /></Button>
<ButtonLink href="/review" variant="ghost">Categories</ButtonLink>
<a className={buttonClass({ variant: "quiet" })} href="spotify:">Open Spotify</a>
```

### Input, Field, controlClass (`design/Input`)

`Input`: an underline input with its label above. Props: every `<input>` prop plus `label`,
`hint`, `error` (danger line with `role="alert"`, sets `aria-invalid`, joins
`aria-describedby` after the hint). `Field`: the same label/hint/error wiring around any
control via a render prop. `controlClass({ kind, invalid })`: `underline` (default),
`display` (a name in Caprasimo on a dotted rule, solid ink on focus), `ruled` (a
description on a ruled index card). Validate on blur.

```tsx
<Input label="Client ID" name="clientId" error={err} />
<Field label="Description" error={clash}>
  {(c) => <textarea {...c} className={controlClass({ kind: "ruled", invalid: !!clash })} />}
</Field>
```

### Dialog (`design/Dialog`): the price tag

Props: `open`, `onClose`, `title`, `description?`, `children?` (notes, under a hairline,
scrolls), `actions?` (the primary and "Not yet"), `width?` (`md` 30rem · `lg` 42rem),
`titleSize?` (`title` default · `price`: display-2, for the cost tag), `initialFocus?`.
Behaviour is fixed: `role="dialog"`, `aria-modal`, named by the title, focus trapped,
Escape and backdrop close, focus returns to the opener, and a closing tag is `inert` for its
200ms fade. It renders inline (not portalled) and leaves the page in the accessibility tree.

```tsx
<Dialog
  open={open}
  onClose={close}
  title={
    <>
      <span className="sr-only">Estimated cost </span>$0.42
    </>
  }
  titleSize="price"
  description="…"
  actions={
    <>
      <Button onClick={go}>Proceed</Button>
      <Button variant="quiet" onClick={close}>
        Not yet
      </Button>
    </>
  }
/>
```

### Card, surfaceClass (`design/Card`)

Card stock, 1px `rule-strong` keyline, radius 3, `p-panel`. `interactive` adds an ink
keyline on hover (only for surfaces that take a click). `surfaceClass(interactive)` is the
same recipe for motion or dnd-kit elements.

### TrackRow (`design/TrackRow`): liner notes

Props: `title`, `artist`, `href?` (title becomes a link, e.g. `spotify:track:<id>`),
`index?` (mono ink-3, zero-padded), `media?` (art before the title: pass `<AlbumArt>` or a
sleeve at 40–44px; it draws its own keyline), `trailing?` (one width per list), `className?`.
The art adds no name of its own: a cover is `alt=""` and a sleeve without `title` is
`aria-hidden`. Only a missing cover speaks: `PlainSleeve` is `role="img"`, "No cover art".
Inside a row that is already a link, pass `link={false}`. Render inside `<ol>`/`<ul>`. Never pass a score, rank or bin.

```tsx
<ol>
  {tracks.map((t) => (
    <TrackRow
      key={t.id}
      title={t.title}
      artist={t.artist}
      href={`spotify:track:${t.id}`}
      media={<AlbumArt trackId={t.id} size={44} link={false} />}
    />
  ))}
</ol>
```

### PageShell (`design/PageShell`)

`<main class="page-frame">` with an optional `back` (`{ href: SafeHref, label }`, ghost sm
link above), `eyebrow` (one ink-2 line above the title; only for information the title
doesn't carry) and `title` (h1, display-2). No animation of its own.

### NavLock (`design/NavLock`)

Unchanged. `useNavLock(active)` while any async job runs; every nav item goes inert and a
release refetches the status. `useNavLockState()` reads `{ locked, releases }`.

## 6. Site nav and top strip: the contract

The root layout renders, in order: `<SiteNav />`, `<ActionStripSlot />`, then the page
inside `PageTransition`. Neither the nav nor the slot remounts per route.

**Site nav.** Shown on every route except `/setup` and `/label` (so it now shows on `/`).
Wordmark with the record mark (links home; `aria-current="page"` on `/`), then Sources ·
Categories · Fit · Apply, then Labels behind a 1px rule; a 1.5px ink rule closes it. The
current step is ink with a 2px underline that slides between steps (`layoutId`,
`SPRING_SNAP`). A step is a link only when its page spends nothing on load; locked steps
are `span[role=link][aria-disabled]` in ink-3, out of the tab order. Phones: wordmark and
Labels on row 1, the steps spread across row 2. Pages must not print their own wordmark or
nav links (home: drop Categories and Labels from its routes list).

**Top strip (`ActionBar`).** Props unchanged: `end` (required: the page's one primary),
`status?` (one line, ink-2, truncates, `role="status" aria-live="polite"`, always in the
DOM), `start?` (a control before the status, e.g. the Fit ruler).

- **Render it from the page's first render, never behind a loading check.** While data
  loads, pass a disabled `end` and an empty or "Loading…" `status`. On the server it prints a
  hidden claim that holds the strip's room until the bar portals in after hydration; a bar
  that mounts later pushes the whole page down.
- Render it anywhere in the page (convention: first child of `<main>`). It prints into the
  slot directly under the nav through a portal.
- It is `sticky top-0`, not fixed: it takes its own room, so it never covers content. Once
  the masthead scrolls away it pins to the viewport top. Keyboard focus scrolls clear of it
  on its own (`scroll-padding-top` is set while a strip is on the page). Delete every bottom
  spacer, `pb-*` or `scroll-mb-*` you kept for the old bottom bar.
- One row at every width: `[start] status … end`. Always `--strip-h` tall (93px, 73px on
  phones) whatever it holds, with a hairline under it.
- `start`: give its control a preferred width (`w-80`) and let it shrink (fluid insides, no
  `100vw` calc). The strip caps it at the room `end` leaves; `end` never shrinks. On phones
  that room is about 100px beside a medium primary and the status line gets none, so keep
  anything the user must read in `start` or `end` (or use `size="sm"` for the primary).
- Anything sticky inside the page (a side sheet, a column head) sits below it:
  `sticky top-strip` (add your own gap with `calc`), and only on pages that have a strip.
- The slot is `z-30` and a stacking context. Page elements stay below `z-30`, or they paint
  over the strip and over a dialog opened from it.
- It fades in (opacity only, never a transform), so a `Dialog` opened from inside it (e.g.
  `ClassifyGate` as `end`) still covers the whole page.
- One strip per page. Without the layout (a page unit test), it renders in place with the
  same markup.
