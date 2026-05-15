import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl } from "@/src/lib/spotify/auth";

describe("buildAuthorizeUrl", () => {
  it("builds a URL with all required params", () => {
    const url = buildAuthorizeUrl({
      clientId: "client123",
      redirectUri: "http://127.0.0.1:3000/api/auth/callback",
      challenge: "abcXYZ",
      state: "state-token",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://accounts.spotify.com/authorize",
    );
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("client123");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:3000/api/auth/callback",
    );
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe("abcXYZ");
    expect(u.searchParams.get("state")).toBe("state-token");
    expect(u.searchParams.get("scope")).toContain("playlist-modify-private");
  });
});
