# Fonts

No font files live here today. Display text uses the `--font-display` stack in
`app/globals.css`: "Editorial New" is named first but not loaded, so it renders in
Iowan Old Style (then Hoefler Text, Garamond, Georgia). Body and mono are Geist Sans and
Geist Mono from the `geist` package, wired up in `app/layout.tsx`. The brief's Pangram
fonts (Editorial New, PP Neue Montreal) are an optional drop-in: put their woff2 files in
this folder, load them with `next/font/local` in `app/layout.tsx`, and point
`--font-display` / `--font-body` at the new variables.
