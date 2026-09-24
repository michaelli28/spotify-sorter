# SpotifySorter

Sorts a Spotify library into mood playlists. Claude proposes the categories and scores each track against its five best fits; you set one cutoff, and Apply writes the result back to Spotify as private playlists.

## Run it

```bash
pnpm install
pnpm start:open   # next dev on http://127.0.0.1:3000, then opens the browser
```

Home's **Set up** button walks through making a Spotify app (redirect URI `http://127.0.0.1:3000/api/auth/callback`), its Client ID, an Anthropic API key and a playlist prefix, and writes the keys to `.env.local` (shape in `.env.local.example`). Use `127.0.0.1`, not `localhost`: Spotify sign-in is tied to that address.

Everything else the app knows lives in `data/`, which is gitignored.

## How it works

1. **Sources**: pick the playlists (and Liked Songs) to sort.
2. **Scan**: reads their tracks and artists.
3. **Categories**: Claude proposes categories; rename, merge, recolour or add your own.
4. **Fit**: each track's five scores; one cutoff decides what goes where, so a track can land in up to five playlists.
5. **Apply**: one private, prefixed playlist per category, made to match it exactly — tracks added by hand in Spotify are removed.

## Tests

```bash
pnpm test         # vitest: temp data dir, no network
pnpm typecheck
pnpm lint
pnpm exec playwright test tests/e2e/happy-path.spec.ts   # the whole flow against a mock Spotify and Anthropic
```

## Ears

`ml/` is a separate study: a small model trained on 30-second audio previews to reproduce Claude's playlist picks. Method, numbers and caveats are in [`ml/RESULTS.md`](ml/RESULTS.md).

## Status (2026-09-24)

Apply has created playlists and added tracks on a real Spotify account. Cover upload, sync removals and "Remove SpotifySorter playlists" have never succeeded against real Spotify; the tests run them against a mock.
