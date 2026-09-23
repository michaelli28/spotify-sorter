// Album art from Spotify's public oEmbed endpoint: no token, so it can never
// set off ensureFreshToken's cache re-save. Verified live 2026-09-23 (113 of
// 115 thumbnails, all on image-cdn-*.spotifycdn.com).

export const OEMBED_TIMEOUT_MS = 8_000;
const MAX_IN_FLIGHT = 4;

// Like spotifyApi(): the e2e suite can point this at its mock server.
const oembedBase = () =>
  process.env.SPOTIFY_OEMBED_BASE ?? "https://open.spotify.com";

// The open-redirect guard: /api/art only ever redirects to Spotify's image CDN.
export function isAllowedArtUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    (u.hostname === "i.scdn.co" || u.hostname.endsWith(".spotifycdn.com"))
  );
}

/** A failure worth retrying soon: never stored as "no art". */
export class ArtFetchError extends Error {
  constructor(
    readonly kind: "timeout" | "upstream",
    message: string,
  ) {
    super(message);
    this.name = "ArtFetchError";
  }
}

// At most MAX_IN_FLIGHT oEmbed requests per server process: a page of album
// art is dozens of <img> tags firing at once. A released slot passes straight
// to the next waiter.
let inFlight = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight < MAX_IN_FLIGHT) inFlight++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else inFlight--;
  }
}

/**
 * The track's thumbnail URL, or null when oEmbed has no usable art (unknown
 * track, no thumbnail, or a host outside the allowlist). Throws ArtFetchError
 * on a timeout (headers or body), 429, 5xx, network failure, or a body that
 * isn't JSON: none of those prove the track has no art.
 */
export function fetchThumbnail(trackId: string): Promise<string | null> {
  return withSlot(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OEMBED_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${oembedBase()}/oembed?url=https://open.spotify.com/track/${trackId}`,
        { signal: ctrl.signal },
      );
      if (res.status === 429 || res.status >= 500)
        throw new ArtFetchError("upstream", `oEmbed ${res.status}`);
      if (!res.ok) return null;
      // Inside the try, uncaught: a stalled or garbled body is a failure to
      // retry, never a stored "no art".
      const body = (await res.json()) as { thumbnail_url?: unknown } | null;
      const thumb = body?.thumbnail_url;
      return typeof thumb === "string" && isAllowedArtUrl(thumb) ? thumb : null;
    } catch (err) {
      if (err instanceof ArtFetchError) throw err;
      if (ctrl.signal.aborted)
        throw new ArtFetchError("timeout", "oEmbed timed out");
      throw new ArtFetchError(
        "upstream",
        err instanceof Error ? err.message : "oEmbed failed",
      );
    } finally {
      clearTimeout(timer);
    }
  });
}
