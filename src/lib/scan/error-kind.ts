export type ScanErrorKind = "rate_limited" | "signed_out" | "empty" | "other";

/**
 * Sorts the scan stream's raw error message into what the user can do about
 * it. `null` is a dropped connection, which carries no message.
 */
export function scanErrorKind(message: string | null): ScanErrorKind {
  if (message === null) return "other";
  if (message === "EMPTY_LIBRARY") return "empty";
  // Only the prose is read: the URL and Spotify's JSON body can hold a 401 or
  // 429 that isn't the response's status.
  const prose = message
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\{[\s\S]*$/, "");
  if (/No Spotify auth|revoked or expired|\b401\b/i.test(prose)) {
    return "signed_out";
  }
  if (/\b429\b|rate.?limit/i.test(prose)) return "rate_limited";
  return "other";
}
