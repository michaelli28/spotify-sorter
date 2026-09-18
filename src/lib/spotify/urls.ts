// Single source for Spotify hosts. The e2e suite points both at a local mock
// server so the Next server never reaches real Spotify during tests.
export function spotifyApi(path: string): string {
  return `${process.env.SPOTIFY_API_BASE ?? "https://api.spotify.com/v1"}${path}`;
}

export function spotifyAccounts(path: string): string {
  return `${process.env.SPOTIFY_ACCOUNTS_BASE ?? "https://accounts.spotify.com"}${path}`;
}
