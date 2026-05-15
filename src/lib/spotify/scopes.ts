export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "user-library-read",
  "user-read-private",
] as const;

export const SCOPE_STRING = SPOTIFY_SCOPES.join(" ");
