import { spotifyApi } from "./urls";
import { withRetry429 } from "./retry";

// Spotify's cap on the request body: "Base64 encoded JPEG image data, maximum
// payload size is 256 KB". The browser steps JPEG quality down to fit it.
export const MAX_COVER_BASE64_BYTES = 256 * 1024;

// Sets a playlist's cover. Needs the ugc-image-upload scope: tokens granted
// before it was added get 401/403 until the owner reconnects. Never run live.
export async function uploadPlaylistCover(
  playlistId: string,
  jpegBase64: string,
  accessToken: string,
): Promise<void> {
  await withRetry429(async () => {
    const r = await fetch(
      spotifyApi(`/playlists/${encodeURIComponent(playlistId)}/images`),
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "image/jpeg",
        },
        body: jpegBase64,
      },
    );
    if (!r.ok) {
      const err = new Error(`uploadPlaylistCover ${r.status}`);
      (err as { status?: number }).status = r.status;
      (err as { headers?: Headers }).headers = r.headers;
      throw err;
    }
  });
}
