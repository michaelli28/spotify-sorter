import { describe, expect, it } from "vitest";
import { scanErrorKind } from "@/src/lib/scan/error-kind";

// Real messages, as src/lib/spotify/* and src/lib/pipeline/scan.ts throw them.
describe("scanErrorKind", () => {
  it("reads a 429 from any Spotify call as a rate limit", () => {
    expect(
      scanErrorKind(
        'Spotify 429 on https://api.spotify.com/v1/playlists/abc/tracks?offset=0&limit=100: {"error":{"status":429,"message":"API rate limit exceeded"}}',
      ),
    ).toBe("rate_limited");
    expect(scanErrorKind("Spotify artists 429: Too many requests")).toBe(
      "rate_limited",
    );
    expect(
      scanErrorKind("Failed to fetch snapshot for playlist abc: 429"),
    ).toBe("rate_limited");
  });

  it("reads a missing, revoked or rejected token as signed out", () => {
    expect(scanErrorKind("No Spotify auth in cache. User must connect.")).toBe(
      "signed_out",
    );
    expect(
      scanErrorKind(
        "Spotify refresh token was revoked or expired. User must reconnect.",
      ),
    ).toBe("signed_out");
    expect(
      scanErrorKind(
        "Spotify 401 on https://api.spotify.com/v1/me/tracks?limit=50: {}",
      ),
    ).toBe("signed_out");
    expect(scanErrorKind("Failed to fetch liked songs fingerprint: 401")).toBe(
      "signed_out",
    );
  });

  it("reads EMPTY_LIBRARY as nothing to read", () => {
    expect(scanErrorKind("EMPTY_LIBRARY")).toBe("empty");
  });

  // A URL or Spotify's JSON body can carry a 401 or 429 of its own.
  it("ignores status-like numbers inside the URL and the response body", () => {
    expect(
      scanErrorKind(
        "Spotify 500 on https://api.spotify.com/v1/playlists/x/tracks?offset=401&limit=429: {}",
      ),
    ).toBe("other");
    expect(
      scanErrorKind('Spotify 502 on https://x.test/a: {"retry":401,"n":429}'),
    ).toBe("other");
  });

  it("calls anything else, and a dropped stream, other", () => {
    expect(scanErrorKind("Spotify refresh failed: 503 upstream")).toBe("other");
    expect(scanErrorKind("unknown")).toBe("other");
    expect(scanErrorKind(null)).toBe("other");
  });
});
