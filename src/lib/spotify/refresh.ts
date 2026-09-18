import type { TokenResult } from "./auth";
import { spotifyAccounts } from "./urls";

export class RefreshRevokedError extends Error {
  constructor() {
    super("Spotify refresh token was revoked or expired. User must reconnect.");
    this.name = "RefreshRevokedError";
  }
}

export async function refreshAccessToken(p: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
    client_id: p.clientId,
  });
  const r = await fetch(spotifyAccounts("/api/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (r.status === 400) {
    const txt = await r.text();
    if (txt.includes("invalid_grant")) throw new RefreshRevokedError();
    throw new Error(`Spotify refresh failed: 400 ${txt}`);
  }
  if (!r.ok)
    throw new Error(`Spotify refresh failed: ${r.status} ${await r.text()}`);
  const json = (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? p.refreshToken,
    token_type: json.token_type,
    scope: json.scope,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}
