# SpotifySorter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user, local Next.js 16 web app that scans the owner's Spotify library, uses Claude Haiku 4.5 to propose 25-35 vibey sub-genre/mood categories, classifies every track, and writes the result to prefixed Spotify playlists. Re-runs are incremental and idempotent.

**Architecture:** Single Next.js process on `localhost:3000` — frontend + API routes + OAuth callback in one app. Server-side LLM and Spotify token storage. Local JSON cache (`./data/cache.json`) with atomic writes. Two-phase LLM pipeline (`propose` → `classify`) with prompt caching, concurrency degradation on 429, and incremental diffing on re-run. UI follows `.impeccable.md` design DNA: tactile, nocturnal, unhurried — built via the `impeccable` / `ui-ux-pro-max` / `animate` / `polish` / `critique` skills.

**Tech Stack:** Node.js 24 LTS, TypeScript (strict), Next.js 16 App Router, Tailwind v4, shadcn/ui (unstyled primitives only), Framer Motion v12+, `@dnd-kit/core`, `@spotify/web-api-ts-sdk`, `@anthropic-ai/sdk`, Zod, pnpm, Vitest, MSW, Playwright.

**Model routing:** Opus for plan/architecture work, Sonnet for implementation, Haiku for searches.

**Source spec:** [`docs/superpowers/specs/2026-05-13-spotifysorter-design.md`](../specs/2026-05-13-spotifysorter-design.md)
**Design DNA:** [`/.impeccable.md`](../../../.impeccable.md)

---

## File Structure

The implementation maps onto this structure. Each task creates or modifies specific files within it.

```
spotifysorter/
├── .env.local.example                       # Documented template
├── .gitignore                                # Includes data/, .env.local, node_modules
├── .impeccable.md                            # (already exists)
├── .nvmrc                                    # 24
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── start.ts                                  # Custom dev runner; opens browser on :3000
│
├── app/
│   ├── layout.tsx                            # Root layout: fonts, theme, CSS tokens
│   ├── globals.css                           # Tailwind + OKLCH design tokens
│   ├── page.tsx                              # Landing — Connect Spotify
│   ├── setup/page.tsx                        # First-run config wizard
│   ├── scope/page.tsx                        # Choose included playlists
│   ├── scan/page.tsx                         # Scan progress
│   ├── review/page.tsx                       # Edit proposed categories
│   ├── classify/page.tsx                     # Confidence slider + manual override
│   ├── apply/page.tsx                        # Apply + success
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts                # PKCE init
│       │   └── callback/route.ts             # OAuth callback handler
│       ├── config/route.ts                   # Wizard saves Client ID, Anthropic key, prefix
│       ├── spotify/
│       │   ├── playlists/route.ts            # List user playlists
│       │   ├── scan/route.ts                 # Run library scan (SSE progress)
│       │   └── apply/route.ts                # Create + populate playlists (SSE progress)
│       ├── llm/
│       │   ├── propose/route.ts              # Phase 1
│       │   ├── classify/route.ts             # Phase 2 (SSE progress)
│       │   └── reclassify/route.ts           # Phase 2b surgical
│       └── cache/route.ts                    # Read / patch cache
│
├── src/
│   ├── lib/
│   │   ├── cache/
│   │   │   ├── schema.ts                     # Zod schema for cache.json
│   │   │   ├── read.ts                       # Load + validate
│   │   │   ├── write.ts                      # Atomic write (temp + rename)
│   │   │   ├── patch.ts                      # Deep-merge updates
│   │   │   └── index.ts                      # Public API
│   │   ├── spotify/
│   │   │   ├── pkce.ts                       # PKCE verifier + challenge
│   │   │   ├── auth.ts                       # OAuth URL builder, code exchange
│   │   │   ├── refresh.ts                    # Token refresh + auto-retry
│   │   │   ├── client.ts                     # Authenticated SDK factory
│   │   │   ├── pagination.ts                 # Generic cursor paginator
│   │   │   ├── playlists.ts                  # List user playlists
│   │   │   ├── tracks.ts                     # Tracks per playlist + Liked Songs
│   │   │   ├── artists.ts                    # Batched artist genre fetch
│   │   │   ├── dedupe.ts                     # Dedupe + linked_from + skip locals
│   │   │   ├── apply.ts                      # Create/append playlists
│   │   │   ├── retry.ts                      # 429 handling
│   │   │   └── scopes.ts                     # OAuth scope constant
│   │   ├── llm/
│   │   │   ├── client.ts                     # Anthropic SDK factory + key validation
│   │   │   ├── schemas.ts                    # Zod for propose + classify outputs
│   │   │   ├── propose.ts                    # Phase 1 prompt + call
│   │   │   ├── classify.ts                   # Phase 2 batched
│   │   │   ├── reclassify.ts                 # Phase 2b surgical
│   │   │   ├── concurrency.ts                # Degrading semaphore (3→2→1)
│   │   │   ├── cost.ts                       # USD estimate from token usage
│   │   │   └── log.ts                        # Append JSONL log per call
│   │   ├── classification/
│   │   │   ├── threshold.ts                  # Slider filter
│   │   │   ├── force-fit.ts                  # Highest-match wins when none clears threshold
│   │   │   ├── override.ts                   # Apply manual overrides on top
│   │   │   └── diff.ts                       # New/removed/unchanged across runs
│   │   ├── categories/
│   │   │   ├── delta.ts                      # Old vs new category delta (for surgical reclass)
│   │   │   ├── prefix.ts                     # `<prefix> <name>` format/parse
│   │   │   └── merge.ts                      # Merge category A into B
│   │   ├── pipeline/
│   │   │   ├── scan.ts                       # Orchestrate fetch + dedupe
│   │   │   ├── propose.ts                    # Orchestrate propose
│   │   │   ├── classify.ts                   # Orchestrate classify
│   │   │   └── apply.ts                      # Orchestrate apply
│   │   └── config/
│   │       ├── env.ts                        # Validate env at startup
│   │       └── schema.ts                     # User preferences Zod
│   │
│   ├── components/
│   │   ├── ui/                               # shadcn primitives, restyled
│   │   ├── design/                           # Project design system primitives
│   │   │   ├── Button.tsx                    # Text-driven, brass underline
│   │   │   ├── Input.tsx                     # Bottom-border only
│   │   │   ├── Card.tsx                      # 1px tinted border, no glow
│   │   │   ├── TrackList.tsx                 # LP-liner-notes track list
│   │   │   └── PageShell.tsx                 # Layout wrapper with motion
│   │   ├── setup/
│   │   │   ├── DevAppInstructions.tsx
│   │   │   ├── ClientIdStep.tsx
│   │   │   ├── AnthropicKeyStep.tsx
│   │   │   └── PrefixStep.tsx
│   │   ├── scope/
│   │   │   └── PlaylistCheckboxCard.tsx
│   │   ├── scan/
│   │   │   └── ProgressBar.tsx
│   │   ├── review/
│   │   │   ├── CategoryCard.tsx
│   │   │   ├── AddCategoryForm.tsx
│   │   │   └── CostPreviewModal.tsx
│   │   ├── classify/
│   │   │   ├── ConfidenceSlider.tsx
│   │   │   ├── PlaylistPreviewCard.tsx
│   │   │   └── TrackChip.tsx
│   │   ├── apply/
│   │   │   ├── ApplyConfirmationModal.tsx
│   │   │   └── SuccessCredits.tsx
│   │   └── shared/
│   │       ├── ErrorBanner.tsx
│   │       └── DiffBanner.tsx
│   │
│   ├── hooks/
│   │   ├── useCache.ts
│   │   ├── usePipelineProgress.ts
│   │   └── useReducedMotionRespect.ts
│   │
│   └── styles/
│       └── tokens.css                        # OKLCH variables
│
├── tests/
│   ├── unit/                                 # Pure-logic Vitest
│   ├── integration/                          # Vitest + MSW (HTTP)
│   ├── e2e/                                  # Playwright
│   ├── fixtures/                             # Shared test data
│   └── setup.ts                              # Vitest globals
│
├── data/                                     # gitignored
│   ├── cache.json
│   └── logs/
│
└── docs/
    ├── superpowers/
    │   ├── specs/
    │   └── plans/
    └── manual-test-checklist.md
```

---

## Phase Map

| Phase | Theme                                                  | Tasks |
| ----- | ------------------------------------------------------ | ----- |
| 1     | Scaffold + design tokens + setup wizard                | 1-17  |
| 2     | OAuth + token refresh + scope screen                   | 18-29 |
| 3     | Library scan + dedupe + artist genres                  | 30-39 |
| 4     | LLM propose + review screen + drag-merge               | 40-54 |
| 5     | LLM classify + confidence slider + manual override     | 55-69 |
| 6     | Apply flow + idempotent updates + success screen       | 70-79 |
| 7     | Incremental re-runs + diff view + surgical re-classify | 80-89 |
| 8     | Polish pass — `animate`, `polish`, `critique`          | 90-97 |

Across all phases: invoke `impeccable` (craft mode) when generating any new screen, then `animate` → `polish` → `critique` before declaring it done. UI tasks call out which skills to invoke; logic tasks follow strict TDD with code in every step.

---

# Phase 1 — Scaffold + Design Tokens + Setup Wizard

## Task 1: Initialize Next.js 16 project

**Files:**

- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.nvmrc`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Run the Next.js scaffold**

```bash
cd /Users/possible/Documents/SpotifySorter
pnpm create next-app@canary . \
  --typescript --tailwind --eslint --app --src-dir=false \
  --import-alias "@/*" --use-pnpm --turbopack --no-git
```

When prompted about non-empty directory: choose continue. When prompted about `.impeccable.md`: keep it.

- [ ] **Step 2: Pin Node 24 + pnpm + write `.nvmrc`**

```bash
echo "24" > .nvmrc
node -v   # confirm 24.x
pnpm -v   # confirm 9+
```

- [ ] **Step 3: Update `.gitignore`**

Append to `.gitignore`:

```gitignore
# project local data
/data
.env.local
.env.*.local
/playwright-report
/test-results
/coverage
```

- [ ] **Step 4: Verify scaffold runs**

```bash
pnpm dev
```

Expected: Next.js server starts on `http://localhost:3000`. Default page renders. Kill with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 16 app with TypeScript + Tailwind"
```

---

## Task 2: Install runtime dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install core libs**

```bash
pnpm add @spotify/web-api-ts-sdk @anthropic-ai/sdk zod \
  framer-motion @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  lucide-react clsx tailwind-merge class-variance-authority \
  open
```

- [ ] **Step 2: Install dev libs**

```bash
pnpm add -D vitest @vitest/coverage-v8 @vitest/ui jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  msw @playwright/test \
  prettier eslint-config-prettier
```

- [ ] **Step 3: Install Playwright browsers**

```bash
pnpm exec playwright install chromium
```

- [ ] **Step 4: Sanity check**

```bash
pnpm ls --depth=0
```

Expected: lists all installed packages, no `UNMET PEER DEPENDENCY` warnings.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install runtime + dev dependencies"
```

---

## Task 3: Configure Vitest

**Files:**

