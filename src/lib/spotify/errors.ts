// A failed Spotify answer as an Error that keeps its status and headers:
// withRetry429 reads both, and the routes map 401/403 to "missing_scope".
export function spotifyError(message: string, res: Response): Error {
  return Object.assign(new Error(message), {
    status: res.status,
    headers: res.headers,
  });
}
