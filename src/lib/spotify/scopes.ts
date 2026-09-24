export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "user-library-read",
  "user-read-private",
  // Playlist covers on Apply. Tokens granted before this was added can't
  // upload until the owner reconnects once.
  "ugc-image-upload",
  // "Remove SpotifySorter playlists" (DELETE /me/library). Spotify lists all
  // three for that endpoint without saying which a playlist needs, so ask for
  // all of them (unverified live). Older tokens need one reconnect.
  "user-library-modify",
  "user-follow-modify",
  "playlist-modify-public",
] as const;

export const SCOPE_STRING = SPOTIFY_SCOPES.join(" ");
