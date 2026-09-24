/** The `error` code of a JSON error answer, if it has one. */
export function errorCode(body: unknown): unknown {
  return typeof body === "object" && body !== null && "error" in body
    ? body.error
    : undefined;
}

// The Spotify write routes' shared refusal (spec §7.2, §8.2): a token without
// the scope, or a revoked one. Only reconnecting helps, so never offer Retry.
export function needsReconnect(status: number, body: unknown): boolean {
  const error = errorCode(body);
  return (
    (status === 403 && error === "missing_scope") ||
    (status === 401 && error === "reconnect")
  );
}
