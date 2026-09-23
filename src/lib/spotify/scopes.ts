export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "user-library-read",
  "user-read-private",
  // Playlist covers on Apply. Tokens granted before this was added can't
  // upload until the owner reconnects once.
  "ugc-image-upload",
] as const;

export const SCOPE_STRING = SPOTIFY_SCOPES.join(" ");
