# Fonts

Download these woff2 files from [pangrampangram.com](https://pangrampangram.com) (free with email):

- `EditorialNew-Regular.woff2`
- `EditorialNew-Italic.woff2`
- `PPNeueMontreal-Book.woff2`
- `PPNeueMontreal-Medium.woff2`
- `PPNeueMontreal-Bold.woff2`

Place them in this directory. Then update `app/layout.tsx` to use `next/font/local` (see commented block).

**Until fonts are downloaded**, the app uses fallback Google Fonts: Spectral (display, serif) +
Geist Sans (body, grotesk). Both are free, not on `.impeccable.md`'s banned list, and visually
close enough to keep design rhythm intact.

## Swapping to real fonts

Once woff2 files are in place, replace the `editorialNewFallback` block in `app/layout.tsx` with:

```tsx
import localFont from "next/font/local";

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
```

Then update the `<html>` className to use `editorialNew.variable` and `ppNeueMontreal.variable`
instead of `editorialNewFallback.variable` and `GeistSans.variable`.
