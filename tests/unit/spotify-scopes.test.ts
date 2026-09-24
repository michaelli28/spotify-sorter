import { describe, it, expect } from "vitest";
import { SCOPE_STRING } from "@/src/lib/spotify/scopes";
import { buildAuthorizeUrl } from "@/src/lib/spotify/auth";

// "Remove SpotifySorter playlists" calls DELETE /me/library. Spotify's
// reference lists these three scopes for it without saying which one a
// playlist needs, so the app asks for all three (unverified live).
const REMOVE_PLAYLIST_SCOPES = [
  "user-library-modify",
  "user-follow-modify",
  "playlist-modify-public",
];

describe("Spotify scopes", () => {
  it("asks for every scope removing a playlist from the library may need", () => {
    const scopes = SCOPE_STRING.split(" ");
    for (const scope of REMOVE_PLAYLIST_SCOPES) expect(scopes).toContain(scope);
  });

  it("keeps the scopes Apply and covers already use", () => {
    expect(SCOPE_STRING.split(" ")).toEqual(
      expect.arrayContaining([
        "playlist-read-private",
        "playlist-modify-private",
        "ugc-image-upload",
      ]),
    );
  });

  it("sends them in the authorize URL, space-separated", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "c",
        redirectUri: "http://127.0.0.1:3000/cb",
        challenge: "x",
        state: "s",
      }),
    );
    expect(url.searchParams.get("scope")).toBe(SCOPE_STRING);
    expect(SCOPE_STRING).not.toMatch(/\s{2}|^\s|\s$/);
  });
});