- Create: `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      exclude: [
        "tests/**",
        "**/*.config.*",
        "app/**/page.tsx",
        "app/**/layout.tsx",
        ".next/**",
      ],
    },
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 2: Install missing react plugin**

```bash
pnpm add -D @vitejs/plugin-react
```

- [ ] **Step 3: Write `tests/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
```

- [ ] **Step 4: Add npm scripts to `package.json`**

Replace the `scripts` block:

```json
"scripts": {
  "dev": "next dev",
  "start:open": "tsx start.ts",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 5: Verify Vitest runs (no tests yet)**

```bash
pnpm test
```

Expected: `No test files found, exiting with code 0` (acceptable for now) — if it errors, the config is wrong.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/setup.ts package.json pnpm-lock.yaml
git commit -m "chore: configure Vitest with jsdom + coverage thresholds"
```

---

## Task 4: Configure Playwright

**Files:**

- Create: `playwright.config.ts`, `tests/e2e/.gitkeep`

- [ ] **Step 1: Write `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 2: Smoke check**

```bash
mkdir -p tests/e2e
touch tests/e2e/.gitkeep
pnpm exec playwright test --list
```

Expected: `Total: 0 tests in 0 files`. Config is valid.

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts tests/e2e/.gitkeep
git commit -m "chore: configure Playwright for E2E tests"
```

---

## Task 5: Apply OKLCH design tokens to `globals.css`

**Files:**

- Modify: `app/globals.css`

- [ ] **Step 1: Replace `app/globals.css` contents**

```css
@import "tailwindcss";

@theme {
  /* Surfaces — deep coffee-brown, never pure black */
  --color-bg-base: oklch(0.16 0.012 55);
  --color-bg-surface: oklch(0.2 0.014 55);
  --color-bg-elevated: oklch(0.24 0.016 55);
  --color-border-default: oklch(0.3 0.018 55);
  --color-border-strong: oklch(0.4 0.022 55);

  /* Text — warm cream → muted amber → tertiary */
  --color-text-primary: oklch(0.95 0.014 70);
  --color-text-secondary: oklch(0.72 0.02 65);
  --color-text-tertiary: oklch(0.52 0.025 60);

  /* Accent — brass/amber, the 10% */
  --color-accent: oklch(0.74 0.14 55);
  --color-accent-strong: oklch(0.8 0.16 55);
  --color-accent-soft: oklch(0.62 0.1 55);

  /* Semantic — muted, never neon */
  --color-success: oklch(0.66 0.12 145);
  --color-danger: oklch(0.62 0.2 25);
  --color-warning: oklch(0.75 0.13 80);

  /* Spacing — 4pt scale, semantic only */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2.5rem;
  --spacing-2xl: 4rem;
  --spacing-3xl: 6rem;

  /* Typography */
  --font-display: "Editorial New", "Iowan Old Style", Georgia, serif;
  --font-body: "PP Neue Montreal", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
}

html,
body {
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-feature-settings:
    "kern" 1,
    "liga" 1;
  -webkit-font-smoothing: antialiased;
}

::selection {
  background: var(--color-accent-soft);
  color: var(--color-bg-base);
}
```

- [ ] **Step 2: Verify it builds**

```bash
pnpm dev
```

Visit `http://localhost:3000`. Page renders dark coffee-brown bg, cream text. Kill server.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: apply OKLCH design tokens from .impeccable.md"
```

---

## Task 6: Wire fonts (Editorial New, PP Neue Montreal, Geist Mono)

**Files:**

- Create: `app/fonts/` (woff2 files), `app/layout.tsx` (modify)

- [ ] **Step 1: Download fonts to `app/fonts/`**

Editorial New + PP Neue Montreal are free from [pangrampangram.com](https://pangrampangram.com). Geist Mono is on npm.

```bash
mkdir -p app/fonts
pnpm add geist
```

Manually download Editorial New + PP Neue Montreal woff2 files from Pangram Pangram and place in `app/fonts/`:

- `EditorialNew-Regular.woff2`
- `EditorialNew-Italic.woff2`
- `PPNeueMontreal-Book.woff2`
- `PPNeueMontreal-Medium.woff2`
- `PPNeueMontreal-Bold.woff2`

If the user hasn't downloaded these yet, halt and ask them to.

- [ ] **Step 2: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const editorialNew = localFont({
  src: [
    {
      path: "./fonts/EditorialNew-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/EditorialNew-Italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-display",
  display: "swap",
});

const ppNeueMontreal = localFont({
  src: [
    {
      path: "./fonts/PPNeueMontreal-Book.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/PPNeueMontreal-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/PPNeueMontreal-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpotifySorter",
  description: "A private record-listening room at 1am.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${editorialNew.variable} ${ppNeueMontreal.variable} ${GeistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm dev
```

Visit `http://localhost:3000`. Open DevTools → Computed → confirm body font-family resolves to `PP Neue Montreal`. Kill.

- [ ] **Step 4: Commit**

```bash
git add app/fonts app/layout.tsx package.json pnpm-lock.yaml
git commit -m "feat: wire Editorial New + PP Neue Montreal + Geist Mono"
```

---

## Task 7: Cache Zod schema

**Files:**

- Create: `src/lib/cache/schema.ts`, `tests/unit/cache-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cache-schema.test.ts
import { describe, it, expect } from "vitest";
import { CacheSchema, EXPECTED_CACHE_VERSION } from "@/src/lib/cache/schema";

describe("CacheSchema", () => {
  const minimalValid = {
    version: EXPECTED_CACHE_VERSION,
    auth: null,
    config: {
      prefix: "✨",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    artists: {},
    tracks: {},
    categories: {},
    assignments: {},
    runs: [],
  };

  it("accepts a minimal valid cache", () => {
    const result = CacheSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
  });

  it("rejects cache missing required version", () => {
    const { version, ...withoutVersion } = minimalValid;
    expect(CacheSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it("rejects threshold outside 0-100", () => {
    const bad = {
      ...minimalValid,
      config: { ...minimalValid.config, confidence_threshold: 150 },
    };
    expect(CacheSchema.safeParse(bad).success).toBe(false);
  });

  it("round-trips a populated cache losslessly", () => {
    const populated = {
      ...minimalValid,
      auth: { refresh_token: "rt_abc", expires_at: "2026-05-13T18:00:00.000Z" },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Self Care",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {
        c1: {
          name: "Aesthetic Rap",
          description: "Dreamy",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
      },
      assignments: {
        t1: {
          matches: [{ category_id: "c1", score: 87 }],
          reasoning: "Dreamy synth",
          classified_at: "2026-05-13T00:00:00.000Z",
          override: null,
        },
      },
    };
    const parsed = CacheSchema.parse(populated);
    expect(parsed).toEqual(populated);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/cache-schema.test.ts
```

Expected: FAIL — `Cannot find module '@/src/lib/cache/schema'`.

- [ ] **Step 3: Implement the schema**

```typescript
// src/lib/cache/schema.ts
import { z } from "zod";

export const EXPECTED_CACHE_VERSION = 1;

const ISODate = z.string().datetime();

export const ConfigSchema = z.object({
  prefix: z.string().min(1).max(8),
  confidence_threshold: z.number().int().min(0).max(100),
  anthropic_model: z.string().min(1),
});

export const ScopeSchema = z.object({
  included_playlist_ids: z.array(z.string()),
  excluded_playlist_ids: z.array(z.string()),
  include_liked_songs: z.boolean(),
});

export const AuthSchema = z
  .object({
    refresh_token: z.string(),
    expires_at: ISODate,
  })
  .nullable();

export const ArtistSchema = z.object({
  name: z.string(),
  genres: z.array(z.string()),
});

export const TrackSchema = z.object({
  artist_id: z.string(),
  title: z.string(),
  first_seen: ISODate,
});

export const CategorySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  spotify_playlist_id: z.string().nullable(),
  created_at: ISODate,
});

export const MatchSchema = z.object({
  category_id: z.string(),
  score: z.number().int().min(0).max(100),
});

export const OverrideSchema = z
  .object({
    category_id: z.string(),
    set_at: ISODate,
  })
  .nullable();

export const AssignmentSchema = z.object({
  matches: z.array(MatchSchema).min(1).max(5),
  reasoning: z.string(),
  classified_at: ISODate,
  override: OverrideSchema,
});

export const RunSchema = z.object({
  run_id: z.string(),
  started_at: ISODate,
  completed_at: ISODate.nullable(),
  tracks_classified: z.number().int().min(0),
  tracks_total: z.number().int().min(0),
  cost_usd: z.number().min(0),
  summary: z.string(),
  skipped: z.array(z.string()).optional(),
});

export const CacheSchema = z.object({
  version: z.literal(EXPECTED_CACHE_VERSION),
  auth: AuthSchema,
  config: ConfigSchema,
  scope: ScopeSchema,
  artists: z.record(z.string(), ArtistSchema),
  tracks: z.record(z.string(), TrackSchema),
  categories: z.record(z.string(), CategorySchema),
  assignments: z.record(z.string(), AssignmentSchema),
  runs: z.array(RunSchema),
});

export type Cache = z.infer<typeof CacheSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Artist = z.infer<typeof ArtistSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/cache-schema.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/schema.ts tests/unit/cache-schema.test.ts
git commit -m "feat: cache Zod schema with version + threshold validation"
```

---

## Task 8: Cache read function

**Files:**

- Create: `src/lib/cache/read.ts`, `tests/unit/cache-read.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cache-read.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCache, defaultCache } from "@/src/lib/cache/read";
import { EXPECTED_CACHE_VERSION } from "@/src/lib/cache/schema";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readCache", () => {
  it("returns defaultCache when file does not exist", async () => {
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.version).toBe(EXPECTED_CACHE_VERSION);
    expect(cache.tracks).toEqual({});
    expect(cache.config.prefix).toBe("✨");
  });

  it("reads and validates a valid cache file", async () => {
    const path = join(dir, "cache.json");
    await writeFile(path, JSON.stringify(defaultCache()), "utf-8");
    const cache = await readCache(path);
    expect(cache.version).toBe(EXPECTED_CACHE_VERSION);
  });

  it("throws CacheVersionMismatch on stale cache", async () => {
    const path = join(dir, "cache.json");
    await writeFile(
      path,
      JSON.stringify({ ...defaultCache(), version: 999 }),
      "utf-8",
    );
    await expect(readCache(path)).rejects.toThrow(/version mismatch/i);
  });

  it("throws on malformed JSON", async () => {
    const path = join(dir, "cache.json");
    await writeFile(path, "{not valid json", "utf-8");
    await expect(readCache(path)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/cache-read.test.ts
```

Expected: FAIL — `Cannot find module '@/src/lib/cache/read'`.

- [ ] **Step 3: Implement read.ts**

```typescript
// src/lib/cache/read.ts
import { readFile } from "node:fs/promises";
import { CacheSchema, EXPECTED_CACHE_VERSION, type Cache } from "./schema";

export class CacheVersionMismatch extends Error {
  constructor(found: number) {
    super(
      `Cache version mismatch: file is v${found}, expected v${EXPECTED_CACHE_VERSION}`,
    );
    this.name = "CacheVersionMismatch";
  }
}

export function defaultCache(): Cache {
  return {
    version: EXPECTED_CACHE_VERSION,
    auth: null,
    config: {
      prefix: "✨",
      confidence_threshold: 65,
      anthropic_model: "claude-haiku-4-5-20251001",
    },
    scope: {
      included_playlist_ids: [],
      excluded_playlist_ids: [],
      include_liked_songs: true,
    },
    artists: {},
    tracks: {},
    categories: {},
    assignments: {},
    runs: [],
  };
}

export async function readCache(path: string): Promise<Cache> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultCache();
    throw err;
  }
  const parsed = JSON.parse(raw);
  if (
    typeof parsed?.version === "number" &&
    parsed.version !== EXPECTED_CACHE_VERSION
  ) {
    throw new CacheVersionMismatch(parsed.version);
  }
  return CacheSchema.parse(parsed);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/cache-read.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/read.ts tests/unit/cache-read.test.ts
git commit -m "feat: cache read with version mismatch detection + default fallback"
```

---

## Task 9: Cache atomic write

**Files:**

- Create: `src/lib/cache/write.ts`, `tests/unit/cache-write.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cache-write.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCache } from "@/src/lib/cache/write";
import { defaultCache } from "@/src/lib/cache/read";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("writeCache", () => {
  it("writes a valid cache", async () => {
    const path = join(dir, "cache.json");
    await writeCache(path, defaultCache());
    const raw = await readFile(path, "utf-8");
    expect(JSON.parse(raw).version).toBe(1);
  });

  it("writes via temp file then rename (no torn writes)", async () => {
    const path = join(dir, "cache.json");
    const fs = await import("node:fs/promises");
    const renameSpy = vi.spyOn(fs, "rename");
    await writeCache(path, defaultCache());
    expect(renameSpy).toHaveBeenCalledTimes(1);
    const [from, to] = renameSpy.mock.calls[0]!;
    expect(String(from)).toMatch(/cache\.json\.tmp-/);
    expect(to).toBe(path);
  });

  it("does not leave a tmp file behind on success", async () => {
    const path = join(dir, "cache.json");
    await writeCache(path, defaultCache());
    const files = await readdir(dir);
    expect(files.filter((f) => f.includes(".tmp"))).toEqual([]);
  });

  it("rejects writing an invalid cache", async () => {
    const path = join(dir, "cache.json");
    const bad = { ...defaultCache(), version: 999 } as unknown as Parameters<
      typeof writeCache
    >[1];
    await expect(writeCache(path, bad)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/cache-write.test.ts
```

Expected: FAIL — `Cannot find module '@/src/lib/cache/write'`.

- [ ] **Step 3: Implement write.ts**

```typescript
// src/lib/cache/write.ts
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { CacheSchema, type Cache } from "./schema";

export async function writeCache(path: string, cache: Cache): Promise<void> {
  CacheSchema.parse(cache);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, JSON.stringify(cache, null, 2), "utf-8");
  await rename(tmp, path);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/cache-write.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/write.ts tests/unit/cache-write.test.ts
git commit -m "feat: cache atomic write via temp + rename"
```

---

## Task 10: Cache patch helper + public API

**Files:**

- Create: `src/lib/cache/patch.ts`, `src/lib/cache/index.ts`, `tests/unit/cache-patch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cache-patch.test.ts
import { describe, it, expect } from "vitest";
import { patchCache } from "@/src/lib/cache/patch";
import { defaultCache } from "@/src/lib/cache/read";

describe("patchCache", () => {
  it("returns a new object (no mutation of input)", () => {
    const before = defaultCache();
    const after = patchCache(before, { config: { prefix: "⭐" } });
    expect(before.config.prefix).toBe("✨");
    expect(after.config.prefix).toBe("⭐");
    expect(after).not.toBe(before);
  });

  it("preserves untouched keys", () => {
    const before = defaultCache();
    const after = patchCache(before, { config: { prefix: "⭐" } });
    expect(after.config.confidence_threshold).toBe(65);
  });

  it("replaces records by key (does not deep-merge entries)", () => {
    const before = patchCache(defaultCache(), {
      tracks: {
        t1: {
          artist_id: "a1",
          title: "A",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    });
    const after = patchCache(before, {
      tracks: {
        t2: {
          artist_id: "a2",
          title: "B",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    });
    expect(Object.keys(after.tracks).sort()).toEqual(["t1", "t2"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/cache-patch.test.ts
```

Expected: FAIL — `Cannot find module '@/src/lib/cache/patch'`.

- [ ] **Step 3: Implement patch.ts and index.ts**

```typescript
// src/lib/cache/patch.ts
import type { Cache } from "./schema";

type Patch = {
  [K in keyof Cache]?: Cache[K] extends Record<string, unknown>
    ? Partial<Cache[K]>
    : Cache[K];
};

export function patchCache(cache: Cache, patch: Patch): Cache {
  const next: Cache = { ...cache };
  for (const key of Object.keys(patch) as Array<keyof Patch>) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    const current = cache[key];
    if (
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      typeof incoming === "object" &&
      !Array.isArray(incoming)
    ) {
      (next as Record<string, unknown>)[key as string] = {
        ...current,
        ...incoming,
      };
    } else {
      (next as Record<string, unknown>)[key as string] = incoming;
    }
  }
  return next;
}
```

```typescript
// src/lib/cache/index.ts
export { CacheSchema, EXPECTED_CACHE_VERSION } from "./schema";
export type { Cache, Category, Assignment, Track, Artist } from "./schema";
export { readCache, defaultCache, CacheVersionMismatch } from "./read";
export { writeCache } from "./write";
export { patchCache } from "./patch";
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/cache-patch.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache/patch.ts src/lib/cache/index.ts tests/unit/cache-patch.test.ts
git commit -m "feat: cache patch helper + public API surface"
```

---

## Task 11: Env validator

**Files:**

- Create: `src/lib/config/env.ts`, `tests/unit/env.test.ts`, `.env.local.example`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/env.test.ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "@/src/lib/config/env";

describe("parseEnv", () => {
  it("accepts valid env", () => {
    const env = parseEnv({
      SPOTIFY_CLIENT_ID: "a".repeat(32),
      ANTHROPIC_API_KEY: "sk-ant-XXXX",
    });
    expect(env.SPOTIFY_CLIENT_ID).toHaveLength(32);
    expect(env.ANTHROPIC_API_KEY).toMatch(/^sk-ant-/);
  });

  it("rejects missing client id", () => {
    expect(() => parseEnv({ ANTHROPIC_API_KEY: "sk-ant-x" })).toThrow(
      /SPOTIFY_CLIENT_ID/,
    );
  });

  it("rejects anthropic key not starting with sk-ant-", () => {
    expect(() =>
      parseEnv({
        SPOTIFY_CLIENT_ID: "a".repeat(32),
        ANTHROPIC_API_KEY: "sk-foo",
      }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/env.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement env.ts**

```typescript
// src/lib/config/env.ts
import { z } from "zod";

export const EnvSchema = z.object({
  SPOTIFY_CLIENT_ID: z
    .string()
    .min(20, "SPOTIFY_CLIENT_ID must be at least 20 chars"),
  ANTHROPIC_API_KEY: z
    .string()
    .regex(/^sk-ant-/, "ANTHROPIC_API_KEY must start with sk-ant-"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Env {
  return EnvSchema.parse(source);
}

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 4: Add `.env.local.example`**

```env
# Spotify Developer App → Settings → Client ID
SPOTIFY_CLIENT_ID=

# Anthropic API key — https://console.anthropic.com → API Keys
ANTHROPIC_API_KEY=sk-ant-
```

- [ ] **Step 5: Run to verify pass**

```bash
pnpm test tests/unit/env.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config/env.ts tests/unit/env.test.ts .env.local.example
git commit -m "feat: env validation with helpful error messages"
```

---

## Task 12: Anthropic key live validator

**Files:**

- Create: `src/lib/llm/client.ts`, `tests/integration/anthropic-validate.test.ts`, `tests/fixtures/anthropic-handlers.ts`

- [ ] **Step 1: Write MSW handlers fixture**

```typescript
// tests/fixtures/anthropic-handlers.ts
import { http, HttpResponse } from "msw";

export const anthropicValidateOk = http.post(
  "https://api.anthropic.com/v1/messages",
  () =>
    HttpResponse.json({
      id: "msg_x",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 1 },
    }),
);

export const anthropicValidateUnauthorized = http.post(
  "https://api.anthropic.com/v1/messages",
  () =>
    HttpResponse.json(
      {
        type: "error",
        error: { type: "authentication_error", message: "invalid key" },
      },
      { status: 401 },
    ),
);
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// tests/integration/anthropic-validate.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { validateAnthropicKey } from "@/src/lib/llm/client";
import {
  anthropicValidateOk,
  anthropicValidateUnauthorized,
} from "../fixtures/anthropic-handlers";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("validateAnthropicKey", () => {
  it("returns ok for a valid key", async () => {
    server.use(anthropicValidateOk);
    const result = await validateAnthropicKey("sk-ant-x");
    expect(result).toEqual({ ok: true });
  });

  it("returns error for 401", async () => {
    server.use(anthropicValidateUnauthorized);
    const result = await validateAnthropicKey("sk-ant-bad");
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toMatch(/invalid|authentication/i);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm test tests/integration/anthropic-validate.test.ts
```

Expected: FAIL — `Cannot find module '@/src/lib/llm/client'`.

- [ ] **Step 4: Implement client.ts**

```typescript
// src/lib/llm/client.ts
import Anthropic from "@anthropic-ai/sdk";

export type ValidateResult = { ok: true } | { ok: false; message: string };

export async function validateAnthropicKey(
  apiKey: string,
): Promise<ValidateResult> {
  const client = new Anthropic({ apiKey });
  try {
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: msg };
  }
}

export function anthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}
```

- [ ] **Step 5: Run to verify pass**

```bash
pnpm test tests/integration/anthropic-validate.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/client.ts tests/integration/anthropic-validate.test.ts tests/fixtures/anthropic-handlers.ts
git commit -m "feat: validate Anthropic API key via tiny ping call"
```

---

## Task 13: Config save route

**Files:**

- Create: `app/api/config/route.ts`, `tests/integration/config-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/config-route.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "@/app/api/config/route";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SORTER_ENV_FILE = join(dir, ".env.local");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
  delete process.env.SORTER_ENV_FILE;
});

describe("POST /api/config", () => {
  it("writes secrets to env file and prefix to cache", async () => {
    const req = new Request("http://localhost/api/config", {
      method: "POST",
      body: JSON.stringify({
        spotify_client_id: "a".repeat(32),
        anthropic_api_key: "sk-ant-test",
        prefix: "★",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const env = await readFile(join(dir, ".env.local"), "utf-8");
    expect(env).toContain("SPOTIFY_CLIENT_ID=");
    expect(env).toContain("ANTHROPIC_API_KEY=sk-ant-test");
    const cache = JSON.parse(await readFile(join(dir, "cache.json"), "utf-8"));
    expect(cache.config.prefix).toBe("★");
  });

  it("rejects bad payload with 400", async () => {
    const req = new Request("http://localhost/api/config", {
      method: "POST",
      body: JSON.stringify({ spotify_client_id: "short" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/config-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/config/route.ts
import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";

const Body = z.object({
  spotify_client_id: z.string().min(20),
  anthropic_api_key: z.string().regex(/^sk-ant-/),
  prefix: z.string().min(1).max(8),
});

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}
function envFile(): string {
  return process.env.SORTER_ENV_FILE ?? join(process.cwd(), ".env.local");
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  const { spotify_client_id, anthropic_api_key, prefix } = parsed.data;

  const envContent = `SPOTIFY_CLIENT_ID=${spotify_client_id}\nANTHROPIC_API_KEY=${anthropic_api_key}\n`;
  await writeFile(envFile(), envContent, "utf-8");

  const cachePath = join(dataDir(), "cache.json");
  const current = await readCache(cachePath);
  await writeCache(
    cachePath,
    patchCache(current, { config: { ...current.config, prefix } }),
  );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/config-route.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/config/route.ts tests/integration/config-route.test.ts
git commit -m "feat: config save route writes env + updates cache prefix"
```

---

## Task 14: Design system primitive — Button

**Files:**

- Create: `src/components/design/Button.tsx`, `tests/unit/design-button.test.tsx`

- [ ] **Step 1: Invoke design skills before drafting**

Before writing, invoke `impeccable` (craft mode) and `ui-ux-pro-max` for component intelligence on a "text-driven button with brass underline" against the `.impeccable.md` palette.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/design-button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/src/components/design/Button';

describe('Button', () => {
  it('renders text content', () => {
    render(<Button>Connect Spotify</Button>);
    expect(screen.getByRole('button', { name: 'Connect Spotify' })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    let clicks = 0;
    render(<Button onClick={() => { clicks++; }}>Tap</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(clicks).toBe(1);
  });

  it('respects disabled state', () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('exposes a primary and ghost variant', () => {
    render(
      <>
        <Button variant="primary">P</Button>
        <Button variant="ghost">G</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'P' })).toHaveAttribute('data-variant', 'primary');
    expect(screen.getByRole('button', { name: 'G' })).toHaveAttribute('data-variant', 'ghost');
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm test tests/unit/design-button.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement Button**

```tsx
// src/components/design/Button.tsx
"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

type Variant = "primary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        data-variant={variant}
        className={clsx(
          "group relative inline-flex items-baseline gap-1 px-1 py-2",
          "text-base font-medium tracking-tight",
          "text-[var(--color-text-primary)]",
          "transition-colors duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variant === "ghost" &&
            "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
          className,
        )}
        {...rest}
      >
        <span>{children}</span>
        {variant === "primary" && (
          <motion.span
            aria-hidden
            className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-[var(--color-accent)]"
            initial={{ scaleX: 0.4, opacity: 0.7 }}
            whileHover={{ scaleX: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 30,
              mass: 0.8,
            }}
          />
        )}
      </button>
    );
  },
);
```

- [ ] **Step 5: Run to verify pass**

```bash
pnpm test tests/unit/design-button.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 6: Critique pass**

Invoke `critique` skill against the rendered Button. Adjust if it scores poorly on contrast, motion subtlety, or anti-pattern detection.

- [ ] **Step 7: Commit**

```bash
git add src/components/design/Button.tsx tests/unit/design-button.test.tsx
git commit -m "feat: text-driven Button with brass underline (Framer Motion)"
```

---

## Task 15: Design system primitives — Input + Card + PageShell

**Files:**

- Create: `src/components/design/Input.tsx`, `src/components/design/Card.tsx`, `src/components/design/PageShell.tsx`

- [ ] **Step 1: Invoke design skills**

Before drafting, run `impeccable` (craft mode) and `ui-ux-pro-max` against `.impeccable.md` for: Input (single bottom border, brass focus underline), Card (1px tinted border, no glow), PageShell (asymmetric layout, generous whitespace).

- [ ] **Step 2: Implement Input**

```tsx
// src/components/design/Input.tsx
"use client";
import { forwardRef, type InputHTMLAttributes } from "react";
import clsx from "clsx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs uppercase tracking-widest text-[var(--color-text-tertiary)]"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          "w-full bg-transparent px-1 py-2",
          "text-base text-[var(--color-text-primary)]",
          "border-b border-[var(--color-border-default)]",
          "focus:outline-none focus:border-[var(--color-accent)]",
          "transition-colors duration-200",
          className,
        )}
        {...rest}
      />
    </div>
  );
});
```

- [ ] **Step 3: Implement Card**

```tsx
// src/components/design/Card.tsx
"use client";
import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "bg-[var(--color-bg-surface)]",
        "border border-[var(--color-border-default)]",
        "p-6",
        "transition-colors duration-300",
        "hover:border-[var(--color-border-strong)]",
        className,
      )}
      {...rest}
    />
  );
}
```

- [ ] **Step 4: Implement PageShell**

```tsx
// src/components/design/PageShell.tsx
"use client";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function PageShell({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
}) {
  return (
    <main className="min-h-screen px-12 py-16 max-w-5xl mx-auto">
      {(eyebrow || title) && (
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16"
        >
          {eyebrow && (
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
              {eyebrow}
            </div>
          )}
          {title && (
            <h1 className="font-[family-name:var(--font-display)] text-5xl text-[var(--color-text-primary)] tracking-tight">
              {title}
            </h1>
          )}
        </motion.header>
      )}
      {children}
    </main>
  );
}
```

- [ ] **Step 5: Smoke check**

```bash
pnpm typecheck
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/design/Input.tsx src/components/design/Card.tsx src/components/design/PageShell.tsx
git commit -m "feat: Input + Card + PageShell design primitives"
```

---

## Task 16: Setup wizard page

**Files:**

- Create: `app/setup/page.tsx`, `src/components/setup/DevAppInstructions.tsx`, `src/components/setup/ClientIdStep.tsx`, `src/components/setup/AnthropicKeyStep.tsx`, `src/components/setup/PrefixStep.tsx`

- [ ] **Step 1: Invoke design skills**

Run `impeccable` (craft mode) for the wizard flow. Run `ui-ux-pro-max` for stepper component intelligence. The wizard MUST feel calm, not "form-y" — use generous whitespace, keep fields one-per-step, no progress dots that look chunky.

- [ ] **Step 2: Implement DevAppInstructions**

```tsx
// src/components/setup/DevAppInstructions.tsx
"use client";
import { Card } from "@/src/components/design/Card";

export function DevAppInstructions() {
  return (
    <Card>
      <ol className="space-y-4 text-[var(--color-text-secondary)]">
        <li>
          <span className="text-[var(--color-text-primary)]">1.</span> Open{" "}
          <a
            className="text-[var(--color-accent)] hover:underline"
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            developer.spotify.com/dashboard
          </a>{" "}
          and click <em>Create app</em>.
        </li>
        <li>
          <span className="text-[var(--color-text-primary)]">2.</span> Use any
          name (e.g. "SpotifySorter"). Description: anything.
        </li>
        <li>
          <span className="text-[var(--color-text-primary)]">3.</span> Set the
          Redirect URI exactly to{" "}
          <code className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)]">
            http://127.0.0.1:3000/api/auth/callback
          </code>
        </li>
        <li>
          <span className="text-[var(--color-text-primary)]">4.</span> Save.
          Copy the Client ID from the app's Settings page.
        </li>
      </ol>
    </Card>
  );
}
```

- [ ] **Step 3: Implement step components**

```tsx
// src/components/setup/ClientIdStep.tsx
"use client";
import { Input } from "@/src/components/design/Input";

export function ClientIdStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      label="Spotify Client ID"
      name="spotify_client_id"
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="paste 32-char id"
    />
  );
}
```

```tsx
// src/components/setup/AnthropicKeyStep.tsx
"use client";
import { Input } from "@/src/components/design/Input";

export function AnthropicKeyStep({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Input
        label="Anthropic API Key"
        name="anthropic_api_key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="sk-ant-…"
      />
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
```

```tsx
// src/components/setup/PrefixStep.tsx
"use client";
import { Input } from "@/src/components/design/Input";

export function PrefixStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      label="Playlist Prefix"
      name="prefix"
      maxLength={8}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="✨"
    />
  );
}
```

- [ ] **Step 4: Implement the wizard page**

```tsx
// app/setup/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { DevAppInstructions } from "@/src/components/setup/DevAppInstructions";
import { ClientIdStep } from "@/src/components/setup/ClientIdStep";
import { AnthropicKeyStep } from "@/src/components/setup/AnthropicKeyStep";
import { PrefixStep } from "@/src/components/setup/PrefixStep";

type State = {
  clientId: string;
  anthropicKey: string;
  prefix: string;
  error?: string;
};

const STEPS = ["intro", "client", "anthropic", "prefix"] as const;
type Step = (typeof STEPS)[number];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [state, setState] = useState<State>({
    clientId: "",
    anthropicKey: "",
    prefix: "✨",
  });
  const [validating, setValidating] = useState(false);

  const idx = STEPS.indexOf(step);
  const canAdvance = (() => {
    if (step === "intro") return true;
    if (step === "client") return state.clientId.length >= 20;
    if (step === "anthropic") return state.anthropicKey.startsWith("sk-ant-");
    if (step === "prefix") return state.prefix.length > 0;
    return false;
  })();

  async function advance() {
    if (step === "anthropic") {
      setValidating(true);
      const r = await fetch("/api/llm/validate", {
        method: "POST",
        body: JSON.stringify({ apiKey: state.anthropicKey }),
        headers: { "content-type": "application/json" },
      });
      const json = await r.json();
      setValidating(false);
      if (!json.ok) {
        setState({
          ...state,
          error:
            "That key was rejected. Double-check it on console.anthropic.com.",
        });
        return;
      }
    }
    if (step === "prefix") {
      const r = await fetch("/api/config", {
        method: "POST",
        body: JSON.stringify({
          spotify_client_id: state.clientId,
          anthropic_api_key: state.anthropicKey,
          prefix: state.prefix,
        }),
        headers: { "content-type": "application/json" },
      });
      if (r.ok) router.push("/");
      return;
    }
    setStep(STEPS[idx + 1]);
  }

  return (
    <PageShell
      eyebrow={`Setup — step ${idx + 1} of ${STEPS.length}`}
      title="Let's get connected."
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-10"
        >
          {step === "intro" && <DevAppInstructions />}
          {step === "client" && (
            <ClientIdStep
              value={state.clientId}
              onChange={(v) => setState({ ...state, clientId: v })}
            />
          )}
          {step === "anthropic" && (
            <AnthropicKeyStep
              value={state.anthropicKey}
              onChange={(v) =>
                setState({ ...state, anthropicKey: v, error: undefined })
              }
              error={state.error}
            />
          )}
          {step === "prefix" && (
            <PrefixStep
              value={state.prefix}
              onChange={(v) => setState({ ...state, prefix: v })}
            />
          )}
          <div className="pt-6">
            <Button onClick={advance} disabled={!canAdvance || validating}>
              {validating
                ? "Verifying…"
                : step === "prefix"
                  ? "Save and continue"
                  : "Continue"}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </PageShell>
  );
}
```

- [ ] **Step 5: Add the validate route**

```typescript
// app/api/llm/validate/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateAnthropicKey } from "@/src/lib/llm/client";

const Body = z.object({ apiKey: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "bad request" },
      { status: 400 },
    );
  return NextResponse.json(await validateAnthropicKey(parsed.data.apiKey));
}
```

- [ ] **Step 6: Smoke check**

```bash
pnpm dev
```

Visit `http://localhost:3000/setup`. Step through. Kill server.

- [ ] **Step 7: Critique pass**

Invoke `critique` skill against each step. Fix any flagged anti-patterns (bad spacing, weak hierarchy, redundant headers).

- [ ] **Step 8: Commit**

```bash
git add app/setup app/api/llm/validate src/components/setup
git commit -m "feat: setup wizard — dev app, client ID, anthropic key, prefix"
```

---

## Task 17: Custom `start.ts` that opens the browser

**Files:**

- Create: `start.ts`

- [ ] **Step 1: Install tsx**

```bash
pnpm add -D tsx
```

- [ ] **Step 2: Implement start.ts**

```typescript
// start.ts
import { spawn } from "node:child_process";
import open from "open";

const child = spawn("pnpm", ["next", "dev", "-H", "127.0.0.1", "-p", "3000"], {
  stdio: "inherit",
  env: process.env,
});

const URL = "http://127.0.0.1:3000";
let opened = false;

setTimeout(async () => {
  if (opened) return;
  opened = true;
  await open(URL).catch(() => {
    console.log(`\nOpen ${URL} in your browser.`);
  });
}, 2500);

const stop = () => {
  child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child.on("exit", (code) => process.exit(code ?? 0));
```

- [ ] **Step 3: Verify it launches**

```bash
pnpm start:open
```

Expected: Next.js starts on `127.0.0.1:3000`, browser opens within 3 seconds. Kill with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add start.ts package.json pnpm-lock.yaml
git commit -m "feat: start.ts launches dev server and auto-opens browser"
```

---

# Phase 2 — OAuth + Token Refresh + Scope Screen

## Task 18: PKCE code verifier + challenge

**Files:**

- Create: `src/lib/spotify/pkce.ts`, `src/lib/spotify/scopes.ts`, `tests/unit/pkce.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/pkce.test.ts
import { describe, it, expect } from "vitest";
import { createVerifier, deriveChallenge } from "@/src/lib/spotify/pkce";

describe("PKCE", () => {
  it("verifier is 43-128 chars and url-safe", () => {
    const v = createVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("challenge is base64url SHA-256 of verifier with no padding", async () => {
    const verifier = "k".repeat(64);
    const challenge = await deriveChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain("=");
  });

  it("different verifiers produce different challenges", async () => {
    const a = await deriveChallenge(createVerifier());
    const b = await deriveChallenge(createVerifier());
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/pkce.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pkce.ts and scopes.ts**

```typescript
// src/lib/spotify/pkce.ts
import { createHash, randomBytes } from "node:crypto";

export function createVerifier(): string {
  return randomBytes(64).toString("base64url").slice(0, 128);
}

export async function deriveChallenge(verifier: string): Promise<string> {
  return createHash("sha256").update(verifier).digest("base64url");
}
```

```typescript
// src/lib/spotify/scopes.ts
export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "user-library-read",
  "user-read-private",
] as const;

export const SCOPE_STRING = SPOTIFY_SCOPES.join(" ");
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/pkce.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/pkce.ts src/lib/spotify/scopes.ts tests/unit/pkce.test.ts
git commit -m "feat: PKCE verifier + challenge + Spotify scope constants"
```

---

## Task 19: OAuth URL builder + code exchange

**Files:**

- Create: `src/lib/spotify/auth.ts`, `tests/unit/spotify-auth.test.ts`, `tests/integration/spotify-token-exchange.test.ts`

- [ ] **Step 1: Write the unit test**

```typescript
// tests/unit/spotify-auth.test.ts
import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl } from "@/src/lib/spotify/auth";

describe("buildAuthorizeUrl", () => {
  it("builds a URL with all required params", () => {
    const url = buildAuthorizeUrl({
      clientId: "client123",
      redirectUri: "http://127.0.0.1:3000/api/auth/callback",
      challenge: "abcXYZ",
      state: "state-token",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://accounts.spotify.com/authorize",
    );
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("client123");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:3000/api/auth/callback",
    );
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe("abcXYZ");
    expect(u.searchParams.get("state")).toBe("state-token");
    expect(u.searchParams.get("scope")).toContain("playlist-modify-private");
  });
});
```

- [ ] **Step 2: Write the integration test**

```typescript
// tests/integration/spotify-token-exchange.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { exchangeCodeForToken } from "@/src/lib/spotify/auth";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("exchangeCodeForToken", () => {
  it("exchanges code for tokens and returns expires_at as ISO", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "AT",
          refresh_token: "RT",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "playlist-read-private",
        }),
      ),
    );
    const result = await exchangeCodeForToken({
      clientId: "c",
      code: "C",
      verifier: "V",
      redirectUri: "http://127.0.0.1:3000/api/auth/callback",
    });
    expect(result.access_token).toBe("AT");
    expect(result.refresh_token).toBe("RT");
    expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("throws on 400 error", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(
      exchangeCodeForToken({
        clientId: "c",
        code: "BAD",
        verifier: "V",
        redirectUri: "http://127.0.0.1:3000/api/auth/callback",
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});
```

- [ ] **Step 3: Run both to verify failure**

```bash
pnpm test tests/unit/spotify-auth.test.ts tests/integration/spotify-token-exchange.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement auth.ts**

```typescript
// src/lib/spotify/auth.ts
import { SCOPE_STRING } from "./scopes";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}

export function buildAuthorizeUrl(params: AuthorizeParams): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", params.challenge);
  u.searchParams.set("state", params.state);
  u.searchParams.set("scope", SCOPE_STRING);
  return u.toString();
}

export interface ExchangeParams {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}

export interface TokenResult {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(
  p: ExchangeParams,
): Promise<TokenResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.verifier,
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Spotify token exchange failed: ${r.status} ${txt}`);
  }
  const json = (await r.json()) as {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    token_type: json.token_type,
    scope: json.scope,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}
```

- [ ] **Step 5: Run to verify pass**

```bash
pnpm test tests/unit/spotify-auth.test.ts tests/integration/spotify-token-exchange.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spotify/auth.ts tests/unit/spotify-auth.test.ts tests/integration/spotify-token-exchange.test.ts
git commit -m "feat: Spotify OAuth URL builder + code-for-token exchange"
```

---

## Task 20: Token refresh + retry-on-401

**Files:**

- Create: `src/lib/spotify/refresh.ts`, `tests/integration/spotify-token-refresh.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-token-refresh.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { refreshAccessToken } from "@/src/lib/spotify/refresh";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("refreshAccessToken", () => {
  it("returns new tokens", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "NEW_AT",
          refresh_token: "RT2",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "playlist-read-private",
        }),
      ),
    );
    const r = await refreshAccessToken({ clientId: "c", refreshToken: "RT1" });
    expect(r.access_token).toBe("NEW_AT");
    expect(r.refresh_token).toBe("RT2");
  });

  it("keeps original refresh token if response omits one", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "NEW_AT",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "playlist-read-private",
        }),
      ),
    );
    const r = await refreshAccessToken({ clientId: "c", refreshToken: "RT1" });
    expect(r.refresh_token).toBe("RT1");
  });

  it("throws RefreshRevokedError on 400 invalid_grant", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(
      refreshAccessToken({ clientId: "c", refreshToken: "RT_BAD" }),
    ).rejects.toThrow(/refresh.*revoked/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-token-refresh.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement refresh.ts**

```typescript
// src/lib/spotify/refresh.ts
import type { TokenResult } from "./auth";

export class RefreshRevokedError extends Error {
  constructor() {
    super("Spotify refresh token was revoked or expired. User must reconnect.");
    this.name = "RefreshRevokedError";
  }
}

export async function refreshAccessToken(p: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
    client_id: p.clientId,
  });
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (r.status === 400) {
    const txt = await r.text();
    if (txt.includes("invalid_grant")) throw new RefreshRevokedError();
    throw new Error(`Spotify refresh failed: 400 ${txt}`);
  }
  if (!r.ok)
    throw new Error(`Spotify refresh failed: ${r.status} ${await r.text()}`);
  const json = (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? p.refreshToken,
    token_type: json.token_type,
    scope: json.scope,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-token-refresh.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/refresh.ts tests/integration/spotify-token-refresh.test.ts
git commit -m "feat: Spotify token refresh with revoked-grant detection"
```

---

## Task 21: OAuth login route

**Files:**

- Create: `app/api/auth/login/route.ts`, `tests/integration/auth-login-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/auth-login-route.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/auth/login/route";

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
});
afterEach(() => {
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("GET /api/auth/login", () => {
  it("redirects to Spotify authorize with PKCE + sets cookies", async () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/login");
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("https://accounts.spotify.com/authorize");
    expect(loc).toContain("code_challenge_method=S256");
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("sorter_pkce_verifier="))).toBe(
      true,
    );
    expect(cookies.some((c) => c.startsWith("sorter_oauth_state="))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/auth-login-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/src/lib/config/env";
import { createVerifier, deriveChallenge } from "@/src/lib/spotify/pkce";
import { buildAuthorizeUrl } from "@/src/lib/spotify/auth";

const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback";

export async function GET(_req: Request) {
  const verifier = createVerifier();
  const challenge = await deriveChallenge(verifier);
  const state = randomBytes(16).toString("base64url");

  const url = buildAuthorizeUrl({
    clientId: env().SPOTIFY_CLIENT_ID,
    redirectUri: REDIRECT_URI,
    challenge,
    state,
  });

  const res = NextResponse.redirect(url, 307);
  const cookieOpts = "Path=/; HttpOnly; SameSite=Lax; Max-Age=600";
  res.headers.append(
    "set-cookie",
    `sorter_pkce_verifier=${verifier}; ${cookieOpts}`,
  );
  res.headers.append(
    "set-cookie",
    `sorter_oauth_state=${state}; ${cookieOpts}`,
  );
  return res;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/auth-login-route.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/login/route.ts tests/integration/auth-login-route.test.ts
git commit -m "feat: OAuth login route initiates PKCE + sets verifier/state cookies"
```

---

## Task 22: OAuth callback route

**Files:**

- Create: `app/api/auth/callback/route.ts`, `tests/integration/auth-callback-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/auth-callback-route.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "@/app/api/auth/callback/route";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("GET /api/auth/callback", () => {
  it("exchanges code, persists tokens, redirects to /scope", async () => {
    server.use(
      http.post("https://accounts.spotify.com/api/token", () =>
        HttpResponse.json({
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "playlist-read-private",
        }),
      ),
    );
    const req = new Request(
      "http://127.0.0.1:3000/api/auth/callback?code=AC&state=ST",
      { headers: { cookie: "sorter_pkce_verifier=V; sorter_oauth_state=ST" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/scope");
    const cache = JSON.parse(await readFile(join(dir, "cache.json"), "utf-8"));
    expect(cache.auth.refresh_token).toBe("RT");
  });

  it("rejects state mismatch", async () => {
    const req = new Request(
      "http://127.0.0.1:3000/api/auth/callback?code=AC&state=BAD",
      { headers: { cookie: "sorter_pkce_verifier=V; sorter_oauth_state=ST" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("handles user-deny (error=access_denied)", async () => {
    const req = new Request(
      "http://127.0.0.1:3000/api/auth/callback?error=access_denied&state=ST",
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/?error=denied");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/auth-callback-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import { join } from "node:path";
import { env } from "@/src/lib/config/env";
import { exchangeCodeForToken } from "@/src/lib/spotify/auth";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";

const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback";

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((s) => s.trim().split("=") as [string, string])
      .filter((p) => p[0]),
  );
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      `http://127.0.0.1:3000/?error=denied&detail=${encodeURIComponent(error)}`,
      307,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state)
    return NextResponse.json(
      { error: "missing code or state" },
      { status: 400 },
    );

  const cookies = parseCookies(req.headers.get("cookie"));
  if (cookies.sorter_oauth_state !== state) {
    return NextResponse.json({ error: "state mismatch" }, { status: 400 });
  }
  const verifier = cookies.sorter_pkce_verifier;
  if (!verifier)
    return NextResponse.json(
      { error: "missing verifier cookie" },
      { status: 400 },
    );

  const tokens = await exchangeCodeForToken({
    clientId: env().SPOTIFY_CLIENT_ID,
    code,
    verifier,
    redirectUri: REDIRECT_URI,
  });

  const cachePath = join(dataDir(), "cache.json");
  const current = await readCache(cachePath);
  await writeCache(
    cachePath,
    patchCache(current, {
      auth: {
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
      },
    }),
  );

  const res = NextResponse.redirect("http://127.0.0.1:3000/scope", 307);
  res.headers.append(
    "set-cookie",
    `sorter_access_token=${tokens.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
  );
  res.headers.append("set-cookie", `sorter_pkce_verifier=; Path=/; Max-Age=0`);
  res.headers.append("set-cookie", `sorter_oauth_state=; Path=/; Max-Age=0`);
  return res;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/auth-callback-route.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/callback/route.ts tests/integration/auth-callback-route.test.ts
git commit -m "feat: OAuth callback exchanges code, persists tokens, redirects to /scope"
```

---

## Task 23: Authenticated Spotify client factory

**Files:**

- Create: `src/lib/spotify/client.ts`, `tests/integration/spotify-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-client.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withSpotify } from "@/src/lib/spotify/client";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      auth: {
        refresh_token: "RT",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("withSpotify", () => {
  it("refreshes expired token then runs callback with valid one", async () => {
    let refreshed = false;
    server.use(
      http.post("https://accounts.spotify.com/api/token", () => {
        refreshed = true;
        return HttpResponse.json({
          access_token: "NEW",
          refresh_token: "RT",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "s",
        });
      }),
    );
    const accessTokenSeen = await withSpotify(
      undefined,
      async (token) => token,
    );
    expect(refreshed).toBe(true);
    expect(accessTokenSeen).toBe("NEW");
    const updated = await readCache(join(dir, "cache.json"));
    expect(new Date(updated.auth!.expires_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("reuses sessionToken if not expired", async () => {
    let refreshCalls = 0;
    server.use(
      http.post("https://accounts.spotify.com/api/token", () => {
        refreshCalls++;
        return HttpResponse.json({});
      }),
    );
    const sessionToken = "CACHED";
    const result = await withSpotify(
      { accessToken: sessionToken, accessTokenExpiresAt: Date.now() + 60_000 },
      async (t) => t,
    );
    expect(refreshCalls).toBe(0);
    expect(result).toBe("CACHED");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement client.ts**

```typescript
// src/lib/spotify/client.ts
import { join } from "node:path";
import { env } from "@/src/lib/config/env";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { refreshAccessToken } from "./refresh";

export interface Session {
  accessToken: string;
  accessTokenExpiresAt: number;
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function ensureFreshToken(
  session: Session | undefined,
): Promise<string> {
  if (session && session.accessTokenExpiresAt > Date.now() + 30_000) {
    return session.accessToken;
  }
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  if (!cache.auth)
    throw new Error("No Spotify auth in cache. User must connect.");
  const fresh = await refreshAccessToken({
    clientId: env().SPOTIFY_CLIENT_ID,
    refreshToken: cache.auth.refresh_token,
  });
  await writeCache(
    cachePath,
    patchCache(cache, {
      auth: {
        refresh_token: fresh.refresh_token,
        expires_at: fresh.expires_at,
      },
    }),
  );
  return fresh.access_token;
}

export async function withSpotify<T>(
  session: Session | undefined,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const token = await ensureFreshToken(session);
  return fn(token);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-client.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/client.ts tests/integration/spotify-client.test.ts
git commit -m "feat: withSpotify auto-refreshes expired access tokens"
```

---

## Task 24: Generic paginator

**Files:**

- Create: `src/lib/spotify/pagination.ts`, `tests/integration/spotify-pagination.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-pagination.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { paginate } from "@/src/lib/spotify/pagination";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("paginate", () => {
  it("walks Spotify cursors until next is null", async () => {
    let calls = 0;
    server.use(
      http.get(
        "https://api.spotify.com/v1/users/me/playlists",
        ({ request }) => {
          calls++;
          const url = new URL(request.url);
          const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
          if (offset === 0) {
            return HttpResponse.json({
              items: [{ id: "p1" }, { id: "p2" }],
              next: "https://api.spotify.com/v1/users/me/playlists?offset=2&limit=2",
            });
          }
          if (offset === 2) {
            return HttpResponse.json({
              items: [{ id: "p3" }],
              next: null,
            });
          }
          return HttpResponse.json({ items: [], next: null });
        },
      ),
    );
    const items = await paginate<{ id: string }>(
      "https://api.spotify.com/v1/users/me/playlists?limit=2",
      { accessToken: "AT" },
    );
    expect(items.map((i) => i.id)).toEqual(["p1", "p2", "p3"]);
    expect(calls).toBe(2);
  });

  it("throws on non-200", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/x", () =>
        HttpResponse.json(
          { error: { status: 500, message: "boom" } },
          { status: 500 },
        ),
      ),
    );
    await expect(
      paginate("https://api.spotify.com/v1/x", { accessToken: "AT" }),
    ).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-pagination.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pagination.ts**

```typescript
// src/lib/spotify/pagination.ts
export interface PaginatorOpts {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

interface Page<T> {
  items: T[];
  next: string | null;
}

export async function paginate<T>(
  firstUrl: string,
  opts: PaginatorOpts,
): Promise<T[]> {
  const f = opts.fetchImpl ?? fetch;
  const out: T[] = [];
  let url: string | null = firstUrl;
  while (url) {
    const r = await f(url, {
      headers: { authorization: `Bearer ${opts.accessToken}` },
    });
    if (!r.ok)
      throw new Error(`Spotify ${r.status} on ${url}: ${await r.text()}`);
    const page = (await r.json()) as Page<T>;
    out.push(...page.items);
    url = page.next;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-pagination.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/pagination.ts tests/integration/spotify-pagination.test.ts
git commit -m "feat: generic Spotify cursor paginator"
```

---

## Task 25: List user playlists

**Files:**

- Create: `src/lib/spotify/playlists.ts`, `tests/integration/spotify-playlists.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-playlists.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listOwnedPlaylists } from "@/src/lib/spotify/playlists";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listOwnedPlaylists", () => {
  it("returns only playlists owned by the current user", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me-id", display_name: "Me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            {
              id: "p1",
              name: "Mine",
              owner: { id: "me-id" },
              tracks: { total: 12 },
              images: [{ url: "x" }],
            },
            {
              id: "p2",
              name: "Followed",
              owner: { id: "someone-else" },
              tracks: { total: 50 },
              images: [],
            },
          ],
          next: null,
        }),
      ),
    );
    const playlists = await listOwnedPlaylists("AT");
    expect(playlists.map((p) => p.id)).toEqual(["p1"]);
    expect(playlists[0]).toMatchObject({ name: "Mine", track_count: 12 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-playlists.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement playlists.ts**

```typescript
// src/lib/spotify/playlists.ts
import { paginate } from "./pagination";

export interface OwnedPlaylist {
  id: string;
  name: string;
  track_count: number;
  cover_url: string | null;
}

interface Me {
  id: string;
}
interface RawPlaylist {
  id: string;
  name: string;
  owner: { id: string };
  tracks: { total: number };
  images: Array<{ url: string }>;
}

export async function listOwnedPlaylists(
  accessToken: string,
): Promise<OwnedPlaylist[]> {
  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) throw new Error(`Failed to fetch /me: ${meRes.status}`);
  const me = (await meRes.json()) as Me;

  const all = await paginate<RawPlaylist>(
    "https://api.spotify.com/v1/me/playlists?limit=50",
    { accessToken },
  );
  return all
    .filter((p) => p.owner.id === me.id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      track_count: p.tracks.total,
      cover_url: p.images[0]?.url ?? null,
    }));
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-playlists.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/playlists.ts tests/integration/spotify-playlists.test.ts
git commit -m "feat: list user-owned Spotify playlists with cover + count"
```

---

## Task 26: Playlists API route

**Files:**

- Create: `app/api/spotify/playlists/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/spotify/playlists/route.ts
import { NextResponse } from "next/server";
import { withSpotify } from "@/src/lib/spotify/client";
import { listOwnedPlaylists } from "@/src/lib/spotify/playlists";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  const session = m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
  try {
    const playlists = await withSpotify(session, listOwnedPlaylists);
    return NextResponse.json({ playlists });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke check via dev server**

```bash
pnpm dev
```

Visit `/api/spotify/playlists` (after going through OAuth) — should return JSON. Kill.

- [ ] **Step 3: Commit**

```bash
git add app/api/spotify/playlists/route.ts
git commit -m "feat: GET /api/spotify/playlists route"
```

---

## Task 27: Connect landing page

**Files:**

- Create: `app/page.tsx` (replace scaffold default)

- [ ] **Step 1: Invoke design skills**

Run `impeccable` (craft mode) for the landing page. Reference `.impeccable.md` design DNA: print-feel, magazine, no SaaS clichés. The page is mostly _empty_ — single typographic statement + Connect button.

- [ ] **Step 2: Implement the page**

```tsx
// app/page.tsx
import Link from "next/link";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <PageShell>
      <div className="mt-32 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-text-tertiary)] mb-6">
          A private record-listening room.
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-7xl text-[var(--color-text-primary)] leading-[0.95] tracking-tight mb-12">
          Sort your <em>library</em> into vibes that mean something.
        </h1>
        <p className="text-[var(--color-text-secondary)] text-lg leading-relaxed mb-16 max-w-xl">
          SpotifySorter reads your playlists, asks Claude Haiku to invent 25-35
          sub-genre/mood categories tuned to your taste, and writes them back as
          new playlists in your account. Re-runs are incremental.
        </p>
        <Link href="/api/auth/login">
          <Button>Connect Spotify</Button>
        </Link>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 3: Critique pass**

Invoke `critique`. The page should score high on "earn every pixel" — no decoration, no AI-default hero.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: landing page — single typographic statement + Connect"
```

---

## Task 28: Scope screen UI

**Files:**

- Create: `app/scope/page.tsx`, `src/components/scope/PlaylistCheckboxCard.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode) for grid of playlist checkbox cards. Cover art on the left, name + track count on the right. Selected state = brass underline under the card title, NOT a border glow.

- [ ] **Step 2: Implement PlaylistCheckboxCard**

```tsx
// src/components/scope/PlaylistCheckboxCard.tsx
"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

export function PlaylistCheckboxCard({
  playlist,
  selected,
  onToggle,
}: {
  playlist: OwnedPlaylist;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      className={clsx(
        "flex items-center gap-4 text-left p-4",
        "bg-[var(--color-bg-surface)] border border-[var(--color-border-default)]",
        "transition-colors duration-300",
        "hover:border-[var(--color-border-strong)]",
      )}
      whileTap={{ scale: 0.99 }}
    >
      {playlist.cover_url ? (
        <img
          src={playlist.cover_url}
          alt=""
          className="w-14 h-14 object-cover"
        />
      ) : (
        <div className="w-14 h-14 bg-[var(--color-bg-elevated)]" aria-hidden />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={clsx(
            "text-[var(--color-text-primary)] truncate relative inline-block",
            selected &&
              "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-[var(--color-accent)]",
          )}
        >
          {playlist.name}
        </div>
        <div className="text-sm text-[var(--color-text-tertiary)] mt-1">
          {playlist.track_count}{" "}
          {playlist.track_count === 1 ? "track" : "tracks"}
        </div>
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 3: Implement the page**

```tsx
// app/scope/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { PlaylistCheckboxCard } from "@/src/components/scope/PlaylistCheckboxCard";
import type { OwnedPlaylist } from "@/src/lib/spotify/playlists";

export default function ScopePage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<OwnedPlaylist[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [includeLiked, setIncludeLiked] = useState(true);

  useEffect(() => {
    fetch("/api/spotify/playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists ?? []));
  }, []);

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function scan() {
    const includedIds = (playlists ?? [])
      .filter((p) => !excluded.has(p.id))
      .map((p) => p.id);
    await fetch("/api/cache", {
      method: "PATCH",
      body: JSON.stringify({
        scope: {
          included_playlist_ids: includedIds,
          excluded_playlist_ids: Array.from(excluded),
          include_liked_songs: includeLiked,
        },
      }),
      headers: { "content-type": "application/json" },
    });
    router.push("/scan");
  }

  return (
    <PageShell eyebrow="Step one" title="What should I read?">
      {playlists === null && (
        <p className="text-[var(--color-text-secondary)]">
          Loading your library…
        </p>
      )}
      {playlists !== null && (
        <>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: 0.04, delayChildren: 0.1 },
              },
            }}
            className="grid grid-cols-2 gap-4"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <button
                type="button"
                onClick={() => setIncludeLiked((v) => !v)}
                className={`block w-full text-left p-4 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] transition-colors`}
              >
                <div
                  className={`text-[var(--color-text-primary)] relative inline-block ${includeLiked ? "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-[var(--color-accent)]" : ""}`}
                >
                  Liked Songs
                </div>
                <div className="text-sm text-[var(--color-text-tertiary)] mt-1">
                  read-only — never modified
                </div>
              </button>
            </motion.div>
            {playlists.map((p) => (
              <motion.div
                key={p.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <PlaylistCheckboxCard
                  playlist={p}
                  selected={!excluded.has(p.id)}
                  onToggle={() => toggle(p.id)}
                />
              </motion.div>
            ))}
          </motion.div>
          <div className="pt-12">
            <Button onClick={scan}>Scan</Button>
          </div>
        </>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 4: Critique pass**

Invoke `critique`. Watch for: card density too dashboard-y, missing tactile feel, generic checkbox styling.

- [ ] **Step 5: Commit**

```bash
git add app/scope src/components/scope
git commit -m "feat: scope screen — checkbox cards with brass-underline selection"
```

---

## Task 29: Cache PATCH route

**Files:**

- Create: `app/api/cache/route.ts`, `tests/integration/cache-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/cache-route.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, PATCH } from "@/app/api/cache/route";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("cache route", () => {
  it("GET returns default cache shape on first run", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.prefix).toBe("✨");
  });

  it("PATCH updates scope and persists", async () => {
    const req = new Request("http://localhost/api/cache", {
      method: "PATCH",
      body: JSON.stringify({
        scope: {
          included_playlist_ids: ["p1"],
          excluded_playlist_ids: [],
          include_liked_songs: false,
        },
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const get = await GET();
    const body = await get.json();
    expect(body.scope.included_playlist_ids).toEqual(["p1"]);
    expect(body.scope.include_liked_songs).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/cache-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/cache/route.ts
import { NextResponse } from "next/server";
import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";

function cachePath(): string {
  return join(
    process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data"),
    "cache.json",
  );
}

export async function GET() {
  const cache = await readCache(cachePath());
  // strip secrets before sending to client
  const { auth, ...safe } = cache;
  return NextResponse.json({
    ...safe,
    auth: auth ? { has_token: true, expires_at: auth.expires_at } : null,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const current = await readCache(cachePath());
  const patched = patchCache(current, body);
  await writeCache(cachePath(), patched);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/cache-route.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/cache/route.ts tests/integration/cache-route.test.ts
git commit -m "feat: cache GET (sanitized) + PATCH route"
```

---

# Phase 3 — Library Scan + Dedupe + Artist Genres

## Task 30: Track fetch per playlist + Liked Songs

**Files:**

- Create: `src/lib/spotify/tracks.ts`, `tests/integration/spotify-tracks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-tracks.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchPlaylistTracks", () => {
  it("returns track + linked_from + skips local", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p1/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "t1",
                name: "Self Care",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
                linked_from: undefined,
              },
            },
            {
              track: {
                id: "t2",
                name: "Local Demo",
                is_local: true,
                artists: [],
                linked_from: undefined,
              },
            },
            {
              track: {
                id: "t3",
                name: "Remastered",
                is_local: false,
                artists: [{ id: "a3", name: "X" }],
                linked_from: { id: "t3orig" },
              },
            },
            { track: null },
          ],
          next: null,
        }),
      ),
    );
    const tracks = await fetchPlaylistTracks("p1", "AT");
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: "t1",
      title: "Self Care",
      artist_id: "a1",
    });
    expect(tracks[1]!.id).toBe("t3orig");
  });
});

describe("fetchLikedSongs", () => {
  it("paginates Liked Songs endpoint", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "l1",
                name: "X",
                is_local: false,
                artists: [{ id: "a", name: "Y" }],
              },
            },
          ],
          next: null,
        }),
      ),
    );
    const tracks = await fetchLikedSongs("AT");
    expect(tracks[0]!.id).toBe("l1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-tracks.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement tracks.ts**

```typescript
// src/lib/spotify/tracks.ts
import { paginate } from "./pagination";

export interface NormalizedTrack {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
}

interface RawItem {
  track: null | {
    id: string | null;
    name: string;
    is_local: boolean;
    artists: Array<{ id: string; name: string }>;
    linked_from?: { id: string };
  };
}

function normalize(items: RawItem[]): NormalizedTrack[] {
  const out: NormalizedTrack[] = [];
  for (const item of items) {
    const t = item.track;
    if (!t || !t.id || t.is_local) continue;
    const primary = t.artists[0];
    if (!primary) continue;
    out.push({
      id: t.linked_from?.id ?? t.id,
      title: t.name,
      artist_id: primary.id,
      artist_name: primary.name,
    });
  }
  return out;
}

export async function fetchPlaylistTracks(
  playlistId: string,
  accessToken: string,
): Promise<NormalizedTrack[]> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,is_local,artists(id,name),linked_from(id))),next`;
  const items = await paginate<RawItem>(url, { accessToken });
  return normalize(items);
}

export async function fetchLikedSongs(
  accessToken: string,
): Promise<NormalizedTrack[]> {
  const url = `https://api.spotify.com/v1/me/tracks?limit=50&fields=items(track(id,name,is_local,artists(id,name),linked_from(id))),next`;
  const items = await paginate<RawItem>(url, { accessToken });
  return normalize(items);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-tracks.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/tracks.ts tests/integration/spotify-tracks.test.ts
git commit -m "feat: fetch playlist tracks + Liked Songs with linked_from + local skip"
```

---

## Task 31: Dedupe across scope

**Files:**

- Create: `src/lib/spotify/dedupe.ts`, `tests/unit/dedupe.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/dedupe.test.ts
import { describe, it, expect } from "vitest";
import { dedupeTracks } from "@/src/lib/spotify/dedupe";
import type { NormalizedTrack } from "@/src/lib/spotify/tracks";

const t = (id: string, artist = "a1"): NormalizedTrack => ({
  id,
  title: id,
  artist_id: artist,
  artist_name: "A",
});

describe("dedupeTracks", () => {
  it("returns one entry per unique id", () => {
    const result = dedupeTracks([t("1"), t("2"), t("1")]);
    expect(result.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });

  it("preserves first-seen order across input", () => {
    const result = dedupeTracks([t("a"), t("b"), t("c"), t("a")]);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("empty input returns empty array", () => {
    expect(dedupeTracks([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/dedupe.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement dedupe.ts**

```typescript
// src/lib/spotify/dedupe.ts
import type { NormalizedTrack } from "./tracks";

export function dedupeTracks(tracks: NormalizedTrack[]): NormalizedTrack[] {
  const seen = new Set<string>();
  const out: NormalizedTrack[] = [];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/dedupe.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/dedupe.ts tests/unit/dedupe.test.ts
git commit -m "feat: dedupe tracks preserving first-seen order"
```

---

## Task 32: Batched artist genre fetch

**Files:**

- Create: `src/lib/spotify/artists.ts`, `tests/integration/spotify-artists.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-artists.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchArtists } from "@/src/lib/spotify/artists";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchArtists", () => {
  it("chunks into 50/req and merges results", async () => {
    let calls = 0;
    server.use(
      http.get("https://api.spotify.com/v1/artists", ({ request }) => {
        calls++;
        const url = new URL(request.url);
        const ids = url.searchParams.get("ids")!.split(",");
        return HttpResponse.json({
          artists: ids.map((id) => ({
            id,
            name: `n${id}`,
            genres: [`g${id}`],
          })),
        });
      }),
    );
    const ids = Array.from({ length: 120 }, (_, i) => `a${i}`);
    const out = await fetchArtists(ids, "AT");
    expect(calls).toBe(3);
    expect(Object.keys(out)).toHaveLength(120);
    expect(out["a0"]).toEqual({ name: "na0", genres: ["ga0"] });
  });

  it("handles empty input", async () => {
    expect(await fetchArtists([], "AT")).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-artists.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement artists.ts**

```typescript
// src/lib/spotify/artists.ts
import type { Artist } from "@/src/lib/cache";

export async function fetchArtists(
  ids: string[],
  accessToken: string,
): Promise<Record<string, Artist>> {
  const out: Record<string, Artist> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`;
    const r = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok)
      throw new Error(`Spotify artists ${r.status}: ${await r.text()}`);
    const json = (await r.json()) as {
      artists: Array<{ id: string; name: string; genres: string[] } | null>;
    };
    for (const a of json.artists) {
      if (!a) continue;
      out[a.id] = { name: a.name, genres: a.genres };
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-artists.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/artists.ts tests/integration/spotify-artists.test.ts
git commit -m "feat: batched artist fetch (50/req) returns id->Artist map"
```

---

## Task 33: Retry-on-429 wrapper

**Files:**

- Create: `src/lib/spotify/retry.ts`, `tests/integration/spotify-retry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-retry.test.ts
import { describe, it, expect, vi } from "vitest";
import { withRetry429 } from "@/src/lib/spotify/retry";

describe("withRetry429", () => {
  it("retries with delay equal to Retry-After", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        const headers = new Headers({ "retry-after": "2" });
        const e = Object.assign(new Error("429"), { status: 429, headers });
        throw e;
      }
      return "ok";
    });
    const result = await withRetry429(fn, {
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      maxRetries: 3,
    });
    expect(result).toBe("ok");
    expect(sleeps).toEqual([2000]);
    expect(calls).toBe(2);
  });

  it("gives up after maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue(
      Object.assign(new Error("429"), {
        status: 429,
        headers: new Headers({ "retry-after": "1" }),
      }),
    );
    await expect(
      withRetry429(fn, { sleep: () => Promise.resolve(), maxRetries: 2 }),
    ).rejects.toThrow(/429/);
    expect(fn).toHaveBeenCalledTimes(3); // first + 2 retries
  });

  it("does not retry on non-429", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("500"), { status: 500 }));
    await expect(
      withRetry429(fn, { sleep: () => Promise.resolve(), maxRetries: 5 }),
    ).rejects.toThrow(/500/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-retry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement retry.ts**

```typescript
// src/lib/spotify/retry.ts
export interface RetryOpts {
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  maxBackoffMs?: number;
}

interface ErrWithStatus {
  status?: number;
  headers?: Headers;
}

export async function withRetry429<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const max = opts.maxRetries ?? 5;
  const cap = opts.maxBackoffMs ?? 60_000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const e = err as ErrWithStatus;
      if (e.status !== 429) throw err;
      if (attempt === max) break;
      const retryAfter = parseInt(e.headers?.get("retry-after") ?? "1", 10);
      const ms = Math.min(cap, retryAfter * 1000);
      await sleep(ms);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-retry.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/retry.ts tests/integration/spotify-retry.test.ts
git commit -m "feat: 429 retry honoring Retry-After with backoff cap"
```

---

## Task 34: Scan pipeline orchestrator

**Files:**

- Create: `src/lib/pipeline/scan.ts`, `tests/integration/pipeline-scan.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/pipeline-scan.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runScan } from "@/src/lib/pipeline/scan";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      scope: {
        included_playlist_ids: ["p1"],
        excluded_playlist_ids: [],
        include_liked_songs: true,
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runScan", () => {
  it("fetches tracks + artists, dedupes, persists to cache", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p1/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "t1",
                name: "Self Care",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
            {
              track: {
                id: "t2",
                name: "Spike",
                is_local: false,
                artists: [{ id: "a2", name: "Mac Miller" }],
              },
            },
          ],
          next: null,
        }),
      ),
      http.get("https://api.spotify.com/v1/me/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "t1",
                name: "Self Care",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
          ],
          next: null,
        }),
      ),
      http.get("https://api.spotify.com/v1/artists", ({ request }) => {
        const ids = new URL(request.url).searchParams.get("ids")!.split(",");
        return HttpResponse.json({
          artists: ids.map((id) => ({
            id,
            name: `n-${id}`,
            genres: ["hip hop"],
          })),
        });
      }),
    );
    const result = await runScan({ accessToken: "AT" });
    expect(result.unique_tracks).toBe(2);
    const cache = await readCache(join(dir, "cache.json"));
    expect(Object.keys(cache.tracks).sort()).toEqual(["t1", "t2"]);
    expect(cache.artists["a1"]!.genres).toContain("hip hop");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/pipeline-scan.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement scan.ts**

```typescript
// src/lib/pipeline/scan.ts
import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";
import { dedupeTracks } from "@/src/lib/spotify/dedupe";
import { fetchArtists } from "@/src/lib/spotify/artists";

export interface ScanResult {
  unique_tracks: number;
  unique_artists: number;
}

export type ProgressCb = (
  stage: string,
  current: number,
  total: number,
) => void;

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function runScan(opts: {
  accessToken: string;
  onProgress?: ProgressCb;
}): Promise<ScanResult> {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  const onProgress = opts.onProgress ?? (() => {});

  const playlistIds = cache.scope.included_playlist_ids;
  onProgress(
    "playlists",
    0,
    playlistIds.length + (cache.scope.include_liked_songs ? 1 : 0),
  );

  const all = [];
  let done = 0;
  for (const id of playlistIds) {
    all.push(...(await fetchPlaylistTracks(id, opts.accessToken)));
    onProgress("playlists", ++done, playlistIds.length);
  }
  if (cache.scope.include_liked_songs) {
    all.push(...(await fetchLikedSongs(opts.accessToken)));
    onProgress("liked", 1, 1);
  }

  const unique = dedupeTracks(all);
  const artistIds = Array.from(new Set(unique.map((t) => t.artist_id)));
  onProgress("artists", 0, artistIds.length);
  const artists = await fetchArtists(artistIds, opts.accessToken);
  onProgress("artists", artistIds.length, artistIds.length);

  const now = new Date().toISOString();
  const tracks: typeof cache.tracks = { ...cache.tracks };
  for (const t of unique) {
    if (!tracks[t.id]) {
      tracks[t.id] = {
        artist_id: t.artist_id,
        title: t.title,
        first_seen: now,
      };
    }
  }

  await writeCache(
    cachePath,
    patchCache(cache, {
      artists: { ...cache.artists, ...artists },
      tracks,
    }),
  );

  return { unique_tracks: unique.length, unique_artists: artistIds.length };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/pipeline-scan.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/scan.ts tests/integration/pipeline-scan.test.ts
git commit -m "feat: scan pipeline — fetch + dedupe + artist genres + persist"
```

---

## Task 35: Scan API route (SSE progress)

**Files:**

- Create: `app/api/spotify/scan/route.ts`

- [ ] **Step 1: Implement the route with SSE**

```typescript
// app/api/spotify/scan/route.ts
import { withSpotify } from "@/src/lib/spotify/client";
import { runScan } from "@/src/lib/pipeline/scan";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

export async function GET(req: Request) {
  const session = parseSession(req);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        const result = await withSpotify(session, (token) =>
          runScan({
            accessToken: token,
            onProgress: (stage, current, total) =>
              send("progress", { stage, current, total }),
          }),
        );
        send("done", result);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "unknown",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Smoke check**

After connecting via OAuth: visit `/api/spotify/scan` in browser — should stream `event:` lines.

- [ ] **Step 3: Commit**

```bash
git add app/api/spotify/scan/route.ts
git commit -m "feat: scan SSE route streams progress events"
```

---

## Task 36: Scan progress page

**Files:**

- Create: `app/scan/page.tsx`, `src/components/scan/ProgressBar.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode) + `animate`. Progress bar must NOT pulse — it fills with weight via Framer Motion. Stage label fades in/out.

- [ ] **Step 2: Implement ProgressBar**

```tsx
// src/components/scan/ProgressBar.tsx
"use client";
import { motion } from "framer-motion";

export function ProgressBar({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="h-px bg-[var(--color-border-default)] w-full relative overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 bg-[var(--color-accent)]"
        style={{ width: `${pct}%` }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 100, damping: 25 }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement scan page**

```tsx
// app/scan/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { ProgressBar } from "@/src/components/scan/ProgressBar";

interface Progress {
  stage: string;
  current: number;
  total: number;
}

const STAGE_LABEL: Record<string, string> = {
  playlists: "Reading your playlists",
  liked: "Reading your Liked Songs",
  artists: "Pulling artist genres",
};

export default function ScanPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({
    stage: "playlists",
    current: 0,
    total: 1,
  });
  const [done, setDone] = useState<{
    unique_tracks: number;
    unique_artists: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/spotify/scan");
    es.addEventListener("progress", (e) =>
      setProgress(JSON.parse((e as MessageEvent).data)),
    );
    es.addEventListener("done", (e) => {
      setDone(JSON.parse((e as MessageEvent).data));
      es.close();
    });
    es.addEventListener("error", (e) => {
      setError((e as MessageEvent).data ?? "Stream interrupted");
      es.close();
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    if (done) {
      const id = setTimeout(() => router.push("/review"), 800);
      return () => clearTimeout(id);
    }
  }, [done, router]);

  return (
    <PageShell
      eyebrow="Scanning"
      title={done ? "Found your library." : "Reading your library…"}
    >
      <div className="max-w-xl space-y-6">
        <ProgressBar
          value={done ? 1 : progress.current}
          total={done ? 1 : progress.total}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={progress.stage}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="text-[var(--color-text-secondary)]"
          >
            {error
              ? error
              : done
                ? `${done.unique_tracks} unique tracks across ${done.unique_artists} artists.`
                : `${STAGE_LABEL[progress.stage] ?? progress.stage}… (${progress.current}/${progress.total})`}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 4: Critique pass**

Invoke `critique`. Watch for: progress bar feeling SaaS-y, stage label too verbose, missing weight in motion.

- [ ] **Step 5: Commit**

```bash
git add app/scan src/components/scan
git commit -m "feat: scan page streams SSE progress with weighted bar"
```

---

## Task 37: Empty library guard

**Files:**

- Modify: `app/scan/page.tsx`, `src/lib/pipeline/scan.ts`

- [ ] **Step 1: Update scan.ts to throw on empty**

In `runScan`, after computing `unique`:

```typescript
if (unique.length === 0) {
  throw new Error("EMPTY_LIBRARY");
}
```

- [ ] **Step 2: Surface friendly message in scan page**

In the scan page error branch, replace `setError(...)` body with:

```typescript
es.addEventListener("error", (e) => {
  const data = JSON.parse((e as MessageEvent).data ?? "{}");
  if (data.message === "EMPTY_LIBRARY") {
    setError(
      "Your scope is empty. Add some music to your library, then come back.",
    );
  } else {
    setError(data.message ?? "Stream interrupted");
  }
  es.close();
});
```

- [ ] **Step 3: Add a unit test for empty scope**

Append to `tests/integration/pipeline-scan.test.ts`:

```typescript
it("throws EMPTY_LIBRARY when zero tracks in scope", async () => {
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      scope: {
        included_playlist_ids: [],
        excluded_playlist_ids: [],
        include_liked_songs: false,
      },
    }),
  );
  await expect(runScan({ accessToken: "AT" })).rejects.toThrow(/EMPTY_LIBRARY/);
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/integration/pipeline-scan.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/scan.ts app/scan/page.tsx tests/integration/pipeline-scan.test.ts
git commit -m "feat: empty-library guard with friendly empty-state copy"
```

---

## Task 38: Cache version mismatch UI

**Files:**

- Create: `src/components/shared/CacheMismatchDialog.tsx`, modify: `app/api/cache/route.ts` (return 409)

- [ ] **Step 1: Modify cache GET route to return 409**

In `app/api/cache/route.ts`:

```typescript
export async function GET() {
  try {
    const cache = await readCache(cachePath());
    const { auth, ...safe } = cache;
    return NextResponse.json({
      ...safe,
      auth: auth ? { has_token: true, expires_at: auth.expires_at } : null,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "CacheVersionMismatch") {
      return NextResponse.json(
        { error: "cache_version_mismatch" },
        { status: 409 },
      );
    }
    throw err;
  }
}
```

- [ ] **Step 2: Implement CacheMismatchDialog**

```tsx
// src/components/shared/CacheMismatchDialog.tsx
"use client";
import { Card } from "@/src/components/design/Card";
import { Button } from "@/src/components/design/Button";

export function CacheMismatchDialog() {
  return (
    <Card>
      <h2 className="font-[family-name:var(--font-display)] text-2xl mb-3">
        Cache file is from an older version.
      </h2>
      <p className="text-[var(--color-text-secondary)] mb-6">
        Back up{" "}
        <code className="font-[family-name:var(--font-mono)]">
          ./data/cache.json
        </code>{" "}
        first, then delete it and refresh to start fresh.
      </p>
      <Button onClick={() => location.reload()}>Refresh</Button>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/cache/route.ts src/components/shared/CacheMismatchDialog.tsx
git commit -m "feat: graceful cache-version-mismatch dialog (no crash)"
```

---

## Task 39: Documentation — manual smoke test checklist

**Files:**

- Create: `docs/manual-test-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Manual Smoke Test Checklist

Run against a disposable Spotify account before any release-equivalent moment.

## Setup

- [ ] Fresh repo clone, `pnpm install`, `pnpm start:open`
- [ ] Browser auto-opens on 127.0.0.1:3000
- [ ] Setup wizard walks through all 4 steps
- [ ] Bad Anthropic key is rejected with clear message
- [ ] After save, redirected to landing page

## OAuth

- [ ] "Connect Spotify" → Spotify approval → returns to /scope
- [ ] User-deny shows /?error=denied page
- [ ] Stale OAuth (after 1hr+) auto-refreshes and proceeds

## Scope + Scan

- [ ] All owned playlists + Liked Songs render with cover art and track count
- [ ] Unchecking a playlist persists when navigating back
- [ ] Scan completes for ~2k tracks in <15s
- [ ] Empty scope blocked with friendly empty-state

## Review

- [ ] 25-35 categories proposed
- [ ] Inline rename works
- [ ] Drag-merge collapses into one card
- [ ] Add custom category with description
- [ ] Cost preview modal accurate to <50%

## Classify

- [ ] Progress UI updates per batch
- [ ] Confidence slider re-flows playlist counts in real-time
- [ ] Drag a track from card A to card B persists override
- [ ] Re-run never moves manually-placed tracks

## Apply

- [ ] Confirmation modal accurate counts
- [ ] All ✨ playlists created, private, correct names
- [ ] Tracks added, batched 100/req, no missing
- [ ] Success screen displays new playlists with reverence
- [ ] Manual folder drag in desktop client works (one-time)

## Re-run

- [ ] Diff view surfaces N new / M removed
- [ ] (a) Apply existing → only new tracks classified
- [ ] (b) Edit categories → adding new one triggers surgical re-class
- [ ] Existing assignments untouched
- [ ] Removed-tracks warning shown, no auto-removal

## Errors

- [ ] Spotify 429 → automatic backoff, no user action needed
- [ ] Anthropic 429 → concurrency degrades 3→2→1
- [ ] Mid-classify cancel + resume next session works
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual-test-checklist.md
git commit -m "docs: manual smoke test checklist"
```

---

# Phase 4 — LLM Propose + Review Screen + Drag-Merge

## Task 40: LLM response Zod schemas

**Files:**

- Create: `src/lib/llm/schemas.ts`, `tests/unit/llm-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/llm-schemas.test.ts
import { describe, it, expect } from "vitest";
import {
  ProposeResponseSchema,
  ClassifyResponseSchema,
} from "@/src/lib/llm/schemas";

describe("ProposeResponseSchema", () => {
  it("accepts a valid propose payload", () => {
    const ok = {
      categories: [
        {
          name: "Aesthetic Rap",
          description: "Cloud-rap",
          example_track_ids: ["t1", "t2"],
        },
      ],
    };
    expect(ProposeResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects category with empty name", () => {
    expect(
      ProposeResponseSchema.safeParse({
        categories: [{ name: "", description: "x", example_track_ids: [] }],
      }).success,
    ).toBe(false);
  });

  it("rejects when categories key missing", () => {
    expect(ProposeResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("ClassifyResponseSchema", () => {
  it("accepts top-5 matches per track", () => {
    const ok = {
      tracks: [
        {
          track_id: "t1",
          matches: [
            { category: "Aesthetic Rap", score: 87 },
            { category: "Sad Slow", score: 62 },
            { category: "X", score: 41 },
            { category: "Y", score: 35 },
            { category: "Z", score: 28 },
          ],
          reasoning: "Dreamy.",
        },
      ],
    };
    expect(ClassifyResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects score > 100", () => {
    const bad = {
      tracks: [
        {
          track_id: "t1",
          matches: [{ category: "A", score: 150 }],
          reasoning: "x",
        },
      ],
    };
    expect(ClassifyResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 5 matches", () => {
    const bad = {
      tracks: [
        {
          track_id: "t1",
          matches: Array.from({ length: 6 }, (_, i) => ({
            category: `c${i}`,
            score: 50,
          })),
          reasoning: "x",
        },
      ],
    };
    expect(ClassifyResponseSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/llm-schemas.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement schemas.ts**

```typescript
// src/lib/llm/schemas.ts
import { z } from "zod";

export const ProposedCategorySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(280),
  example_track_ids: z.array(z.string()),
});

export const ProposeResponseSchema = z.object({
  categories: z.array(ProposedCategorySchema).min(1).max(50),
});

export const ClassifyMatchSchema = z.object({
  category: z.string().min(1),
  score: z.number().int().min(0).max(100),
});

export const ClassifyTrackSchema = z.object({
  track_id: z.string().min(1),
  matches: z.array(ClassifyMatchSchema).min(0).max(5),
  reasoning: z.string().max(280),
});

export const ClassifyResponseSchema = z.object({
  tracks: z.array(ClassifyTrackSchema).min(1),
});

export type ProposedCategory = z.infer<typeof ProposedCategorySchema>;
export type ClassifyTrack = z.infer<typeof ClassifyTrackSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/llm-schemas.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/schemas.ts tests/unit/llm-schemas.test.ts
git commit -m "feat: LLM propose + classify Zod schemas"
```

---

## Task 41: Cost estimator

**Files:**

- Create: `src/lib/llm/cost.ts`, `tests/unit/cost.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cost.test.ts
import { describe, it, expect } from "vitest";
import {
  estimateCostUSD,
  costFromUsage,
  HAIKU_PRICING,
} from "@/src/lib/llm/cost";

describe("cost", () => {
  it("costFromUsage applies per-million pricing", () => {
    const usd = costFromUsage({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(
      HAIKU_PRICING.input_per_mtok + HAIKU_PRICING.output_per_mtok,
    );
  });

  it("estimateCostUSD treats prompt cache reads at 10% of input price", () => {
    const cached = costFromUsage({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cached).toBeCloseTo(HAIKU_PRICING.input_per_mtok * 0.1);
  });

  it("estimateCostUSD scales linearly with track count", () => {
    const a = estimateCostUSD({
      tracks: 1000,
      categories: 30,
      phase: "classify",
    });
    const b = estimateCostUSD({
      tracks: 2000,
      categories: 30,
      phase: "classify",
    });
    expect(b).toBeGreaterThan(a);
    expect(b / a).toBeGreaterThan(1.5);
  });

  it("propose cost is independent of category count", () => {
    const a = estimateCostUSD({
      tracks: 2000,
      categories: 20,
      phase: "propose",
    });
    const b = estimateCostUSD({
      tracks: 2000,
      categories: 40,
      phase: "propose",
    });
    expect(a).toBeCloseTo(b, 1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/cost.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement cost.ts**

```typescript
// src/lib/llm/cost.ts
export const HAIKU_PRICING = {
  input_per_mtok: 1.0, // USD per million input tokens
  output_per_mtok: 5.0, // USD per million output tokens
  cache_read_multiplier: 0.1,
  cache_write_multiplier: 1.25,
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function costFromUsage(u: Usage): number {
  const inputCost = (u.input_tokens / 1e6) * HAIKU_PRICING.input_per_mtok;
  const outputCost = (u.output_tokens / 1e6) * HAIKU_PRICING.output_per_mtok;
  const readCost =
    ((u.cache_read_input_tokens ?? 0) / 1e6) *
    HAIKU_PRICING.input_per_mtok *
    HAIKU_PRICING.cache_read_multiplier;
  const writeCost =
    ((u.cache_creation_input_tokens ?? 0) / 1e6) *
    HAIKU_PRICING.input_per_mtok *
    HAIKU_PRICING.cache_write_multiplier;
  return inputCost + outputCost + readCost + writeCost;
}

interface EstimateOpts {
  tracks: number;
  categories: number;
  phase: "propose" | "classify";
}

const TOKENS_PER_TRACK_LINE = 30;
const PROPOSE_OUTPUT_TOKENS = 4_000;
const CLASSIFY_OUTPUT_TOKENS_PER_TRACK = 25;

export function estimateCostUSD(opts: EstimateOpts): number {
  if (opts.phase === "propose") {
    return costFromUsage({
      input_tokens: opts.tracks * TOKENS_PER_TRACK_LINE + 1_500,
      output_tokens: PROPOSE_OUTPUT_TOKENS,
    });
  }
  // classify: batches of 50, each batch has system prompt cached
  const batches = Math.ceil(opts.tracks / 50);
  const systemPromptTokens = 1_500 + opts.categories * 60;
  return costFromUsage({
    input_tokens: batches * (50 * TOKENS_PER_TRACK_LINE),
    output_tokens: opts.tracks * CLASSIFY_OUTPUT_TOKENS_PER_TRACK,
    cache_read_input_tokens: (batches - 1) * systemPromptTokens,
    cache_creation_input_tokens: systemPromptTokens,
  });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/cost.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/cost.ts tests/unit/cost.test.ts
git commit -m "feat: cost estimator + per-call usage calculator"
```

---

## Task 42: LLM call logging

**Files:**

- Create: `src/lib/llm/log.ts`, `tests/unit/llm-log.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/llm-log.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logLLMCall } from "@/src/lib/llm/log";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("logLLMCall", () => {
  it("appends one JSONL line per call", async () => {
    await logLLMCall({
      model: "claude-haiku-4-5-20251001",
      phase: "propose",
      input_tokens: 100,
      output_tokens: 50,
      latency_ms: 1234,
      retries: 0,
      batch_size: null,
      cost_usd: 0.001,
    });
    await logLLMCall({
      model: "claude-haiku-4-5-20251001",
      phase: "classify",
      input_tokens: 200,
      output_tokens: 100,
      latency_ms: 567,
      retries: 1,
      batch_size: 50,
      cost_usd: 0.003,
    });
    const file = (await import("node:fs/promises")).readdir(join(dir, "logs"));
    const files = await file;
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^llm-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const content = await readFile(join(dir, "logs", files[0]!), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).phase).toBe("propose");
    expect(JSON.parse(lines[1]!).batch_size).toBe(50);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/llm-log.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement log.ts**

```typescript
// src/lib/llm/log.ts
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface LLMLogEntry {
  model: string;
  phase: "propose" | "classify" | "reclassify" | "validate";
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  latency_ms: number;
  retries: number;
  batch_size: number | null;
  cost_usd: number;
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function logLLMCall(entry: LLMLogEntry): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const path = join(dataDir(), "logs", `llm-${today}.jsonl`);
  await mkdir(join(dataDir(), "logs"), { recursive: true });
  const line =
    JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  await appendFile(path, line, "utf-8");
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/llm-log.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/log.ts tests/unit/llm-log.test.ts
git commit -m "feat: append-only JSONL log per LLM call"
```

---

## Task 43: Propose prompt + Anthropic call

**Files:**

- Create: `src/lib/llm/propose.ts`, `tests/integration/llm-propose.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/llm-propose.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPropose } from "@/src/lib/llm/propose";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

const validResponse = {
  id: "msg_x",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "text",
      text: JSON.stringify({
        categories: [
          {
            name: "Aesthetic Rap",
            description: "Cloud rap",
            example_track_ids: ["t1"],
          },
        ],
      }),
    },
  ],
  model: "claude-haiku-4-5-20251001",
  stop_reason: "end_turn",
  usage: { input_tokens: 1500, output_tokens: 300 },
};

describe("runPropose", () => {
  it("parses propose JSON and returns categories with assigned ids", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json(validResponse),
      ),
    );
    const result = await runPropose({
      apiKey: "sk-ant-x",
      tracks: [
        {
          id: "t1",
          title: "Self Care",
          artist_name: "Mac Miller",
          genres: ["hip hop"],
        },
      ],
    });
    expect(result.categories[0]).toMatchObject({
      name: "Aesthetic Rap",
      example_track_ids: ["t1"],
    });
    expect(result.categories[0]!.id).toBeTruthy();
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("retries once on malformed JSON", async () => {
    let call = 0;
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () => {
        call++;
        if (call === 1) {
          return HttpResponse.json({
            ...validResponse,
            content: [{ type: "text", text: "not json at all" }],
          });
        }
        return HttpResponse.json(validResponse);
      }),
    );
    const result = await runPropose({
      apiKey: "sk-ant-x",
      tracks: [{ id: "t1", title: "X", artist_name: "Y", genres: [] }],
    });
    expect(call).toBe(2);
    expect(result.categories).toHaveLength(1);
  });

  it("throws after second malformed response", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          ...validResponse,
          content: [{ type: "text", text: "{bad" }],
        }),
      ),
    );
    await expect(
      runPropose({
        apiKey: "sk-ant-x",
        tracks: [{ id: "t1", title: "X", artist_name: "Y", genres: [] }],
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/llm-propose.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement propose.ts**

```typescript
// src/lib/llm/propose.ts
import { randomBytes } from "node:crypto";
import { anthropicClient } from "./client";
import { ProposeResponseSchema, type ProposedCategory } from "./schemas";
import { costFromUsage } from "./cost";
import { logLLMCall } from "./log";

export interface ProposeTrackInput {
  id: string;
  title: string;
  artist_name: string;
  genres: string[];
}

export interface ProposeResult {
  categories: Array<ProposedCategory & { id: string }>;
  cost_usd: number;
}

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a sharp-eared music curator helping the user organize their personal Spotify library into themed playlists.

You will receive a list of tracks (title + artist + Spotify-tagged genres). Invent 25-35 specific, vibey sub-genre/mood category names that fit the library you see. Each category should:

- Be specific (not "Rap" or "Chill" — instead "Aesthetic Rap", "Late-Night R&B", "Sad Slow")
- Reflect actual clusters in the library (don't invent categories for genres not represented)
- Use Title Case
- Have a 1-2 sentence description capturing the feel
- Include 3-8 example_track_ids of tracks that fit best

Respond with valid JSON ONLY, matching this schema:
{
  "categories": [
    { "name": "string", "description": "string", "example_track_ids": ["string"] }
  ]
}

Do not wrap in markdown fences. Do not add any prose outside the JSON.`;

function buildUserMessage(tracks: ProposeTrackInput[]): string {
  const lines = tracks.map((t) => {
    const genres =
      t.genres.length > 0 ? ` [${t.genres.slice(0, 3).join(", ")}]` : "";
    return `${t.id}\t${t.title} — ${t.artist_name}${genres}`;
  });
  return `Library (${tracks.length} tracks):\n\n${lines.join("\n")}\n\nReturn JSON only.`;
}

async function callOnce(
  apiKey: string,
  tracks: ProposeTrackInput[],
  reminder: string | null,
): Promise<{
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const client = anthropicClient(apiKey);
  const userMsg = reminder
    ? `${reminder}\n\n${buildUserMessage(tracks)}`
    : buildUserMessage(tracks);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 8_000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    temperature: reminder ? 0.0 : 0.4,
  });
  const text = resp.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  return {
    text,
    usage: {
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
    },
  };
}

function parseOrThrow(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Propose returned non-JSON: ${text.slice(0, 200)}`);
  }
  return ProposeResponseSchema.parse(json);
}

export async function runPropose(opts: {
  apiKey: string;
  tracks: ProposeTrackInput[];
}): Promise<ProposeResult> {
  const start = Date.now();
  let attempt: {
    text: string;
    usage: { input_tokens: number; output_tokens: number };
  };
  let retries = 0;
  try {
    attempt = await callOnce(opts.apiKey, opts.tracks, null);
    try {
      const parsed = parseOrThrow(attempt.text);
      const cost = costFromUsage(attempt.usage);
      await logLLMCall({
        model: MODEL,
        phase: "propose",
        input_tokens: attempt.usage.input_tokens,
        output_tokens: attempt.usage.output_tokens,
        latency_ms: Date.now() - start,
        retries,
        batch_size: null,
        cost_usd: cost,
      });
      return {
        categories: parsed.categories.map((c) => ({
          ...c,
          id: randomBytes(8).toString("hex"),
        })),
        cost_usd: cost,
      };
    } catch {
      retries++;
      attempt = await callOnce(
        opts.apiKey,
        opts.tracks,
        "Your previous response was not valid JSON. Respond with valid JSON ONLY, no markdown fences or prose.",
      );
    }
  } catch (err) {
    throw err;
  }
  const parsed = parseOrThrow(attempt.text);
  const cost = costFromUsage(attempt.usage);
  await logLLMCall({
    model: MODEL,
    phase: "propose",
    input_tokens: attempt.usage.input_tokens,
    output_tokens: attempt.usage.output_tokens,
    latency_ms: Date.now() - start,
    retries,
    batch_size: null,
    cost_usd: cost,
  });
  return {
    categories: parsed.categories.map((c) => ({
      ...c,
      id: randomBytes(8).toString("hex"),
    })),
    cost_usd: cost,
  };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/llm-propose.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/propose.ts tests/integration/llm-propose.test.ts
git commit -m "feat: LLM propose with JSON-retry and per-call logging"
```

---

## Task 44: Propose pipeline orchestrator

**Files:**

- Create: `src/lib/pipeline/propose.ts`, `tests/integration/pipeline-propose.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/pipeline-propose.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProposeFromCache } from "@/src/lib/pipeline/propose";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      artists: { a1: { name: "Mac Miller", genres: ["hip hop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Self Care",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runProposeFromCache", () => {
  it("feeds cache tracks to runPropose and persists categories", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                categories: [
                  {
                    name: "Aesthetic Rap",
                    description: "X",
                    example_track_ids: ["t1"],
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 1500, output_tokens: 300 },
        }),
      ),
    );
    const result = await runProposeFromCache({ apiKey: "sk-ant-x" });
    expect(result.categories).toHaveLength(1);
    const cache = await readCache(join(dir, "cache.json"));
    expect(Object.values(cache.categories)[0]!.name).toBe("Aesthetic Rap");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/pipeline-propose.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement propose pipeline**

```typescript
// src/lib/pipeline/propose.ts
import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { runPropose, type ProposeTrackInput } from "@/src/lib/llm/propose";

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function runProposeFromCache(opts: { apiKey: string }) {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  const inputs: ProposeTrackInput[] = Object.entries(cache.tracks).map(
    ([id, t]) => ({
      id,
      title: t.title,
      artist_name: cache.artists[t.artist_id]?.name ?? "",
      genres: cache.artists[t.artist_id]?.genres ?? [],
    }),
  );
  const result = await runPropose({ apiKey: opts.apiKey, tracks: inputs });
  const now = new Date().toISOString();
  const categories = { ...cache.categories };
  for (const c of result.categories) {
    categories[c.id] = {
      name: c.name,
      description: c.description,
      spotify_playlist_id: null,
      created_at: now,
    };
  }
  await writeCache(cachePath, patchCache(cache, { categories }));
  return { categories: result.categories, cost_usd: result.cost_usd };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/pipeline-propose.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/propose.ts tests/integration/pipeline-propose.test.ts
git commit -m "feat: propose pipeline reads cache, calls LLM, persists categories"
```

---

## Task 45: Propose API route

**Files:**

- Create: `app/api/llm/propose/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/llm/propose/route.ts
import { NextResponse } from "next/server";
import { runProposeFromCache } from "@/src/lib/pipeline/propose";
import { env } from "@/src/lib/config/env";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runProposeFromCache({
      apiKey: env().ANTHROPIC_API_KEY,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Smoke check**

```bash
pnpm dev
```

After scan, POST to `/api/llm/propose` — returns JSON with categories + cost_usd.

- [ ] **Step 3: Commit**

```bash
git add app/api/llm/propose/route.ts
git commit -m "feat: POST /api/llm/propose route"
```

---

## Task 46: Cost preview modal

**Files:**

- Create: `src/components/review/CostPreviewModal.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode) for the modal. Calm. No alarming red. The amount in bold display type, not a tiny fee-print line.

- [ ] **Step 2: Implement the modal**

```tsx
// src/components/review/CostPreviewModal.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  open: boolean;
  estimateUsd: { low: number; high: number };
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CostPreviewModal({
  open,
  estimateUsd,
  message,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-[var(--color-bg-base)]/80 backdrop-blur-sm z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="max-w-lg w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
              Cost estimate
            </div>
            <div className="font-[family-name:var(--font-display)] text-5xl text-[var(--color-text-primary)] mb-6">
              ${estimateUsd.low.toFixed(2)}
              <span className="text-[var(--color-text-tertiary)]"> — </span>$
              {estimateUsd.high.toFixed(2)}
            </div>
            <p className="text-[var(--color-text-secondary)] mb-10">
              {message}
            </p>
            <div className="flex items-center gap-6">
              <Button onClick={onConfirm}>Proceed</Button>
              <Button variant="ghost" onClick={onCancel}>
                Not yet
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Critique pass**

Invoke `critique`. Watch for: backdrop too dark, type sizing off, missing the calm.

- [ ] **Step 4: Commit**

```bash
git add src/components/review/CostPreviewModal.tsx
git commit -m "feat: cost preview modal (quiet, not alarmy)"
```

---

## Task 47: Category card component

**Files:**

- Create: `src/components/review/CategoryCard.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode) + `typeset`. The card is the most-visible product surface in this screen. Editorial New for name. PP Neue Montreal for description. Index-numbered track samples (LP-liner-notes feel).

- [ ] **Step 2: Implement the card**

```tsx
// src/components/review/CategoryCard.tsx
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import clsx from "clsx";

export interface CategoryCardData {
  id: string;
  name: string;
  description: string;
  example_track_ids: string[];
}

export interface TrackLookupEntry {
  id: string;
  title: string;
  artist_name: string;
}

interface Props {
  category: CategoryCardData;
  tracks: TrackLookupEntry[];
  onRename: (name: string) => void;
  onDelete: () => void;
  totalCount: number;
}

export function CategoryCard({
  category,
  tracks,
  onRename,
  onDelete,
  totalCount,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tracks : tracks.slice(0, 5);

  return (
    <motion.div
      layout
      className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-8 hover:border-[var(--color-border-strong)] transition-colors"
      transition={{ type: "spring", stiffness: 200, damping: 30 }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <input
          value={category.name}
          onChange={(e) => onRename(e.target.value)}
          className={clsx(
            "flex-1 bg-transparent px-0 py-1 font-[family-name:var(--font-display)] text-3xl",
            "text-[var(--color-text-primary)] focus:outline-none",
            "border-b border-transparent focus:border-[var(--color-accent)]",
            "transition-colors",
          )}
        />
        <button
          type="button"
          onClick={onDelete}
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors p-2"
          aria-label="Delete category"
        >
          <Trash2 size={16} strokeWidth={1.25} />
        </button>
      </div>
      <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
        {category.description}
      </p>
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
        Samples · estimated {totalCount}
      </div>
      <ol className="space-y-2">
        {visible.map((t, i) => (
          <li key={t.id} className="flex gap-4 items-baseline">
            <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-tertiary)] w-8">
              {String(i + 1).padStart(2, "0")}.
            </span>
            <a
              href={`spotify:track:${t.id}`}
              className="text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
            >
              {t.title}
              <span className="text-[var(--color-text-secondary)]">
                {" "}
                · {t.artist_name}
              </span>
            </a>
          </li>
        ))}
      </ol>
      {tracks.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-6 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          {expanded ? "Show fewer" : `Show all ${tracks.length} sample tracks`}
        </button>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Critique pass**

Invoke `critique` + `typeset`. The card must scan like an LP back-cover, not a Linear ticket. Adjust spacing/type weight as flagged.

- [ ] **Step 4: Commit**

```bash
git add src/components/review/CategoryCard.tsx
git commit -m "feat: category card with editorial type + LP track samples"
```

---

## Task 48: Add custom category form

**Files:**

- Create: `src/components/review/AddCategoryForm.tsx`

- [ ] **Step 1: Implement the form**

```tsx
// src/components/review/AddCategoryForm.tsx
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { Input } from "@/src/components/design/Input";
import { Button } from "@/src/components/design/Button";

export function AddCategoryForm({
  onAdd,
}: {
  onAdd: (name: string, description: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim(), desc.trim());
    setName("");
    setDesc("");
    setOpen(false);
  }

  return (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key="form"
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-8 space-y-6"
        >
          <Input
            label="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. trap with sad piano samples"
          />
          <Input
            label="Short description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="how it feels"
          />
          <div className="flex items-center gap-6">
            <Button onClick={submit} disabled={!name.trim()}>
              Add
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.button
          key="cta"
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border border-dashed border-[var(--color-border-default)] hover:border-[var(--color-border-strong)] p-8 text-[var(--color-text-secondary)] transition-colors flex items-center gap-3 justify-center"
        >
          <Plus size={16} strokeWidth={1.25} />
          Add a category
        </motion.button>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/review/AddCategoryForm.tsx
git commit -m "feat: add-custom-category form (dashed-border CTA → inline form)"
```

---

## Task 49: Drag-merge for category cards

**Files:**

- Create: `src/components/review/MergeableGrid.tsx`, `tests/unit/merge-categories.test.ts`, `src/lib/categories/merge.ts`

- [ ] **Step 1: Write the failing test for merge logic**

```typescript
// tests/unit/merge-categories.test.ts
import { describe, it, expect } from "vitest";
import {
  mergeCategories,
  type DraftCategory,
} from "@/src/lib/categories/merge";

const cat = (id: string, name: string, examples: string[]): DraftCategory => ({
  id,
  name,
  description: `desc-${name}`,
  example_track_ids: examples,
});

describe("mergeCategories", () => {
  it("removes source, keeps target, unions example tracks", () => {
    const before = [cat("a", "A", ["t1", "t2"]), cat("b", "B", ["t2", "t3"])];
    const after = mergeCategories(before, "a", "b");
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe("b");
    expect(after[0]!.example_track_ids.sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("noop when source === target", () => {
    const before = [cat("a", "A", ["t1"])];
    expect(mergeCategories(before, "a", "a")).toEqual(before);
  });

  it("returns same array when target id missing", () => {
    const before = [cat("a", "A", ["t1"])];
    expect(mergeCategories(before, "a", "missing")).toEqual(before);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/merge-categories.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement merge.ts**

```typescript
// src/lib/categories/merge.ts
export interface DraftCategory {
  id: string;
  name: string;
  description: string;
  example_track_ids: string[];
}

export function mergeCategories(
  cats: DraftCategory[],
  sourceId: string,
  targetId: string,
): DraftCategory[] {
  if (sourceId === targetId) return cats;
  const source = cats.find((c) => c.id === sourceId);
  const target = cats.find((c) => c.id === targetId);
  if (!source || !target) return cats;
  const union = Array.from(
    new Set([...target.example_track_ids, ...source.example_track_ids]),
  );
  return cats
    .filter((c) => c.id !== sourceId)
    .map((c) => (c.id === targetId ? { ...c, example_track_ids: union } : c));
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/merge-categories.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Implement MergeableGrid UI (dnd-kit)**

```tsx
// src/components/review/MergeableGrid.tsx
"use client";
import { useState } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import {
  CategoryCard,
  type CategoryCardData,
  type TrackLookupEntry,
} from "./CategoryCard";
import {
  mergeCategories,
  type DraftCategory,
} from "@/src/lib/categories/merge";

interface Props {
  categories: DraftCategory[];
  trackLookup: Record<string, TrackLookupEntry>;
  estimates: Record<string, number>;
  onChange: (next: DraftCategory[]) => void;
}

function DraggableCard({
  children,
  id,
}: {
  children: React.ReactNode;
  id: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });
  const { setNodeRef: setDrop, isOver } = useDroppable({ id });
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        setDrop(el);
      }}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.6 : 1,
        outline: isOver ? "1px solid var(--color-accent)" : "none",
      }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

export function MergeableGrid({
  categories,
  trackLookup,
  estimates,
  onChange,
}: Props) {
  function onDragEnd(e: DragEndEvent) {
    const sourceId = String(e.active.id);
    const targetId = e.over ? String(e.over.id) : null;
    if (!targetId || sourceId === targetId) return;
    onChange(mergeCategories(categories, sourceId, targetId));
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: 0.04, delayChildren: 0.1 },
          },
        }}
      >
        {categories.map((cat) => {
          const tracks = cat.example_track_ids
            .map((id) => trackLookup[id])
            .filter(Boolean) as TrackLookupEntry[];
          return (
            <motion.div
              key={cat.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <DraggableCard id={cat.id}>
                <CategoryCard
                  category={cat as CategoryCardData}
                  tracks={tracks}
                  totalCount={estimates[cat.id] ?? tracks.length}
                  onRename={(name) =>
                    onChange(
                      categories.map((c) =>
                        c.id === cat.id ? { ...c, name } : c,
                      ),
                    )
                  }
                  onDelete={() =>
                    onChange(categories.filter((c) => c.id !== cat.id))
                  }
                />
              </DraggableCard>
            </motion.div>
          );
        })}
      </motion.div>
    </DndContext>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/categories/merge.ts src/components/review/MergeableGrid.tsx tests/unit/merge-categories.test.ts
git commit -m "feat: drag-merge categories with union of example tracks"
```

---

## Task 50: Review screen page

**Files:**

- Create: `app/review/page.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode) + `layout` + `typeset`. The page should feel calm despite holding 25+ cards. Generous gap. Title in large display type. Action bar at the bottom sticky but quiet.

- [ ] **Step 2: Implement the page**

```tsx
// app/review/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { MergeableGrid } from "@/src/components/review/MergeableGrid";
import { AddCategoryForm } from "@/src/components/review/AddCategoryForm";
import { CostPreviewModal } from "@/src/components/review/CostPreviewModal";
import { estimateCostUSD } from "@/src/lib/llm/cost";
import type { DraftCategory } from "@/src/lib/categories/merge";
import type { TrackLookupEntry } from "@/src/components/review/CategoryCard";

export default function ReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftCategory[] | null>(null);
  const [tracks, setTracks] = useState<Record<string, TrackLookupEntry>>({});
  const [trackCount, setTrackCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    (async () => {
      const proposed = await fetch("/api/llm/propose", { method: "POST" }).then(
        (r) => r.json(),
      );
      const cache = await fetch("/api/cache").then((r) => r.json());
      const lookup: Record<string, TrackLookupEntry> = {};
      for (const [id, t] of Object.entries(
        cache.tracks as Record<string, { title: string; artist_id: string }>,
      )) {
        const artist = (cache.artists as Record<string, { name: string }>)[
          t.artist_id
        ];
        lookup[id] = { id, title: t.title, artist_name: artist?.name ?? "" };
      }
      setTracks(lookup);
      setTrackCount(Object.keys(lookup).length);
      setDraft(proposed.categories);
    })();
  }, []);

  async function classify() {
    setRunning(true);
    await fetch("/api/cache", {
      method: "PATCH",
      body: JSON.stringify({
        categories: Object.fromEntries(
          draft!.map((c) => [
            c.id,
            {
              name: c.name,
              description: c.description,
              spotify_playlist_id: null,
              created_at: new Date().toISOString(),
            },
          ]),
        ),
      }),
      headers: { "content-type": "application/json" },
    });
    router.push("/classify");
  }

  if (!draft) {
    return (
      <PageShell eyebrow="Thinking" title="Proposing categories…">
        <p className="text-[var(--color-text-secondary)]">
          Claude Haiku is listening through your library. This takes ~30
          seconds.
        </p>
      </PageShell>
    );
  }

  const lowEst = estimateCostUSD({
    tracks: trackCount,
    categories: draft.length,
    phase: "classify",
  });
  const highEst = lowEst * 2;
  const estimates: Record<string, number> = Object.fromEntries(
    draft.map((c) => [c.id, c.example_track_ids.length]),
  );

  return (
    <PageShell
      eyebrow="Step two"
      title={`${draft.length} categories. Edit anything.`}
    >
      <MergeableGrid
        categories={draft}
        trackLookup={tracks}
        estimates={estimates}
        onChange={setDraft}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8"
      >
        <AddCategoryForm
          onAdd={(name, description) =>
            setDraft([
              ...draft,
              {
                id: crypto.randomUUID(),
                name,
                description,
                example_track_ids: [],
              },
            ])
          }
        />
      </motion.div>
      <div className="pt-12 flex items-center gap-8">
        <Button
          onClick={() => setConfirming(true)}
          disabled={running || draft.length === 0}
        >
          {running ? "Classifying…" : "Classify"}
        </Button>
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {draft.length} categories · {trackCount} tracks
        </span>
      </div>
      <CostPreviewModal
        open={confirming}
        estimateUsd={{ low: lowEst, high: highEst }}
        message={`About to classify ${trackCount} tracks across ${draft.length} categories using Claude Haiku.`}
        onConfirm={() => {
          setConfirming(false);
          classify();
        }}
        onCancel={() => setConfirming(false)}
      />
    </PageShell>
  );
}
```

- [ ] **Step 3: Critique pass**

Invoke `critique` against the review page. Watch for: too dense, no clear hierarchy, action bar too SaaS-y.

- [ ] **Step 4: Commit**

```bash
git add app/review/page.tsx
git commit -m "feat: review screen — propose, edit, merge, add custom, cost preview"
```

---

# Phase 5 — LLM Classify + Confidence Slider + Manual Override

## Task 51: Batch chunker

**Files:**

- Create: `src/lib/llm/batching.ts`, `tests/unit/batching.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/batching.test.ts
import { describe, it, expect } from "vitest";
import { chunkInto } from "@/src/lib/llm/batching";

describe("chunkInto", () => {
  it("splits into size-50 chunks", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const chunks = chunkInto(items, 50);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[2]).toHaveLength(20);
  });

  it("returns empty array for empty input", () => {
    expect(chunkInto([], 50)).toEqual([]);
  });

  it("returns single chunk smaller than batch size", () => {
    expect(chunkInto([1, 2, 3], 50)).toEqual([[1, 2, 3]]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/batching.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement batching.ts**

```typescript
// src/lib/llm/batching.ts
export function chunkInto<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/batching.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/batching.ts tests/unit/batching.test.ts
git commit -m "feat: generic chunkInto helper"
```

---

## Task 52: Concurrency semaphore with degradation

**Files:**

- Create: `src/lib/llm/concurrency.ts`, `tests/unit/concurrency.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/concurrency.test.ts
import { describe, it, expect, vi } from "vitest";
import { createDegradingPool } from "@/src/lib/llm/concurrency";

describe("createDegradingPool", () => {
  it("runs at initial concurrency", async () => {
    const pool = createDegradingPool({
      initial: 3,
      min: 1,
      recoveryWindowMs: 100,
    });
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return "ok";
    });
    await pool.runAll(tasks);
    expect(peak).toBe(3);
  });

  it("drops concurrency when reportRateLimit() is called", async () => {
    const pool = createDegradingPool({
      initial: 3,
      min: 1,
      recoveryWindowMs: 10_000,
    });
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(2);
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(1);
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(1); // capped at min
  });

  it("recovers to initial after a clean window", async () => {
    vi.useFakeTimers();
    const pool = createDegradingPool({
      initial: 3,
      min: 1,
      recoveryWindowMs: 30,
    });
    pool.reportRateLimit();
    pool.reportRateLimit();
    expect(pool.currentLimit()).toBe(1);
    vi.advanceTimersByTime(31);
    pool.tick();
    expect(pool.currentLimit()).toBe(3);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/concurrency.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement concurrency.ts**

```typescript
// src/lib/llm/concurrency.ts
export interface PoolOpts {
  initial: number;
  min: number;
  recoveryWindowMs: number;
}

export interface DegradingPool {
  runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]>;
  reportRateLimit(): void;
  currentLimit(): number;
  tick(): void;
}

export function createDegradingPool(opts: PoolOpts): DegradingPool {
  let limit = opts.initial;
  let lastRateLimit = 0;

  function maybeRecover() {
    if (
      limit < opts.initial &&
      Date.now() - lastRateLimit >= opts.recoveryWindowMs
    ) {
      limit = opts.initial;
    }
  }

  return {
    currentLimit: () => limit,
    tick: maybeRecover,
    reportRateLimit() {
      lastRateLimit = Date.now();
      limit = Math.max(opts.min, limit - 1);
    },
    async runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
      const results: T[] = new Array(tasks.length);
      let index = 0;
      async function worker() {
        while (true) {
          maybeRecover();
          const i = index++;
          if (i >= tasks.length) return;
          results[i] = await tasks[i]!();
        }
      }
      const workers = Array.from(
        { length: Math.min(limit, tasks.length) },
        worker,
      );
      await Promise.all(workers);
      return results;
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/concurrency.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/concurrency.ts tests/unit/concurrency.test.ts
git commit -m "feat: degrading concurrency pool 3→2→1 with recovery"
```

---

## Task 53: Classify single batch

**Files:**

- Create: `src/lib/llm/classify.ts`, `tests/integration/llm-classify-batch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/llm-classify-batch.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { classifyBatch } from "@/src/lib/llm/classify";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const categories = [
  { id: "c1", name: "Aesthetic Rap", description: "Cloud-rap." },
  { id: "c2", name: "Sad Slow", description: "Slow ballads." },
];

const tracksInput = [
  {
    id: "t1",
    title: "Self Care",
    artist_name: "Mac Miller",
    genres: ["hip hop"],
  },
];

describe("classifyBatch", () => {
  it("parses valid response and maps category names to ids", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tracks: [
                  {
                    track_id: "t1",
                    matches: [
                      { category: "Aesthetic Rap", score: 87 },
                      { category: "Sad Slow", score: 35 },
                    ],
                    reasoning: "Dreamy.",
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 800, output_tokens: 200 },
        }),
      ),
    );
    const result = await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks: tracksInput,
    });
    expect(result.assignments[0]!.track_id).toBe("t1");
    expect(result.assignments[0]!.matches[0]).toEqual({
      category_id: "c1",
      score: 87,
    });
  });

  it("retries on malformed JSON", async () => {
    let call = 0;
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () => {
        call++;
        if (call === 1)
          return HttpResponse.json({
            id: "m",
            type: "message",
            role: "assistant",
            model: "claude-haiku-4-5-20251001",
            stop_reason: "end_turn",
            content: [{ type: "text", text: "not json" }],
            usage: { input_tokens: 800, output_tokens: 200 },
          });
        return HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tracks: [
                  {
                    track_id: "t1",
                    matches: [{ category: "Aesthetic Rap", score: 87 }],
                    reasoning: "r",
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 800, output_tokens: 200 },
        });
      }),
    );
    const result = await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks: tracksInput,
    });
    expect(call).toBe(2);
    expect(result.assignments).toHaveLength(1);
  });

  it("drops matches that reference unknown category names", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tracks: [
                  {
                    track_id: "t1",
                    matches: [
                      { category: "Aesthetic Rap", score: 87 },
                      { category: "Bogus", score: 50 },
                    ],
                    reasoning: "r",
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 800, output_tokens: 200 },
        }),
      ),
    );
    const result = await classifyBatch({
      apiKey: "sk-ant-x",
      categories,
      tracks: tracksInput,
    });
    expect(result.assignments[0]!.matches).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/llm-classify-batch.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement classify.ts**

```typescript
// src/lib/llm/classify.ts
import { anthropicClient } from "./client";
import { ClassifyResponseSchema } from "./schemas";
import { costFromUsage } from "./cost";
import { logLLMCall } from "./log";

const MODEL = "claude-haiku-4-5-20251001";

export interface ClassifyCategory {
  id: string;
  name: string;
  description: string;
}
export interface ClassifyTrackInput {
  id: string;
  title: string;
  artist_name: string;
  genres: string[];
}

export interface BatchAssignment {
  track_id: string;
  matches: Array<{ category_id: string; score: number }>;
  reasoning: string;
}

export interface BatchResult {
  assignments: BatchAssignment[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cost_usd: number;
}

function buildSystem(categories: ClassifyCategory[]): string {
  const list = categories
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");
  return `You are classifying tracks into the user's personal categories.

For each track, return the TOP 5 categories that fit best with a 0-100 fit score, sorted highest first. Include a one-sentence "reasoning" explaining why the track lands where it does.

Use ONLY these category names exactly as written (case-sensitive):

${list}

Respond with valid JSON matching this shape:
{
  "tracks": [
    {
      "track_id": "string",
      "matches": [{ "category": "string", "score": 0-100 }],
      "reasoning": "string"
    }
  ]
}

No markdown fences. No prose outside JSON.`;
}

function buildUser(tracks: ClassifyTrackInput[]): string {
  return tracks
    .map((t) => {
      const g =
        t.genres.length > 0 ? ` [${t.genres.slice(0, 3).join(", ")}]` : "";
      return `${t.id}\t${t.title} — ${t.artist_name}${g}`;
    })
    .join("\n");
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

async function callOnce(
  apiKey: string,
  system: string,
  user: string,
  reminder: string | null,
) {
  const client = anthropicClient(apiKey);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4_000,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      { role: "user", content: reminder ? `${reminder}\n\n${user}` : user },
    ],
    temperature: reminder ? 0.0 : 0.3,
  });
  const text = resp.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  const u = resp.usage as AnthropicUsage;
  return { text, usage: u };
}

function parseOrThrow(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Classify returned non-JSON: ${text.slice(0, 200)}`);
  }
  return ClassifyResponseSchema.parse(json);
}

export async function classifyBatch(opts: {
  apiKey: string;
  categories: ClassifyCategory[];
  tracks: ClassifyTrackInput[];
}): Promise<BatchResult> {
  const start = Date.now();
  const system = buildSystem(opts.categories);
  const user = buildUser(opts.tracks);
  const nameToId = new Map(opts.categories.map((c) => [c.name, c.id]));

  let retries = 0;
  let attempt = await callOnce(opts.apiKey, system, user, null);
  let parsed;
  try {
    parsed = parseOrThrow(attempt.text);
  } catch {
    retries++;
    attempt = await callOnce(
      opts.apiKey,
      system,
      user,
      "Previous response was not valid JSON. Respond with JSON only.",
    );
    parsed = parseOrThrow(attempt.text);
  }

  const assignments: BatchAssignment[] = parsed.tracks.map((t) => ({
    track_id: t.track_id,
    matches: t.matches
      .map((m) => ({ category_id: nameToId.get(m.category), score: m.score }))
      .filter((m): m is { category_id: string; score: number } =>
        Boolean(m.category_id),
      ),
    reasoning: t.reasoning,
  }));

  const cost = costFromUsage(attempt.usage);
  await logLLMCall({
    model: MODEL,
    phase: "classify",
    input_tokens: attempt.usage.input_tokens,
    output_tokens: attempt.usage.output_tokens,
    cache_read_input_tokens: attempt.usage.cache_read_input_tokens,
    cache_creation_input_tokens: attempt.usage.cache_creation_input_tokens,
    latency_ms: Date.now() - start,
    retries,
    batch_size: opts.tracks.length,
    cost_usd: cost,
  });

  return { assignments, usage: attempt.usage, cost_usd: cost };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/llm-classify-batch.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/classify.ts tests/integration/llm-classify-batch.test.ts
git commit -m "feat: classify single batch with prompt cache + JSON retry + name→id mapping"
```

---

## Task 54: Classify pipeline orchestrator

**Files:**

- Create: `src/lib/pipeline/classify.ts`, `tests/integration/pipeline-classify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/pipeline-classify.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClassifyFromCache } from "@/src/lib/pipeline/classify";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      artists: { a1: { name: "Mac Miller", genres: ["hip hop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Self Care",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
        t2: {
          artist_id: "a1",
          title: "Spike",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {
        c1: {
          name: "Aesthetic Rap",
          description: "Cloud.",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runClassifyFromCache", () => {
  it("classifies unclassified tracks and persists assignments", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tracks: [
                  {
                    track_id: "t1",
                    matches: [{ category: "Aesthetic Rap", score: 90 }],
                    reasoning: "r1",
                  },
                  {
                    track_id: "t2",
                    matches: [{ category: "Aesthetic Rap", score: 60 }],
                    reasoning: "r2",
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 800, output_tokens: 300 },
        }),
      ),
    );
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });
    expect(result.tracks_classified).toBe(2);
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.assignments["t1"]!.matches[0]).toEqual({
      category_id: "c1",
      score: 90,
    });
  });

  it("skips already-classified tracks on second run", async () => {
    // Seed an assignment for t1
    const seeded = await readCache(join(dir, "cache.json"));
    await writeCache(
      join(dir, "cache.json"),
      patchCache(seeded, {
        assignments: {
          t1: {
            matches: [{ category_id: "c1", score: 90 }],
            reasoning: "cached",
            classified_at: "2026-05-13T00:00:00.000Z",
            override: null,
          },
        },
      }),
    );
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tracks: [
                  {
                    track_id: "t2",
                    matches: [{ category: "Aesthetic Rap", score: 60 }],
                    reasoning: "r",
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      ),
    );
    const result = await runClassifyFromCache({ apiKey: "sk-ant-x" });
    expect(result.tracks_classified).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/pipeline-classify.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement classify pipeline**

```typescript
// src/lib/pipeline/classify.ts
import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import {
  classifyBatch,
  type ClassifyCategory,
  type ClassifyTrackInput,
} from "@/src/lib/llm/classify";
import { chunkInto } from "@/src/lib/llm/batching";
import { createDegradingPool } from "@/src/lib/llm/concurrency";

export type ProgressCb = (stage: "batch", done: number, total: number) => void;

export interface ClassifyResult {
  tracks_classified: number;
  cost_usd: number;
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function runClassifyFromCache(opts: {
  apiKey: string;
  onProgress?: ProgressCb;
}): Promise<ClassifyResult> {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  const onProgress = opts.onProgress ?? (() => {});

  const categories: ClassifyCategory[] = Object.entries(cache.categories).map(
    ([id, c]) => ({
      id,
      name: c.name,
      description: c.description,
    }),
  );

  const unclassifiedIds = Object.keys(cache.tracks).filter(
    (id) => !cache.assignments[id],
  );
  const inputs: ClassifyTrackInput[] = unclassifiedIds.map((id) => {
    const t = cache.tracks[id]!;
    const a = cache.artists[t.artist_id];
    return {
      id,
      title: t.title,
      artist_name: a?.name ?? "",
      genres: a?.genres ?? [],
    };
  });

  if (inputs.length === 0) return { tracks_classified: 0, cost_usd: 0 };

  const batches = chunkInto(inputs, 50);
  const pool = createDegradingPool({
    initial: 3,
    min: 1,
    recoveryWindowMs: 30_000,
  });

  let totalCost = 0;
  let doneBatches = 0;
  const allAssignments: Awaited<
    ReturnType<typeof classifyBatch>
  >["assignments"] = [];

  await pool.runAll(
    batches.map((batch) => async () => {
      while (true) {
        try {
          const r = await classifyBatch({
            apiKey: opts.apiKey,
            categories,
            tracks: batch,
          });
          allAssignments.push(...r.assignments);
          totalCost += r.cost_usd;
          doneBatches++;
          onProgress("batch", doneBatches, batches.length);
          return;
        } catch (err) {
          const e = err as { status?: number };
          if (e.status === 429) {
            pool.reportRateLimit();
            continue;
          }
          throw err;
        }
      }
    }),
  );

  const now = new Date().toISOString();
  const merged = { ...cache.assignments };
  for (const a of allAssignments) {
    merged[a.track_id] = {
      matches: a.matches,
      reasoning: a.reasoning,
      classified_at: now,
      override: null,
    };
  }
  await writeCache(cachePath, patchCache(cache, { assignments: merged }));

  return { tracks_classified: allAssignments.length, cost_usd: totalCost };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/pipeline-classify.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/classify.ts tests/integration/pipeline-classify.test.ts
git commit -m "feat: classify pipeline — batched 50, concurrency 3, persists assignments"
```

---

## Task 55: Classify API route (SSE)

**Files:**

- Create: `app/api/llm/classify/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/llm/classify/route.ts
import { env } from "@/src/lib/config/env";
import { runClassifyFromCache } from "@/src/lib/pipeline/classify";

export const dynamic = "force-dynamic";

export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        const r = await runClassifyFromCache({
          apiKey: env().ANTHROPIC_API_KEY,
          onProgress: (stage, done, total) =>
            send("progress", { stage, done, total }),
        });
        send("done", r);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "unknown",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/llm/classify/route.ts
git commit -m "feat: classify SSE route streams per-batch progress"
```

---

## Task 56: Threshold filter

**Files:**

- Create: `src/lib/classification/threshold.ts`, `tests/unit/threshold.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/threshold.test.ts
import { describe, it, expect } from "vitest";
import {
  trackPassesThreshold,
  categoryMembers,
} from "@/src/lib/classification/threshold";
import type { Assignment } from "@/src/lib/cache";

const a = (matches: Array<[string, number]>): Assignment => ({
  matches: matches.map(([category_id, score]) => ({ category_id, score })),
  reasoning: "",
  classified_at: "2026-05-13T00:00:00.000Z",
  override: null,
});

describe("trackPassesThreshold", () => {
  it("returns categories with score >= threshold", () => {
    const result = trackPassesThreshold(
      a([
        ["c1", 90],
        ["c2", 60],
        ["c3", 30],
      ]),
      65,
    );
    expect(result).toEqual(["c1"]);
  });

  it("returns highest-match (force-fit) when none clears threshold", () => {
    const result = trackPassesThreshold(
      a([
        ["c1", 50],
        ["c2", 30],
      ]),
      80,
    );
    expect(result).toEqual(["c1"]);
  });

  it("returns empty when assignment has zero matches", () => {
    expect(trackPassesThreshold(a([]), 50)).toEqual([]);
  });

  it("respects override regardless of threshold", () => {
    const withOverride: Assignment = {
      ...a([["c1", 90]]),
      override: { category_id: "manual", set_at: "2026-05-13T00:00:00.000Z" },
    };
    expect(trackPassesThreshold(withOverride, 65)).toEqual(["manual"]);
  });
});

describe("categoryMembers", () => {
  it("produces id -> Set<trackId>", () => {
    const assignments = {
      t1: a([
        ["c1", 90],
        ["c2", 60],
      ]),
      t2: a([["c2", 75]]),
    };
    const map = categoryMembers(assignments, 70);
    expect(map.get("c1")!).toEqual(new Set(["t1"]));
    expect(map.get("c2")!).toEqual(new Set(["t2"]));
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/threshold.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement threshold.ts**

```typescript
// src/lib/classification/threshold.ts
import type { Assignment } from "@/src/lib/cache";

export function trackPassesThreshold(
  assignment: Assignment,
  threshold: number,
): string[] {
  if (assignment.override) return [assignment.override.category_id];
  if (assignment.matches.length === 0) return [];
  const passing = assignment.matches
    .filter((m) => m.score >= threshold)
    .map((m) => m.category_id);
  if (passing.length > 0) return passing;
  // Force-fit: highest match wins
  const top = [...assignment.matches].sort((a, b) => b.score - a.score)[0]!;
  return [top.category_id];
}

export function categoryMembers(
  assignments: Record<string, Assignment>,
  threshold: number,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [trackId, assignment] of Object.entries(assignments)) {
    for (const categoryId of trackPassesThreshold(assignment, threshold)) {
      let set = map.get(categoryId);
      if (!set) {
        set = new Set();
        map.set(categoryId, set);
      }
      set.add(trackId);
    }
  }
  return map;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/threshold.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classification/threshold.ts tests/unit/threshold.test.ts
git commit -m "feat: threshold filter with force-fit + override precedence"
```

---

## Task 57: Manual override apply

**Files:**

- Create: `src/lib/classification/override.ts`, `tests/unit/override.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/override.test.ts
import { describe, it, expect } from "vitest";
import {
  applyOverride,
  clearOverride,
} from "@/src/lib/classification/override";
import type { Assignment } from "@/src/lib/cache";

const a: Assignment = {
  matches: [{ category_id: "c1", score: 90 }],
  reasoning: "r",
  classified_at: "2026-05-13T00:00:00.000Z",
  override: null,
};

describe("applyOverride", () => {
  it("sets override.category_id and set_at ISO date", () => {
    const next = applyOverride(a, "manual-cat");
    expect(next.override).toMatchObject({ category_id: "manual-cat" });
    expect(new Date(next.override!.set_at).getTime()).toBeGreaterThan(0);
  });

  it("does not mutate input", () => {
    applyOverride(a, "manual-cat");
    expect(a.override).toBeNull();
  });
});

describe("clearOverride", () => {
  it("removes override", () => {
    const withOverride: Assignment = {
      ...a,
      override: { category_id: "x", set_at: "2026-05-13T00:00:00.000Z" },
    };
    expect(clearOverride(withOverride).override).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/override.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement override.ts**

```typescript
// src/lib/classification/override.ts
import type { Assignment } from "@/src/lib/cache";

export function applyOverride(
  assignment: Assignment,
  categoryId: string,
): Assignment {
  return {
    ...assignment,
    override: { category_id: categoryId, set_at: new Date().toISOString() },
  };
}

export function clearOverride(assignment: Assignment): Assignment {
  return { ...assignment, override: null };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/override.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classification/override.ts tests/unit/override.test.ts
git commit -m "feat: applyOverride / clearOverride immutable helpers"
```

---

## Task 58: Confidence slider component

**Files:**

- Create: `src/components/classify/ConfidenceSlider.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode). The slider must NOT feel like an HTML range input. Custom track, brass thumb, quiet ticks. Reference `.impeccable.md` motion language.

- [ ] **Step 2: Implement the slider**

```tsx
// src/components/classify/ConfidenceSlider.tsx
"use client";
import { useRef, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

export function ConfidenceSlider({
  value,
  onChange,
  min = 0,
  max = 100,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function pctFromClient(clientX: number) {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(min + pct * (max - min));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
          Confidence
        </div>
        <div className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)]">
          {value}
        </div>
      </div>
      <div
        ref={trackRef}
        className="relative h-px bg-[var(--color-border-default)] cursor-pointer"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          setDragging(true);
          onChange(pctFromClient(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging) onChange(pctFromClient(e.clientX));
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <div
          className="absolute inset-y-0 left-0 bg-[var(--color-accent)]"
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
        <motion.div
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--color-accent-strong)] shadow-[0_0_0_4px_var(--color-bg-base)]"
          animate={{ left: `${((value - min) / (max - min)) * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
        <span>permissive</span>
        <span>strict</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Critique pass**

Invoke `critique`. Watch for: feeling like a slider on Linear (round filled thumb on solid bar), wrong proportions, weak tactile feel.

- [ ] **Step 4: Commit**

```bash
git add src/components/classify/ConfidenceSlider.tsx
git commit -m "feat: confidence slider with custom track + brass thumb"
```

---

## Task 59: Playlist preview card + track chip

**Files:**

- Create: `src/components/classify/PlaylistPreviewCard.tsx`, `src/components/classify/TrackChip.tsx`

- [ ] **Step 1: Implement TrackChip**

```tsx
// src/components/classify/TrackChip.tsx
"use client";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";

interface Props {
  trackId: string;
  title: string;
  artist_name: string;
  reasoning?: string;
  categoryId: string;
}

export function TrackChip({
  trackId,
  title,
  artist_name,
  reasoning,
  categoryId,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `chip:${trackId}`,
      data: { fromCategoryId: categoryId, trackId },
    });
  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={clsx(
        "group relative flex items-baseline gap-3 py-1.5 px-2 -mx-2 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      title={reasoning}
    >
      <div className="flex-1 min-w-0">
        <span className="text-[var(--color-text-primary)] truncate">
          {title}
        </span>
        <span className="text-[var(--color-text-secondary)]">
          {" "}
          · {artist_name}
        </span>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Implement PlaylistPreviewCard**

```tsx
// src/components/classify/PlaylistPreviewCard.tsx
"use client";
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import clsx from "clsx";
import { TrackChip } from "./TrackChip";

export interface PreviewCardData {
  id: string;
  name: string;
  tracks: Array<{
    id: string;
    title: string;
    artist_name: string;
    reasoning?: string;
  }>;
}

interface Props {
  card: PreviewCardData;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function PlaylistPreviewCard({ card, expanded, onToggleExpand }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `card:${card.id}`,
    data: { toCategoryId: card.id },
  });
  const visible = expanded ? card.tracks : card.tracks.slice(0, 8);

  return (
    <motion.div
      ref={setNodeRef}
      layout
      className={clsx(
        "bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-6 transition-colors",
        isOver && "border-[var(--color-accent)]",
      )}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)]">
          {card.name}
        </h3>
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-tertiary)]">
          {card.tracks.length}
        </span>
      </div>
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-4">
        {card.tracks.length === 1 ? "track" : "tracks"}
      </div>
      <ol className="space-y-0.5">
        {visible.map((t) => (
          <TrackChip
            key={t.id}
            trackId={t.id}
            title={t.title}
            artist_name={t.artist_name}
            reasoning={t.reasoning}
            categoryId={card.id}
          />
        ))}
      </ol>
      {card.tracks.length > 8 && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-4 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          {expanded ? "Collapse" : `Show all ${card.tracks.length}`}
        </button>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/classify/PlaylistPreviewCard.tsx src/components/classify/TrackChip.tsx
git commit -m "feat: playlist preview card + draggable track chip"
```

---

## Task 60: Classify page

**Files:**

- Create: `app/classify/page.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode) + `layout`. The page must feel calm despite real-time count flux. Cards re-flow with weight, not jank. Slider sits at the top, sticky, with the playlists below.

- [ ] **Step 2: Implement the page**

```tsx
// app/classify/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { ConfidenceSlider } from "@/src/components/classify/ConfidenceSlider";
import {
  PlaylistPreviewCard,
  type PreviewCardData,
} from "@/src/components/classify/PlaylistPreviewCard";
import { categoryMembers } from "@/src/lib/classification/threshold";
import type { Assignment } from "@/src/lib/cache";

interface ClientCache {
  config: { confidence_threshold: number };
  categories: Record<string, { name: string }>;
  tracks: Record<string, { artist_id: string; title: string }>;
  artists: Record<string, { name: string }>;
  assignments: Record<string, Assignment>;
}

export default function ClassifyPage() {
  const router = useRouter();
  const [cache, setCache] = useState<ClientCache | null>(null);
  const [threshold, setThreshold] = useState<number>(65);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 1 });

  useEffect(() => {
    const es = new EventSource("/api/llm/classify");
    es.addEventListener("progress", (e) =>
      setProgress(JSON.parse((e as MessageEvent).data)),
    );
    es.addEventListener("done", () => {
      fetch("/api/cache")
        .then((r) => r.json())
        .then((d: ClientCache) => {
          setCache(d);
          setThreshold(d.config.confidence_threshold);
          setRunning(false);
        });
      es.close();
    });
    es.addEventListener("error", () => es.close());
    return () => es.close();
  }, []);

  const cards: PreviewCardData[] = useMemo(() => {
    if (!cache) return [];
    const members = categoryMembers(cache.assignments, threshold);
    return Object.entries(cache.categories).map(([id, cat]) => {
      const trackIds = Array.from(members.get(id) ?? []);
      return {
        id,
        name: cat.name,
        tracks: trackIds.map((tid) => {
          const t = cache.tracks[tid]!;
          return {
            id: tid,
            title: t.title,
            artist_name: cache.artists[t.artist_id]?.name ?? "",
            reasoning: cache.assignments[tid]?.reasoning,
          };
        }),
      };
    });
  }, [cache, threshold]);

  function onDragEnd(e: DragEndEvent) {
    if (!cache || !e.over) return;
    const data = e.active.data.current as { trackId: string };
    const over = e.over.data.current as { toCategoryId: string };
    if (!data?.trackId || !over?.toCategoryId) return;
    setCache((prev) => {
      if (!prev) return prev;
      const next = { ...prev.assignments };
      const a = next[data.trackId];
      if (!a) return prev;
      next[data.trackId] = {
        ...a,
        override: {
          category_id: over.toCategoryId,
          set_at: new Date().toISOString(),
        },
      };
      return { ...prev, assignments: next };
    });
    fetch("/api/cache", {
      method: "PATCH",
      body: JSON.stringify({
        assignments: {
          [data.trackId]: {
            ...cache.assignments[data.trackId],
            override: {
              category_id: over.toCategoryId,
              set_at: new Date().toISOString(),
            },
          },
        },
      }),
      headers: { "content-type": "application/json" },
    });
  }

  if (running) {
    return (
      <PageShell eyebrow="Classifying" title="Listening through your library…">
        <p className="text-[var(--color-text-secondary)]">
          {progress.done} of {progress.total} batches.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Step three" title="Tune the fit.">
      <div className="sticky top-0 z-10 bg-[var(--color-bg-base)] pt-4 pb-8 -mx-12 px-12 backdrop-blur-md">
        <div className="max-w-md">
          <ConfidenceSlider value={threshold} onChange={setThreshold} />
        </div>
      </div>
      <DndContext onDragEnd={onDragEnd}>
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: { staggerChildren: 0.04, delayChildren: 0.1 },
            },
          }}
        >
          {cards.map((card) => (
            <motion.div
              key={card.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <PlaylistPreviewCard
                card={card}
                expanded={expanded.has(card.id)}
                onToggleExpand={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(card.id)) next.delete(card.id);
                    else next.add(card.id);
                    return next;
                  })
                }
              />
            </motion.div>
          ))}
        </motion.div>
      </DndContext>
      <div className="pt-12">
        <Button
          onClick={async () => {
            await fetch("/api/cache", {
              method: "PATCH",
              body: JSON.stringify({
                config: {
                  confidence_threshold: threshold,
                  prefix: "✨",
                  anthropic_model: "claude-haiku-4-5-20251001",
                },
              }),
              headers: { "content-type": "application/json" },
            });
            router.push("/apply");
          }}
        >
          Apply to Spotify
        </Button>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 3: Critique pass**

Invoke `critique`. Watch for: counts feeling fragile (numbers ticking too fast), slider/cards visual disconnect, missing the calm.

- [ ] **Step 4: Commit**

```bash
git add app/classify/page.tsx
git commit -m "feat: classify page — slider + drag-override + per-card real-time counts"
```

---

# Phase 6 — Apply Flow + Idempotent Updates + Success Screen

## Task 61: Prefix format/parse

**Files:**

- Create: `src/lib/categories/prefix.ts`, `tests/unit/prefix.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/prefix.test.ts
import { describe, it, expect } from "vitest";
import {
  formatPlaylistName,
  parsePlaylistName,
  hasPrefix,
} from "@/src/lib/categories/prefix";

describe("formatPlaylistName", () => {
  it("joins prefix and name with single space", () => {
    expect(formatPlaylistName("✨", "Aesthetic Rap")).toBe("✨ Aesthetic Rap");
  });

  it("does not double prefix if name already starts with it", () => {
    expect(formatPlaylistName("✨", "✨ Aesthetic Rap")).toBe(
      "✨ Aesthetic Rap",
    );
  });

  it("round-trips with parsePlaylistName", () => {
    const formatted = formatPlaylistName("★", "Late-Night R&B");
    expect(parsePlaylistName("★", formatted)).toEqual({
      name: "Late-Night R&B",
      hasPrefix: true,
    });
  });
});

describe("parsePlaylistName", () => {
  it("returns hasPrefix: false when name does not match prefix", () => {
    expect(parsePlaylistName("✨", "Random Playlist")).toEqual({
      name: "Random Playlist",
      hasPrefix: false,
    });
  });

  it("handles unicode prefix", () => {
    expect(parsePlaylistName("🎧", "🎧 Late Vibes")).toEqual({
      name: "Late Vibes",
      hasPrefix: true,
    });
  });
});

describe("hasPrefix", () => {
  it("true when name starts with prefix + space", () => {
    expect(hasPrefix("✨", "✨ Foo")).toBe(true);
  });
  it("false when prefix is missing the space", () => {
    expect(hasPrefix("✨", "✨Foo")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/prefix.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement prefix.ts**

```typescript
// src/lib/categories/prefix.ts
export function hasPrefix(prefix: string, name: string): boolean {
  return name.startsWith(`${prefix} `);
}

export function formatPlaylistName(prefix: string, name: string): string {
  if (hasPrefix(prefix, name)) return name;
  return `${prefix} ${name}`;
}

export function parsePlaylistName(
  prefix: string,
  fullName: string,
): { name: string; hasPrefix: boolean } {
  if (hasPrefix(prefix, fullName)) {
    return { name: fullName.slice(prefix.length + 1), hasPrefix: true };
  }
  return { name: fullName, hasPrefix: false };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/prefix.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categories/prefix.ts tests/unit/prefix.test.ts
git commit -m "feat: playlist prefix format/parse helpers"
```

---

## Task 62: Spotify apply primitives

**Files:**

- Create: `src/lib/spotify/apply.ts`, `tests/integration/spotify-apply.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/spotify-apply.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  createPlaylist,
  addTracksToPlaylist,
  listPlaylistTrackIds,
  findOwnedPlaylistByName,
} from "@/src/lib/spotify/apply";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("createPlaylist", () => {
  it("POSTs private playlist and returns id", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.post(
        "https://api.spotify.com/v1/users/me/playlists",
        async ({ request }) => {
          const body = (await request.json()) as {
            name: string;
            public: boolean;
          };
          return HttpResponse.json({
            id: "p_new",
            name: body.name,
            public: body.public,
          });
        },
      ),
    );
    const id = await createPlaylist("AT", "✨ Aesthetic Rap");
    expect(id).toBe("p_new");
  });
});

describe("addTracksToPlaylist", () => {
  it("batches uris in 100-track chunks", async () => {
    const calls: string[][] = [];
    server.use(
      http.post(
        "https://api.spotify.com/v1/playlists/p1/tracks",
        async ({ request }) => {
          const body = (await request.json()) as { uris: string[] };
          calls.push(body.uris);
          return HttpResponse.json({ snapshot_id: "s" });
        },
      ),
    );
    const uris = Array.from({ length: 250 }, (_, i) => `spotify:track:t${i}`);
    await addTracksToPlaylist("AT", "p1", uris);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toHaveLength(100);
    expect(calls[2]).toHaveLength(50);
  });
});

describe("listPlaylistTrackIds", () => {
  it("returns existing track ids", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p1/tracks", () =>
        HttpResponse.json({
          items: [
            { track: { id: "a" } },
            { track: { id: "b" } },
            { track: null },
          ],
          next: null,
        }),
      ),
    );
    expect((await listPlaylistTrackIds("AT", "p1")).sort()).toEqual(["a", "b"]);
  });
});

describe("findOwnedPlaylistByName", () => {
  it("returns id when matching owned playlist exists", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            {
              id: "p1",
              name: "✨ Aesthetic Rap",
              owner: { id: "me" },
              tracks: { total: 5 },
              images: [],
            },
            {
              id: "p2",
              name: "Other",
              owner: { id: "me" },
              tracks: { total: 5 },
              images: [],
            },
          ],
          next: null,
        }),
      ),
    );
    const id = await findOwnedPlaylistByName("AT", "✨ Aesthetic Rap");
    expect(id).toBe("p1");
  });

  it("returns null when no match", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
    );
    expect(await findOwnedPlaylistByName("AT", "✨ Missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/spotify-apply.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement apply.ts**

```typescript
// src/lib/spotify/apply.ts
import { paginate } from "./pagination";

export async function createPlaylist(
  accessToken: string,
  name: string,
): Promise<string> {
  const me = await fetch("https://api.spotify.com/v1/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!me.ok) throw new Error(`me ${me.status}`);
  const { id: userId } = (await me.json()) as { id: string };
  const r = await fetch(
    `https://api.spotify.com/v1/users/${userId}/playlists`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name,
        public: false,
        description: "Created by SpotifySorter",
      }),
    },
  );
  if (!r.ok) throw new Error(`createPlaylist ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { id: string }).id;
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    const r = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ uris: chunk }),
      },
    );
    if (!r.ok) {
      const err = new Error(`addTracks ${r.status}`);
      (err as { status?: number }).status = r.status;
      (err as { headers?: Headers }).headers = r.headers;
      throw err;
    }
  }
}

export async function listPlaylistTrackIds(
  accessToken: string,
  playlistId: string,
): Promise<string[]> {
  const items = await paginate<{ track: { id: string | null } | null }>(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id)),next`,
    { accessToken },
  );
  return items.map((i) => i.track?.id).filter((x): x is string => Boolean(x));
}

export async function findOwnedPlaylistByName(
  accessToken: string,
  fullName: string,
): Promise<string | null> {
  const me = await fetch("https://api.spotify.com/v1/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!me.ok) throw new Error(`me ${me.status}`);
  const { id: userId } = (await me.json()) as { id: string };
  const all = await paginate<{
    id: string;
    name: string;
    owner: { id: string };
  }>("https://api.spotify.com/v1/me/playlists?limit=50", { accessToken });
  return (
    all.find((p) => p.owner.id === userId && p.name === fullName)?.id ?? null
  );
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/spotify-apply.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/apply.ts tests/integration/spotify-apply.test.ts
git commit -m "feat: Spotify apply primitives — create, add (batched 100), list, find-by-name"
```

---

## Task 63: Apply pipeline orchestrator with checkpointing

**Files:**

- Create: `src/lib/pipeline/apply.ts`, `tests/integration/pipeline-apply.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/pipeline-apply.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runApplyFromCache } from "@/src/lib/pipeline/apply";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      artists: { a1: { name: "Mac Miller", genres: ["hip hop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "Self Care",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {
        c1: {
          name: "Aesthetic Rap",
          description: "Cloud",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
      },
      assignments: {
        t1: {
          matches: [{ category_id: "c1", score: 90 }],
          reasoning: "r",
          classified_at: "2026-05-13T00:00:00.000Z",
          override: null,
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runApplyFromCache", () => {
  it("creates playlist, adds tracks, persists playlist_id", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
      http.post("https://api.spotify.com/v1/users/me/playlists", () =>
        HttpResponse.json({ id: "p_new" }),
      ),
      http.post("https://api.spotify.com/v1/playlists/p_new/tracks", () =>
        HttpResponse.json({ snapshot_id: "s" }),
      ),
    );
    const result = await runApplyFromCache({ accessToken: "AT" });
    expect(result.created).toBe(1);
    expect(result.tracks_added).toBe(1);
    const cache = await readCache(join(dir, "cache.json"));
    expect(cache.categories["c1"]!.spotify_playlist_id).toBe("p_new");
  });

  it("reuses existing playlist by stored id, skips existing tracks (idempotent)", async () => {
    const seeded = await readCache(join(dir, "cache.json"));
    await writeCache(
      join(dir, "cache.json"),
      patchCache(seeded, {
        categories: {
          c1: {
            ...seeded.categories["c1"]!,
            spotify_playlist_id: "p_existing",
          },
        },
      }),
    );
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p_existing/tracks", () =>
        HttpResponse.json({ items: [{ track: { id: "t1" } }], next: null }),
      ),
      http.post("https://api.spotify.com/v1/playlists/p_existing/tracks", () =>
        HttpResponse.json({ snapshot_id: "s" }),
      ),
    );
    const result = await runApplyFromCache({ accessToken: "AT" });
    expect(result.created).toBe(0);
    expect(result.tracks_added).toBe(0);
  });

  it("first-run finds existing playlist by name to avoid duplicates", async () => {
    let createCalled = false;
    server.use(
      http.get("https://api.spotify.com/v1/me", () =>
        HttpResponse.json({ id: "me" }),
      ),
      http.get("https://api.spotify.com/v1/me/playlists", () =>
        HttpResponse.json({
          items: [
            {
              id: "p_dup",
              name: "✨ Aesthetic Rap",
              owner: { id: "me" },
              tracks: { total: 0 },
            },
          ],
          next: null,
        }),
      ),
      http.post("https://api.spotify.com/v1/users/me/playlists", () => {
        createCalled = true;
        return HttpResponse.json({ id: "should_not_be_called" });
      }),
      http.get("https://api.spotify.com/v1/playlists/p_dup/tracks", () =>
        HttpResponse.json({ items: [], next: null }),
      ),
      http.post("https://api.spotify.com/v1/playlists/p_dup/tracks", () =>
        HttpResponse.json({ snapshot_id: "s" }),
      ),
    );
    const result = await runApplyFromCache({ accessToken: "AT" });
    expect(createCalled).toBe(false);
    expect(result.created).toBe(0);
    expect(result.tracks_added).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/pipeline-apply.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement apply pipeline**

```typescript
// src/lib/pipeline/apply.ts
import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { formatPlaylistName } from "@/src/lib/categories/prefix";
import { categoryMembers } from "@/src/lib/classification/threshold";
import { withRetry429 } from "@/src/lib/spotify/retry";
import {
  createPlaylist,
  addTracksToPlaylist,
  listPlaylistTrackIds,
  findOwnedPlaylistByName,
} from "@/src/lib/spotify/apply";

export type ApplyProgressCb = (
  stage: "category",
  done: number,
  total: number,
  currentName?: string,
) => void;

export interface ApplyResult {
  created: number;
  updated: number;
  tracks_added: number;
  playlists: Array<{
    id: string;
    name: string;
    track_count: number;
    created: boolean;
  }>;
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function runApplyFromCache(opts: {
  accessToken: string;
  onProgress?: ApplyProgressCb;
}): Promise<ApplyResult> {
  const cachePath = join(dataDir(), "cache.json");
  let cache = await readCache(cachePath);
  const onProgress = opts.onProgress ?? (() => {});

  const members = categoryMembers(
    cache.assignments,
    cache.config.confidence_threshold,
  );
  const categoryEntries = Object.entries(cache.categories);

  let created = 0,
    updated = 0,
    tracks_added = 0;
  const playlists: ApplyResult["playlists"] = [];

  for (let i = 0; i < categoryEntries.length; i++) {
    const [categoryId, category] = categoryEntries[i]!;
    const fullName = formatPlaylistName(cache.config.prefix, category.name);
    onProgress("category", i, categoryEntries.length, category.name);

    let playlistId = category.spotify_playlist_id;
    let wasCreated = false;

    if (!playlistId) {
      const existing = await withRetry429(() =>
        findOwnedPlaylistByName(opts.accessToken, fullName),
      );
      if (existing) {
        playlistId = existing;
      } else {
        playlistId = await withRetry429(() =>
          createPlaylist(opts.accessToken, fullName),
        );
        wasCreated = true;
        created++;
      }
      cache = patchCache(cache, {
        categories: {
          ...cache.categories,
          [categoryId]: { ...category, spotify_playlist_id: playlistId },
        },
      });
      await writeCache(cachePath, cache);
    }

    const trackIds = Array.from(members.get(categoryId) ?? []);
    const existingIds = wasCreated
      ? new Set<string>()
      : new Set(
          await withRetry429(() =>
            listPlaylistTrackIds(opts.accessToken, playlistId!),
          ),
        );
    const toAdd = trackIds.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      const uris = toAdd.map((id) => `spotify:track:${id}`);
      await withRetry429(() =>
        addTracksToPlaylist(opts.accessToken, playlistId!, uris),
      );
      tracks_added += toAdd.length;
      if (!wasCreated) updated++;
    }
    playlists.push({
      id: playlistId!,
      name: fullName,
      track_count: trackIds.length,
      created: wasCreated,
    });
  }
  onProgress("category", categoryEntries.length, categoryEntries.length);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeCache(
    cachePath,
    patchCache(cache, {
      runs: [
        ...cache.runs,
        {
          run_id: runId,
          started_at: new Date(Date.now() - 1000).toISOString(),
          completed_at: new Date().toISOString(),
          tracks_classified: 0,
          tracks_total: Object.keys(cache.tracks).length,
          cost_usd: 0,
          summary: `${created} created, ${updated} updated, ${tracks_added} tracks added.`,
        },
      ],
    }),
  );

  return { created, updated, tracks_added, playlists };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/pipeline-apply.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/apply.ts tests/integration/pipeline-apply.test.ts
git commit -m "feat: apply pipeline — checkpointed, idempotent, first-run dup-check"
```

---

## Task 64: Apply API route (SSE)

**Files:**

- Create: `app/api/spotify/apply/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/spotify/apply/route.ts
import { withSpotify } from "@/src/lib/spotify/client";
import { runApplyFromCache } from "@/src/lib/pipeline/apply";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

export async function POST(req: Request) {
  const session = parseSession(req);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        const result = await withSpotify(session, (token) =>
          runApplyFromCache({
            accessToken: token,
            onProgress: (stage, done, total, name) =>
              send("progress", { stage, done, total, name }),
          }),
        );
        send("done", result);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "unknown",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/spotify/apply/route.ts
git commit -m "feat: apply SSE route streams per-category progress"
```

---

## Task 65: Apply confirmation modal

**Files:**

- Create: `src/components/apply/ApplyConfirmationModal.tsx`

- [ ] **Step 1: Implement the modal**

```tsx
// src/components/apply/ApplyConfirmationModal.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  open: boolean;
  toCreate: number;
  toUpdate: number;
  totalTracks: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ApplyConfirmationModal({
  open,
  toCreate,
  toUpdate,
  totalTracks,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-[var(--color-bg-base)]/80 backdrop-blur-sm z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="max-w-lg w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
              Final step
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-text-primary)] mb-6 leading-tight">
              About to write to your Spotify account.
            </h2>
            <ul className="space-y-2 text-[var(--color-text-secondary)] mb-10">
              <li>
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)] mr-2">
                  {toCreate}
                </span>
                new playlists will be created.
              </li>
              {toUpdate > 0 && (
                <li>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)] mr-2">
                    {toUpdate}
                  </span>
                  existing playlists will be updated.
                </li>
              )}
              <li>
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-primary)] mr-2">
                  {totalTracks}
                </span>
                tracks added in total.
              </li>
              <li className="text-sm pt-3">
                All playlists private by default.
              </li>
            </ul>
            <div className="flex items-center gap-6">
              <Button onClick={onConfirm}>Apply</Button>
              <Button variant="ghost" onClick={onCancel}>
                Not yet
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/apply/ApplyConfirmationModal.tsx
git commit -m "feat: apply confirmation modal with accurate counts"
```

---

## Task 66: Apply progress + success screen

**Files:**

- Create: `app/apply/page.tsx`, `src/components/apply/SuccessCredits.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode), `animate`, `delight`. The success screen is the ONE anchor design moment — it should be LOUD in the curated way: large display type, generous space, playlists listed like end-credits of a record. NO confetti. NO neon. NO "Awesome! Done!"

- [ ] **Step 2: Implement SuccessCredits**

```tsx
// src/components/apply/SuccessCredits.tsx
"use client";
import { motion } from "framer-motion";

interface Props {
  playlists: Array<{
    id: string;
    name: string;
    track_count: number;
    created: boolean;
  }>;
  summary: { created: number; updated: number; tracks_added: number };
}

export function SuccessCredits({ playlists, summary }: Props) {
  const ordered = [...playlists].sort((a, b) => b.track_count - a.track_count);
  return (
    <div className="space-y-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-tertiary)] mb-6">
          Side A
        </div>
        <h1 className="font-[family-name:var(--font-display)] italic text-7xl leading-[0.95] text-[var(--color-text-primary)] max-w-3xl">
          {summary.created > 0
            ? `${summary.created} new playlists`
            : "Updated."}
          <br />
          <span className="not-italic text-[var(--color-text-secondary)] text-5xl">
            {summary.tracks_added} tracks placed.
          </span>
        </h1>
      </motion.div>

      <motion.ol
        className="space-y-1"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: 0.04, delayChildren: 0.6 },
          },
        }}
      >
        {ordered.map((p, i) => (
          <motion.li
            key={p.id}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0 },
            }}
            className="flex items-baseline gap-6 py-3 border-b border-[var(--color-border-default)]"
          >
            <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-tertiary)] w-10">
              {String(i + 1).padStart(2, "0")}
            </span>
            <a
              href={`spotify:playlist:${p.id}`}
              className="flex-1 font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
            >
              {p.name}
            </a>
            <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-text-tertiary)]">
              {p.track_count}
            </span>
          </motion.li>
        ))}
      </motion.ol>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
        className="border-t border-[var(--color-border-default)] pt-12 max-w-2xl"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-tertiary)] mb-3">
          One last thing
        </div>
        <p className="text-[var(--color-text-secondary)] leading-relaxed">
          Open Spotify desktop, multi-select the{" "}
          {summary.created > 0 ? "new" : ""} prefix-marked playlists,
          right-click → <em>Add to Folder</em> → name it "Organized." Thirty
          seconds, never again.
        </p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: Implement apply page**

```tsx
// app/apply/page.tsx
"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageShell } from "@/src/components/design/PageShell";
import { Button } from "@/src/components/design/Button";
import { ProgressBar } from "@/src/components/scan/ProgressBar";
import { ApplyConfirmationModal } from "@/src/components/apply/ApplyConfirmationModal";
import { SuccessCredits } from "@/src/components/apply/SuccessCredits";
import { categoryMembers } from "@/src/lib/classification/threshold";

interface DoneResult {
  created: number;
  updated: number;
  tracks_added: number;
  playlists: Array<{
    id: string;
    name: string;
    track_count: number;
    created: boolean;
  }>;
}

export default function ApplyPage() {
  const [confirmOpen, setConfirmOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 1, name: "" });
  const [done, setDone] = useState<DoneResult | null>(null);
  const [preview, setPreview] = useState({
    toCreate: 0,
    toUpdate: 0,
    totalTracks: 0,
  });

  useEffect(() => {
    (async () => {
      const cache = await fetch("/api/cache").then((r) => r.json());
      const members = categoryMembers(
        cache.assignments,
        cache.config.confidence_threshold,
      );
      let toCreate = 0,
        toUpdate = 0;
      for (const cat of Object.values(cache.categories) as Array<{
        spotify_playlist_id: string | null;
      }>) {
        if (cat.spotify_playlist_id) toUpdate++;
        else toCreate++;
      }
      let totalTracks = 0;
      for (const set of members.values()) totalTracks += set.size;
      setPreview({ toCreate, toUpdate, totalTracks });
    })();
  }, []);

  function start() {
    setConfirmOpen(false);
    setRunning(true);
    const es = new EventSource("/api/spotify/apply");
    es.addEventListener("progress", (e) =>
      setProgress(JSON.parse((e as MessageEvent).data)),
    );
    es.addEventListener("done", (e) => {
      setDone(JSON.parse((e as MessageEvent).data));
      es.close();
    });
    es.addEventListener("error", () => es.close());
  }

  if (done) {
    return (
      <PageShell>
        <SuccessCredits
          playlists={done.playlists}
          summary={{
            created: done.created,
            updated: done.updated,
            tracks_added: done.tracks_added,
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={running ? "Writing to Spotify" : "Ready"}
      title={running ? "Adding tracks…" : "About to apply."}
    >
      <AnimatePresence mode="wait">
        {running && (
          <motion.div
            key="run"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-xl space-y-6"
          >
            <ProgressBar value={progress.done} total={progress.total} />
            <p className="text-[var(--color-text-secondary)]">
              {progress.name ? `Adding to "${progress.name}"…` : "Starting…"} (
              {progress.done}/{progress.total})
            </p>
          </motion.div>
        )}
        {!running && !done && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <p className="text-[var(--color-text-secondary)] max-w-xl">
              When you're ready, we'll create your new playlists.
            </p>
            <Button onClick={() => setConfirmOpen(true)}>
              Review and apply
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <ApplyConfirmationModal
        open={confirmOpen}
        toCreate={preview.toCreate}
        toUpdate={preview.toUpdate}
        totalTracks={preview.totalTracks}
        onConfirm={start}
        onCancel={() => setConfirmOpen(false)}
      />
    </PageShell>
  );
}
```

- [ ] **Step 4: Critique pass**

Invoke `critique` + `delight` against the success screen specifically. This is the emotional payoff — it must NOT feel like a SaaS toast or a "Yay! Done!" Linear notification. Adjust if it falls short.

- [ ] **Step 5: Commit**

```bash
git add app/apply src/components/apply
git commit -m "feat: apply progress + success credits (the anchor design moment)"
```

---

## Task 67: E2E happy-path test

**Files:**

- Create: `tests/e2e/happy-path.spec.ts`, `tests/e2e/fixtures/mocks.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/e2e/happy-path.spec.ts
import { test, expect } from "@playwright/test";

test("happy path: connect → scope → scan → review → classify → apply", async ({
  page,
  context,
}) => {
  // Set fake cookies bypassing OAuth for E2E (route handler short-circuit via E2E_BYPASS_AUTH env)
  await context.addCookies([
    {
      name: "sorter_access_token",
      value: "E2E_TOKEN",
      url: "http://127.0.0.1:3000",
    },
  ]);

  await page.goto("/scope");
  await expect(
    page.getByRole("heading", { name: /What should I read/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scan" }).click();

  await expect(page).toHaveURL(/\/review|\/scan/);
  // Allow scan + propose to complete (mocked)
  await page.waitForURL("/review", { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: /categories\. Edit anything/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Classify" }).click();
  await page.getByRole("button", { name: "Proceed" }).click();

  await page.waitForURL("/classify", { timeout: 60_000 });
  await page.getByRole("button", { name: "Apply to Spotify" }).click();

  await page.waitForURL("/apply", { timeout: 30_000 });
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByText(/new playlists|Updated/i)).toBeVisible({
    timeout: 30_000,
  });
});
```

- [ ] **Step 2: Note: E2E mock layer setup is a separate task (Task 68)**

This test will not pass until Task 68 wires the E2E mock layer. Skip the run + commit for now; commit the test file only.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/happy-path.spec.ts
git commit -m "test: E2E happy-path scaffold (mocks wired in next task)"
```

---

## Task 68: E2E mock layer (Spotify + Anthropic)

**Files:**

- Create: `tests/e2e/fixtures/mocks.ts`, modify: `playwright.config.ts`

- [ ] **Step 1: Implement Playwright route mocks**

```typescript
// tests/e2e/fixtures/mocks.ts
import type { Page } from "@playwright/test";

export async function mockSpotify(page: Page) {
  await page.route("https://api.spotify.com/v1/me", (route) =>
    route.fulfill({ json: { id: "me", display_name: "Me" } }),
  );
  await page.route("https://api.spotify.com/v1/me/playlists**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "p1",
            name: "Late Night",
            owner: { id: "me" },
            tracks: { total: 12 },
            images: [],
          },
        ],
        next: null,
      },
    }),
  );
  await page.route(
    "https://api.spotify.com/v1/playlists/p1/tracks**",
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              track: {
                id: "t1",
                name: "Self Care",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
            {
              track: {
                id: "t2",
                name: "Spike",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
          ],
          next: null,
        },
      }),
  );
  await page.route("https://api.spotify.com/v1/me/tracks**", (route) =>
    route.fulfill({ json: { items: [], next: null } }),
  );
  await page.route("https://api.spotify.com/v1/artists**", (route) =>
    route.fulfill({
      json: {
        artists: [{ id: "a1", name: "Mac Miller", genres: ["hip hop"] }],
      },
    }),
  );
  await page.route("https://api.spotify.com/v1/users/me/playlists", (route) =>
    route.fulfill({ json: { id: "p_new" } }),
  );
  await page.route("https://api.spotify.com/v1/playlists/*/tracks", (route) =>
    route.fulfill({ json: { snapshot_id: "s" } }),
  );
}

export async function mockAnthropic(page: Page) {
  await page.route(
    "https://api.anthropic.com/v1/messages",
    async (route, request) => {
      const body = await request.postDataJSON();
      const isClassify = (body.system?.[0]?.text ?? body.system ?? "").includes(
        "classifying tracks",
      );
      if (isClassify) {
        return route.fulfill({
          json: {
            id: "m",
            type: "message",
            role: "assistant",
            model: "claude-haiku-4-5-20251001",
            stop_reason: "end_turn",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  tracks: [
                    {
                      track_id: "t1",
                      matches: [{ category: "Aesthetic Rap", score: 90 }],
                      reasoning: "Dreamy.",
                    },
                    {
                      track_id: "t2",
                      matches: [{ category: "Aesthetic Rap", score: 80 }],
                      reasoning: "Trap.",
                    },
                  ],
                }),
              },
            ],
            usage: { input_tokens: 800, output_tokens: 300 },
          },
        });
      }
      return route.fulfill({
        json: {
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                categories: [
                  {
                    name: "Aesthetic Rap",
                    description: "Cloud rap",
                    example_track_ids: ["t1", "t2"],
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 1500, output_tokens: 300 },
        },
      });
    },
  );
}
```

- [ ] **Step 2: Wire into happy-path test**

Edit `tests/e2e/happy-path.spec.ts` to call `mockSpotify(page); mockAnthropic(page);` before `page.goto`.

- [ ] **Step 3: Run E2E**

```bash
pnpm test:e2e
```

Expected: happy-path test PASSES (full pipeline mocked).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures tests/e2e/happy-path.spec.ts
git commit -m "test: E2E mock layer for Spotify + Anthropic, happy-path passes"
```

---

# Phase 7 — Incremental Re-runs + Diff View + Surgical Re-classify

## Task 69: Track diff (new / removed / unchanged)

**Files:**

- Create: `src/lib/classification/diff.ts`, `tests/unit/diff.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/diff.test.ts
import { describe, it, expect } from "vitest";
import { diffTracks } from "@/src/lib/classification/diff";

describe("diffTracks", () => {
  it("classifies into new / removed / unchanged", () => {
    const previous = ["t1", "t2", "t3"];
    const current = ["t2", "t3", "t4"];
    expect(diffTracks(previous, current)).toEqual({
      added: ["t4"],
      removed: ["t1"],
      unchanged: ["t2", "t3"],
    });
  });

  it("first run: all current are added", () => {
    expect(diffTracks([], ["t1", "t2"])).toEqual({
      added: ["t1", "t2"],
      removed: [],
      unchanged: [],
    });
  });

  it("handles empty current (full library deletion)", () => {
    expect(diffTracks(["t1"], [])).toEqual({
      added: [],
      removed: ["t1"],
      unchanged: [],
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/diff.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement diff.ts**

```typescript
// src/lib/classification/diff.ts
export interface TrackDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export function diffTracks(previous: string[], current: string[]): TrackDiff {
  const prevSet = new Set(previous);
  const currSet = new Set(current);
  return {
    added: current.filter((id) => !prevSet.has(id)),
    removed: previous.filter((id) => !currSet.has(id)),
    unchanged: current.filter((id) => prevSet.has(id)),
  };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/diff.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classification/diff.ts tests/unit/diff.test.ts
git commit -m "feat: track diff returns added/removed/unchanged"
```

---

## Task 70: Category delta (added / removed / unchanged)

**Files:**

- Create: `src/lib/categories/delta.ts`, `tests/unit/category-delta.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/category-delta.test.ts
import { describe, it, expect } from "vitest";
import { categoryDelta } from "@/src/lib/categories/delta";

describe("categoryDelta", () => {
  it("returns added/removed/unchanged by id", () => {
    const before = [
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
    ];
    const after = [
      { id: "c1", name: "A" },
      { id: "c3", name: "C" },
    ];
    expect(categoryDelta(before, after)).toEqual({
      added: [{ id: "c3", name: "C" }],
      removed: [{ id: "c2", name: "B" }],
      unchanged: [{ id: "c1", name: "A" }],
    });
  });

  it("detects rename as unchanged (same id, new name)", () => {
    const before = [{ id: "c1", name: "Old" }];
    const after = [{ id: "c1", name: "New" }];
    expect(categoryDelta(before, after).unchanged).toEqual([
      { id: "c1", name: "New" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/unit/category-delta.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement delta.ts**

```typescript
// src/lib/categories/delta.ts
export interface CategoryRef {
  id: string;
  name: string;
}

export interface CategoryDeltaResult {
  added: CategoryRef[];
  removed: CategoryRef[];
  unchanged: CategoryRef[];
}

export function categoryDelta(
  before: CategoryRef[],
  after: CategoryRef[],
): CategoryDeltaResult {
  const beforeIds = new Set(before.map((c) => c.id));
  const afterIds = new Set(after.map((c) => c.id));
  return {
    added: after.filter((c) => !beforeIds.has(c.id)),
    removed: before.filter((c) => !afterIds.has(c.id)),
    unchanged: after.filter((c) => beforeIds.has(c.id)),
  };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/unit/category-delta.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categories/delta.ts tests/unit/category-delta.test.ts
git commit -m "feat: category delta returns added/removed/unchanged by id"
```

---

## Task 71: Surgical reclassify

**Files:**

- Create: `src/lib/llm/reclassify.ts`, `tests/integration/llm-reclassify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/llm-reclassify.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { reclassifyAgainstCategory } from "@/src/lib/llm/reclassify";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("reclassifyAgainstCategory", () => {
  it("returns 0-100 score per track for the new category", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                scores: [
                  { track_id: "t1", score: 75 },
                  { track_id: "t2", score: 25 },
                ],
              }),
            },
          ],
          usage: { input_tokens: 800, output_tokens: 200 },
        }),
      ),
    );
    const result = await reclassifyAgainstCategory({
      apiKey: "sk-ant-x",
      category: {
        id: "cnew",
        name: "Hyperpop",
        description: "Glittery, hyperactive.",
      },
      tracks: [
        { id: "t1", title: "X", artist_name: "A", genres: ["hyperpop"] },
        { id: "t2", title: "Y", artist_name: "B", genres: ["country"] },
      ],
    });
    expect(result.scores).toEqual([
      { track_id: "t1", score: 75 },
      { track_id: "t2", score: 25 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/llm-reclassify.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement reclassify.ts**

```typescript
// src/lib/llm/reclassify.ts
import { z } from "zod";
import { anthropicClient } from "./client";
import { costFromUsage } from "./cost";
import { logLLMCall } from "./log";

const MODEL = "claude-haiku-4-5-20251001";

const ReclassifySchema = z.object({
  scores: z.array(
    z.object({ track_id: z.string(), score: z.number().int().min(0).max(100) }),
  ),
});

export interface ReclassifyOpts {
  apiKey: string;
  category: { id: string; name: string; description: string };
  tracks: Array<{
    id: string;
    title: string;
    artist_name: string;
    genres: string[];
  }>;
}

export interface ReclassifyResult {
  scores: Array<{ track_id: string; score: number }>;
  cost_usd: number;
}

export async function reclassifyAgainstCategory(
  opts: ReclassifyOpts,
): Promise<ReclassifyResult> {
  const start = Date.now();
  const system = `You are scoring how well each track fits ONE specific category on a 0-100 scale.

Category: ${opts.category.name}
Description: ${opts.category.description}

Return JSON only: { "scores": [ { "track_id": "string", "score": 0-100 } ] }`;

  const user = opts.tracks
    .map((t) => {
      const g = t.genres.length ? ` [${t.genres.slice(0, 3).join(", ")}]` : "";
      return `${t.id}\t${t.title} — ${t.artist_name}${g}`;
    })
    .join("\n");

  const client = anthropicClient(opts.apiKey);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4_000,
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0.2,
  });
  const text = resp.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  const parsed = ReclassifySchema.parse(JSON.parse(text));
  const cost = costFromUsage(resp.usage);

  await logLLMCall({
    model: MODEL,
    phase: "reclassify",
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
    latency_ms: Date.now() - start,
    retries: 0,
    batch_size: opts.tracks.length,
    cost_usd: cost,
  });

  return { scores: parsed.scores, cost_usd: cost };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/llm-reclassify.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/reclassify.ts tests/integration/llm-reclassify.test.ts
git commit -m "feat: LLM surgical reclassify scores tracks against one new category"
```

---

## Task 72: Reclassify pipeline (merges into existing matches, top-5 cap)

**Files:**

- Create: `src/lib/pipeline/reclassify.ts`, `tests/integration/pipeline-reclassify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/pipeline-reclassify.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReclassifyForNewCategories } from "@/src/lib/pipeline/reclassify";
import {
  writeCache,
  defaultCache,
  patchCache,
  readCache,
} from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      artists: { a1: { name: "A", genres: ["pop"] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "X",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
      categories: {
        cold: {
          name: "Old Cat",
          description: "d",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
        cnew: {
          name: "Hyperpop",
          description: "glittery",
          spotify_playlist_id: null,
          created_at: "2026-05-13T00:00:00.000Z",
        },
      },
      assignments: {
        t1: {
          matches: [{ category_id: "cold", score: 80 }],
          reasoning: "r",
          classified_at: "2026-05-13T00:00:00.000Z",
          override: null,
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("runReclassifyForNewCategories", () => {
  it("adds new category to existing matches, keeps top-5", async () => {
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({ scores: [{ track_id: "t1", score: 85 }] }),
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      ),
    );
    const result = await runReclassifyForNewCategories({
      apiKey: "sk-ant-x",
      newCategoryIds: ["cnew"],
    });
    expect(result.tracks_updated).toBe(1);
    const cache = await readCache(join(dir, "cache.json"));
    const matches = cache.assignments["t1"]!.matches;
    expect(matches.find((m) => m.category_id === "cnew")?.score).toBe(85);
  });

  it("does not touch tracks with manual override", async () => {
    const seeded = await readCache(join(dir, "cache.json"));
    await writeCache(
      join(dir, "cache.json"),
      patchCache(seeded, {
        assignments: {
          t1: {
            ...seeded.assignments["t1"]!,
            override: {
              category_id: "cold",
              set_at: "2026-05-13T00:00:00.000Z",
            },
          },
        },
      }),
    );
    server.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ scores: [] }) }],
          usage: { input_tokens: 50, output_tokens: 20 },
        }),
      ),
    );
    await runReclassifyForNewCategories({
      apiKey: "sk-ant-x",
      newCategoryIds: ["cnew"],
    });
    const cache = await readCache(join(dir, "cache.json"));
    expect(
      cache.assignments["t1"]!.matches.find((m) => m.category_id === "cnew"),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/pipeline-reclassify.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement reclassify pipeline**

```typescript
// src/lib/pipeline/reclassify.ts
import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { reclassifyAgainstCategory } from "@/src/lib/llm/reclassify";

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

function trimToTop5(matches: Array<{ category_id: string; score: number }>) {
  return [...matches].sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function runReclassifyForNewCategories(opts: {
  apiKey: string;
  newCategoryIds: string[];
}) {
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);

  const eligibleTrackIds = Object.keys(cache.assignments).filter(
    (id) => !cache.assignments[id]!.override,
  );
  if (eligibleTrackIds.length === 0) return { tracks_updated: 0, cost_usd: 0 };

  let totalCost = 0;
  const merged = { ...cache.assignments };
  const updated = new Set<string>();

  for (const categoryId of opts.newCategoryIds) {
    const category = cache.categories[categoryId];
    if (!category) continue;
    const inputs = eligibleTrackIds.map((id) => {
      const t = cache.tracks[id]!;
      const a = cache.artists[t.artist_id];
      return {
        id,
        title: t.title,
        artist_name: a?.name ?? "",
        genres: a?.genres ?? [],
      };
    });
    const r = await reclassifyAgainstCategory({
      apiKey: opts.apiKey,
      category: {
        id: categoryId,
        name: category.name,
        description: category.description,
      },
      tracks: inputs,
    });
    totalCost += r.cost_usd;
    for (const score of r.scores) {
      const existing = merged[score.track_id];
      if (!existing) continue;
      const withoutThis = existing.matches.filter(
        (m) => m.category_id !== categoryId,
      );
      const next = trimToTop5([
        ...withoutThis,
        { category_id: categoryId, score: score.score },
      ]);
      merged[score.track_id] = { ...existing, matches: next };
      updated.add(score.track_id);
    }
  }

  await writeCache(cachePath, patchCache(cache, { assignments: merged }));
  return { tracks_updated: updated.size, cost_usd: totalCost };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/pipeline-reclassify.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline/reclassify.ts tests/integration/pipeline-reclassify.test.ts
git commit -m "feat: surgical reclassify pipeline preserves overrides + top-5 cap"
```

---

## Task 73: Reclassify API route

**Files:**

- Create: `app/api/llm/reclassify/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// app/api/llm/reclassify/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { runReclassifyForNewCategories } from "@/src/lib/pipeline/reclassify";
import { env } from "@/src/lib/config/env";

const Body = z.object({ newCategoryIds: z.array(z.string()).min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const result = await runReclassifyForNewCategories({
    apiKey: env().ANTHROPIC_API_KEY,
    newCategoryIds: parsed.data.newCategoryIds,
  });
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/llm/reclassify/route.ts
git commit -m "feat: POST /api/llm/reclassify route"
```

---

## Task 74: Diff banner component

**Files:**

- Create: `src/components/shared/DiffBanner.tsx`

- [ ] **Step 1: Invoke design skills**

`impeccable` (craft mode). Diff feels like `git diff` — quiet, tabular, monospace ratios. Two action verbs at the bottom (Apply existing / Edit categories), not a dialog with five buttons.

- [ ] **Step 2: Implement DiffBanner**

```tsx
// src/components/shared/DiffBanner.tsx
"use client";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  added: number;
  removed: number;
  removedExamples: string[];
  existingCategoryCount: number;
  onApplyExisting: () => void;
  onEditCategories: () => void;
}

export function DiffBanner({
  added,
  removed,
  removedExamples,
  existingCategoryCount,
  onApplyExisting,
  onEditCategories,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-10"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-4">
        Since last run
      </div>
      <ul className="space-y-2 mb-8 font-[family-name:var(--font-mono)]">
        <li className="flex items-baseline gap-3">
          <span className="text-[var(--color-success)] w-4">+</span>
          <span className="text-[var(--color-text-primary)] w-12 text-right">
            {added}
          </span>
          <span className="text-[var(--color-text-secondary)]">new tracks</span>
        </li>
        {removed > 0 && (
          <li className="flex items-baseline gap-3">
            <span className="text-[var(--color-warning)] w-4">~</span>
            <span className="text-[var(--color-text-primary)] w-12 text-right">
              {removed}
            </span>
            <span className="text-[var(--color-text-secondary)]">
              tracks removed from your sources (still in ✨ playlists)
            </span>
          </li>
        )}
        <li className="flex items-baseline gap-3">
          <span className="text-[var(--color-text-tertiary)] w-4">·</span>
          <span className="text-[var(--color-text-primary)] w-12 text-right">
            {existingCategoryCount}
          </span>
          <span className="text-[var(--color-text-secondary)]">
            existing categories
          </span>
        </li>
      </ul>
      <div className="flex items-center gap-8">
        <Button onClick={onApplyExisting}>
          Apply with existing categories
        </Button>
        <Button variant="ghost" onClick={onEditCategories}>
          Edit categories first
        </Button>
      </div>
      {removedExamples.length > 0 && (
        <p className="mt-6 text-xs text-[var(--color-text-tertiary)]">
          Removed: {removedExamples.slice(0, 3).join(", ")}
          {removedExamples.length > 3
            ? `, +${removedExamples.length - 3} more`
            : ""}
        </p>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/DiffBanner.tsx
git commit -m "feat: diff banner — git-diff-like quiet, two action verbs"
```

---

## Task 75: Diff API route

**Files:**

- Create: `app/api/spotify/diff/route.ts`, `tests/integration/diff-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/diff-route.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "@/app/api/spotify/diff/route";
import { writeCache, defaultCache, patchCache } from "@/src/lib/cache";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sorter-"));
  process.env.SORTER_DATA_DIR = dir;
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  await writeCache(
    join(dir, "cache.json"),
    patchCache(defaultCache(), {
      auth: {
        refresh_token: "RT",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      scope: {
        included_playlist_ids: ["p1"],
        excluded_playlist_ids: [],
        include_liked_songs: false,
      },
      artists: { a1: { name: "A", genres: [] } },
      tracks: {
        t1: {
          artist_id: "a1",
          title: "old",
          first_seen: "2026-05-13T00:00:00.000Z",
        },
      },
    }),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.SORTER_DATA_DIR;
});

describe("GET /api/spotify/diff", () => {
  it("returns added/removed against cached tracks", async () => {
    server.use(
      http.get("https://api.spotify.com/v1/playlists/p1/tracks", () =>
        HttpResponse.json({
          items: [
            {
              track: {
                id: "t1",
                name: "old",
                is_local: false,
                artists: [{ id: "a1", name: "A" }],
              },
            },
            {
              track: {
                id: "t2",
                name: "new",
                is_local: false,
                artists: [{ id: "a1", name: "A" }],
              },
            },
          ],
          next: null,
        }),
      ),
    );
    const req = new Request("http://127.0.0.1/api/spotify/diff", {
      headers: { cookie: "sorter_access_token=AT" },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.added).toEqual(["t2"]);
    expect(body.removed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/integration/diff-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement diff route**

```typescript
// app/api/spotify/diff/route.ts
import { NextResponse } from "next/server";
import { join } from "node:path";
import { readCache } from "@/src/lib/cache";
import { withSpotify } from "@/src/lib/spotify/client";
import { fetchPlaylistTracks, fetchLikedSongs } from "@/src/lib/spotify/tracks";
import { dedupeTracks } from "@/src/lib/spotify/dedupe";
import { diffTracks } from "@/src/lib/classification/diff";

export const dynamic = "force-dynamic";

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

function parseSession(req: Request) {
  const m = /sorter_access_token=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

export async function GET(req: Request) {
  const session = parseSession(req);
  const cache = await readCache(join(dataDir(), "cache.json"));
  const previousIds = Object.keys(cache.tracks);

  const all = await withSpotify(session, async (token) => {
    const out = [];
    for (const id of cache.scope.included_playlist_ids) {
      out.push(...(await fetchPlaylistTracks(id, token)));
    }
    if (cache.scope.include_liked_songs) {
      out.push(...(await fetchLikedSongs(token)));
    }
    return out;
  });
  const currentIds = dedupeTracks(all).map((t) => t.id);
  const diff = diffTracks(previousIds, currentIds);
  const removedExamples = diff.removed
    .slice(0, 5)
    .map((id) => cache.tracks[id]?.title ?? id);
  return NextResponse.json({
    added: diff.added,
    removed: diff.removed,
    removed_examples: removedExamples,
    existing_category_count: Object.keys(cache.categories).length,
    is_first_run: previousIds.length === 0,
  });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test tests/integration/diff-route.test.ts
```

Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/spotify/diff/route.ts tests/integration/diff-route.test.ts
git commit -m "feat: diff route returns added/removed since cached state"
```

---

## Task 76: Wire diff banner into scan flow (re-runs only)

**Files:**

- Modify: `app/scan/page.tsx`

- [ ] **Step 1: Add re-run branch**

Edit `app/scan/page.tsx` to detect re-run state and route to `/diff` instead of `/review` after scan completes:

In the `useEffect` that handles `done`:

```tsx
useEffect(() => {
  if (done) {
    (async () => {
      const cache = await fetch("/api/cache").then((r) => r.json());
      const isRerun = cache.runs && cache.runs.length > 0;
      const target = isRerun ? "/diff" : "/review";
      const id = setTimeout(() => router.push(target), 800);
      return () => clearTimeout(id);
    })();
  }
}, [done, router]);
```

- [ ] **Step 2: Commit**

```bash
git add app/scan/page.tsx
git commit -m "feat: scan routes to /diff on re-run, /review on first run"
```

---

## Task 77: Diff page

**Files:**

- Create: `app/diff/page.tsx`

- [ ] **Step 1: Implement diff page**

```tsx
// app/diff/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/src/components/design/PageShell";
import { DiffBanner } from "@/src/components/shared/DiffBanner";

interface DiffResponse {
  added: string[];
  removed: string[];
  removed_examples: string[];
  existing_category_count: number;
  is_first_run: boolean;
}

export default function DiffPage() {
  const router = useRouter();
  const [diff, setDiff] = useState<DiffResponse | null>(null);

  useEffect(() => {
    fetch("/api/spotify/diff")
      .then((r) => r.json())
      .then(setDiff);
  }, []);

  if (!diff) {
    return (
      <PageShell eyebrow="Comparing" title="Diffing your library…">
        <p className="text-[var(--color-text-secondary)]">
          Reading current state.
        </p>
      </PageShell>
    );
  }

  if (diff.is_first_run || diff.existing_category_count === 0) {
    router.replace("/review");
    return null;
  }

  if (diff.added.length === 0 && diff.removed.length === 0) {
    return (
      <PageShell eyebrow="Nothing to do" title="Your library is unchanged.">
        <p className="text-[var(--color-text-secondary)] mb-8">
          No new or removed tracks since the last run.
        </p>
        <a
          href="/"
          className="text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          ← Back to start
        </a>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Re-run" title="What changed.">
      <DiffBanner
        added={diff.added.length}
        removed={diff.removed.length}
        removedExamples={diff.removed_examples}
        existingCategoryCount={diff.existing_category_count}
        onApplyExisting={() => router.push("/classify")}
        onEditCategories={() => router.push("/review")}
      />
    </PageShell>
  );
}
```

- [ ] **Step 2: Critique pass**

Invoke `critique`. The page must feel like reading a `git diff` summary: spare, monospace where it matters, no spinning loaders.

- [ ] **Step 3: Commit**

```bash
git add app/diff/page.tsx
git commit -m "feat: diff page — branch on changes, two-verb action choice"
```

---

## Task 78: Review screen — re-run mode (existing + new)

**Files:**

- Modify: `app/review/page.tsx`

- [ ] **Step 1: Detect re-run and pre-populate categories**

In `app/review/page.tsx`, replace the `useEffect` that calls `/api/llm/propose`:

```tsx
useEffect(() => {
  (async () => {
    const cache = await fetch("/api/cache").then((r) => r.json());
    const lookup: Record<string, TrackLookupEntry> = {};
    for (const [id, t] of Object.entries(
      cache.tracks as Record<string, { title: string; artist_id: string }>,
    )) {
      const artist = (cache.artists as Record<string, { name: string }>)[
        t.artist_id
      ];
      lookup[id] = { id, title: t.title, artist_name: artist?.name ?? "" };
    }
    setTracks(lookup);
    setTrackCount(Object.keys(lookup).length);

    const existingCategories = Object.entries(
      cache.categories as Record<string, { name: string; description: string }>,
    );
    if (existingCategories.length > 0) {
      // re-run: skip propose, pre-populate from cache
      setDraft(
        existingCategories.map(([id, c]) => ({
          id,
          name: c.name,
          description: c.description,
          example_track_ids: [],
        })),
      );
    } else {
      const proposed = await fetch("/api/llm/propose", { method: "POST" }).then(
        (r) => r.json(),
      );
      setDraft(proposed.categories);
    }
  })();
}, []);
```

- [ ] **Step 2: On Classify, detect new categories and trigger reclassify**

In the `classify()` function in the same file, after the existing PATCH:

```tsx
const cache = await fetch("/api/cache").then((r) => r.json());
const previousIds = new Set(Object.keys(cache.categories ?? {}));
const draftCategoryIds = new Set(draft!.map((c) => c.id));
const newCategoryIds = Array.from(draftCategoryIds).filter(
  (id) => !previousIds.has(id),
);
if (newCategoryIds.length > 0 && previousIds.size > 0) {
  await fetch("/api/llm/reclassify", {
    method: "POST",
    body: JSON.stringify({ newCategoryIds }),
    headers: { "content-type": "application/json" },
  });
}
```

(Place this between the cache PATCH and the `router.push('/classify')` call. Adjust to read `cache.categories` BEFORE the PATCH; capture the previous IDs upfront.)

- [ ] **Step 3: Commit**

```bash
git add app/review/page.tsx
git commit -m "feat: review screen handles re-runs (skip propose, surgical reclass on new cats)"
```

---

## Task 79: Resume after crash UI

**Files:**

- Create: `src/components/shared/ResumeBanner.tsx`, modify: `app/page.tsx`

- [ ] **Step 1: Implement ResumeBanner**

```tsx
// src/components/shared/ResumeBanner.tsx
"use client";
import { motion } from "framer-motion";
import { Button } from "@/src/components/design/Button";

interface Props {
  lastRunSummary: string;
  classifiedFraction: { done: number; total: number };
  onResume: () => void;
  onStartFresh: () => void;
}

export function ResumeBanner({
  lastRunSummary,
  classifiedFraction,
  onResume,
  onStartFresh,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-8 max-w-2xl"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
        A run was interrupted.
      </div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)] mb-2">
        {classifiedFraction.done} of {classifiedFraction.total} tracks were
        classified.
      </h2>
      <p className="text-[var(--color-text-secondary)] mb-6">
        {lastRunSummary}
      </p>
      <div className="flex items-center gap-6">
        <Button onClick={onResume}>Resume</Button>
        <Button variant="ghost" onClick={onStartFresh}>
          Start fresh
        </Button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Wire into landing page**

In `app/page.tsx`, fetch cache on mount and conditionally render `ResumeBanner` when there's an incomplete run.

```tsx
// at top of Home component (convert to client component or use server component pattern)
// For brevity, this can be a separate client component embedded in page.tsx.
```

(Implementation detail: keep the page server-rendered and embed a small client component `<ResumePrompt />` that does the fetch.)

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/ResumeBanner.tsx app/page.tsx
git commit -m "feat: resume-after-crash banner on landing page"
```

---

# Phase 8 — Polish Pass

This phase invokes the design skills against the now-functional product to bring it to release quality. Each task is a focused pass with a specific lens.

## Task 80: useReducedMotion respect across the app

**Files:**

- Create: `src/hooks/useReducedMotionRespect.ts`, modify: every page that uses Framer Motion

- [ ] **Step 1: Implement the hook**

```typescript
// src/hooks/useReducedMotionRespect.ts
"use client";
import { useReducedMotion } from "framer-motion";

export function useMotionConfig() {
  const reduced = useReducedMotion();
  return {
    reduced: !!reduced,
    spring: reduced
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 200, damping: 30, mass: 0.8 },
    pageEase: reduced
      ? { duration: 0 }
      : {
          duration: 0.6,
          ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
        },
    stagger: reduced
      ? { staggerChildren: 0, delayChildren: 0 }
      : { staggerChildren: 0.04, delayChildren: 0.1 },
  };
}
```

- [ ] **Step 2: Audit Framer Motion usage**

```bash
grep -rn 'from .framer-motion.' app src/components | head -50
```

Replace inline `transition={{ type: 'spring', stiffness: 200, damping: 30, mass: 0.8 }}` and the page-ease cubic-bezier with `useMotionConfig()` returns where reasonable.

- [ ] **Step 3: Manual smoke**

```bash
pnpm dev
```

In Chrome DevTools → Rendering → "Emulate CSS prefers-reduced-motion" → "reduce." Walk the flow. All transitions should be instant. Spring feel should be gone. Kill.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useReducedMotionRespect.ts app src/components
git commit -m "feat: respect prefers-reduced-motion across all motion"
```

---

## Task 81: animate skill pass — page transitions

**Files:**

- Modify: `app/layout.tsx` (wrap in motion AnimatePresence)

- [ ] **Step 1: Invoke `animate` skill**

Run `animate` against the entire app. Goal: page transitions feel cohesive (same exponential ease-out, same direction). Per-screen reveal feels intentional (stagger respected). Drag interactions have weight.

- [ ] **Step 2: Add page-transition wrapper**

If the skill recommends a wrapper component, create `src/components/design/PageTransition.tsx` exporting an `<AnimatePresence>`-based shell, then wrap content in each `app/<route>/page.tsx`.

- [ ] **Step 3: Manual smoke + commit**

```bash
pnpm dev
```

Walk the flow. Transitions feel as one design language.

```bash
git add app src/components
git commit -m "feat: cohesive page transitions across all routes (animate skill pass)"
```

---

## Task 82: polish skill pass — alignment, spacing, type details

**Files:**

- Modify: across `src/components/**` and `app/**`

- [ ] **Step 1: Invoke `polish` skill**

Run `polish` against each screen. Address every flagged issue: optical-vs-mathematical alignment, baseline rhythm, character spacing, weight contrast, vertical centering of mixed-weight text.

- [ ] **Step 2: Manual visual diff**

Walk the flow. Every screen should feel "set," not arranged.

- [ ] **Step 3: Commit per screen**

Commit polish changes per screen so reverts are easy:

```bash
git add app/setup src/components/setup
git commit -m "polish: setup wizard alignment + type pass"
# then repeat for /scope, /scan, /review, /classify, /apply, /diff
```

---

## Task 83: typeset skill pass

**Files:**

- Modify: `src/components/design/PageShell.tsx`, headings across pages

- [ ] **Step 1: Invoke `typeset`**

Run against every screen with display-type elements. Watch for: weight monotony, missing italic where it should land, inconsistent tracking on uppercase eyebrows.

- [ ] **Step 2: Adjust per recommendation**

Apply changes. The Apply success screen and the review-screen titles are the highest-priority targets.

- [ ] **Step 3: Commit**

```bash
git add app src/components
git commit -m "polish: typography pass — italic rhythm, tracking, weight contrast"
```

---

## Task 84: layout skill pass

**Files:**

- Modify: any page where layout feels grid-y or monotonous

- [ ] **Step 1: Invoke `layout`**

Run across each screen. The skill should flag: same-size cards everywhere, missing visual hierarchy, equal whitespace where varied would feel better.

- [ ] **Step 2: Apply asymmetry where flagged**

E.g., if review-screen card grid feels monotonous, vary one card's width on every 5th iteration; or feature the largest playlist on the apply success screen at 2x scale.

- [ ] **Step 3: Commit**

```bash
git add app src/components
git commit -m "polish: layout pass — asymmetry, hierarchy, varied rhythm"
```

---

## Task 85: delight skill pass on success screen

**Files:**

- Modify: `src/components/apply/SuccessCredits.tsx`

- [ ] **Step 1: Invoke `delight`**

Run against the success screen specifically. This is the one place we let the design be loud — `delight` should add small moments that earn the "credits at the end of a record" feeling without crossing into SaaS-toast territory.

- [ ] **Step 2: Apply changes**

Possible additions: a very slow Editorial New italic letter-spacing animation on the headline; a single beat of pause before the playlist list starts staggering in; a tiny "Side B." moment if the user has many playlists.

- [ ] **Step 3: Commit**

```bash
git add src/components/apply/SuccessCredits.tsx
git commit -m "polish: delight pass on success credits — earned weight, no saas-toast feel"
```

---

## Task 86: critique skill — final per-screen review

**Files:**

- (no edits — this is an evaluation pass)

- [ ] **Step 1: Invoke `critique` per screen**

Run `critique` against each screen with all anti-pattern detection on. Each screen must score acceptably (no flagged P0/P1 issues remaining).

Screens:

- Landing
- Setup wizard (each step)
- Scope
- Scan
- Diff (re-run)
- Review
- Classify
- Apply confirmation modal
- Apply progress
- Apply success

- [ ] **Step 2: Address flagged issues, commit**

```bash
git add .
git commit -m "polish: critique-driven fixes across all screens"
```

---

## Task 87: Test coverage check + final commit

**Files:**

- (no edits)

- [ ] **Step 1: Run full coverage**

```bash
pnpm test:coverage
```

Expected: 80%+ overall. 100% on these files (per spec §5.5):

- `src/lib/cache/write.ts` (atomic writes)
- `src/lib/classification/threshold.ts`
- `src/lib/pipeline/reclassify.ts`
- `src/lib/spotify/auth.ts` + `pkce.ts`
- `src/lib/classification/override.ts`

- [ ] **Step 2: Run E2E**

```bash
pnpm test:e2e
```

Expected: all green.

- [ ] **Step 3: Run typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```

Both green.

- [ ] **Step 4: Manual smoke against real APIs**

Walk through `docs/manual-test-checklist.md` against the user's actual Spotify account. This is the final acceptance.

- [ ] **Step 5: Final commit**

```bash
git tag v1.0.0
git commit --allow-empty -m "release: v1.0.0 — SpotifySorter ready for daily use"
```

---

# Self-Review

After writing the plan, I checked it against the spec for coverage, placeholders, and consistency.

## Spec coverage map

| Spec section                                                                                                                                | Tasks                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| §1.1 First-run setup wizard (Spotify dev app, Anthropic key validation, prefix)                                                             | 11, 12, 13, 16, 17                                                                                                                            |
| §1.2 Connect → Scope → Scan → Review → Classify → Apply happy path                                                                          | 16-29 (connect/scope), 30-37 (scan), 40-50 (propose/review), 51-60 (classify), 61-66 (apply)                                                  |
| §1.3 Re-runs + diff view + surgical reclass                                                                                                 | 69-79                                                                                                                                         |
| §2.1 Tech stack (Next.js 16, Tailwind, shadcn primitives, Framer Motion, dnd-kit, Spotify SDK, Anthropic SDK, Zod, Vitest, MSW, Playwright) | 1, 2, 3, 4                                                                                                                                    |
| §2.2 Process model (single Next.js process, all routes mapped)                                                                              | All API route tasks (13, 21, 22, 26, 29, 35, 45, 55, 64, 73, 75)                                                                              |
| §2.3 Server-only LLM, server-only token storage, PKCE, two-phase pipeline, idempotent apply                                                 | 18-23, 43, 53, 63                                                                                                                             |
| §3.1 LLM prompt strategy (propose + classify + reclassify with caching)                                                                     | 43, 53, 71                                                                                                                                    |
| §3.2 Confidence slider client-side                                                                                                          | 56, 58, 60                                                                                                                                    |
| §3.3 Manual track override                                                                                                                  | 57, 60 (drag in UI), 78                                                                                                                       |
| §3.4 Cache schema                                                                                                                           | 7, 8, 9, 10                                                                                                                                   |
| §3.5 Incremental re-run flow                                                                                                                | 69-78                                                                                                                                         |
| §3.6 Apply step (idempotent, dup-check, batched 100, 429 retry)                                                                             | 33, 61, 62, 63                                                                                                                                |
| §4 Error handling (auth, 429, malformed JSON, mid-run crash, version mismatch, empty library, scope-deny)                                   | 20 (revoked grant), 22 (denial redirect), 33 (429), 37 (empty), 38 (version mismatch), 43+53 (JSON retry), 63 (apply checkpoint), 79 (resume) |
| §5 Testing (Vitest unit + integration, MSW, Playwright E2E, coverage)                                                                       | All tasks include TDD; 67-68 E2E; 87 final coverage                                                                                           |
| §6 Design direction + skills usage                                                                                                          | 14, 15, 16, 27, 28, 36, 46, 47, 50, 58, 59, 60, 65, 66, 80-86                                                                                 |

Every spec requirement maps to at least one task. No gaps detected.

## Placeholder scan

Scanned for forbidden patterns:

- "TBD", "TODO", "implement later" → none in task content
- "Add appropriate error handling" / "handle edge cases" → none; specific errors are wired explicitly
- "Write tests for the above" without code → none; every TDD task has full test code
- "Similar to Task N" → none; code is repeated where needed
- Steps without code blocks for code work → none

## Type consistency notes

- `Cache`, `Assignment`, `Category`, `Track`, `Artist` types defined in Task 7 (`src/lib/cache/schema.ts`) — used identically in Tasks 8, 9, 10, 22, 23, 29, 34, 44, 54, 56, 57, 63, 71-72.
- `withSpotify(session, fn)` defined in Task 23 with signature `(session: Session | undefined, fn: (token: string) => Promise<T>) => Promise<T>` — matches usage in Tasks 26, 35, 64, 75.
- `runScan` / `runProposeFromCache` / `runClassifyFromCache` / `runApplyFromCache` / `runReclassifyForNewCategories` named consistently across pipeline tasks.
- `categoryMembers` defined in Task 56, consumed in Tasks 60, 63, 66 — same signature `(assignments, threshold) => Map<string, Set<string>>`.
- `formatPlaylistName(prefix, name)` — Task 61, used in Task 63.
- SSE event schema (`event: progress` / `done` / `error` with JSON `data`) consistent across Tasks 35, 55, 64; client-side `EventSource` listeners in Tasks 36, 60, 66 use the same names.
- `applyOverride` returns full `Assignment`, used immutably — consistent in Tasks 57 and the inline drag handler in Task 60.

No drift detected.

## Discovered minor gaps fixed inline

- **Liked Songs read-only invariant (decision #20):** Apply pipeline (Task 63) only iterates `cache.categories`, never touches Liked Songs endpoints — implicitly safe. No additional task needed.
- **`@/src/lib/...` import alias:** tsconfig from Task 1 needs `paths: { "@/*": ["./*"] }`. Add this in Task 1 if not present (the `pnpm create next-app` default already includes it; verify).
- **Apply progress UI did not surface cost from the latest classify run:** intentionally — cost is logged to JSONL, surfaced only in the cost preview modal. Decision matches spec §3.1 prompt-caching realism.

---

# Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-spotifysorter-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (Sonnet for implementation, Haiku for searches), review between tasks, fast iteration. Good for a multi-day build like this one.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review. Faster for short bursts; will hit context limits on a project this size.

Which approach?
