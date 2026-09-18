import { SCOPE_STRING } from "./scopes";
import { spotifyAccounts } from "./urls";

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}

export function buildAuthorizeUrl(params: AuthorizeParams): string {
  const u = new URL(spotifyAccounts("/authorize"));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", params.challenge);
  u.searchParams.set("state", params.state);
  u.searchParams.set("scope", SCOPE_STRING);
  return u.toString();
}

export interface ExchangeParams {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}

export interface TokenResult {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(
  p: ExchangeParams,
): Promise<TokenResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.verifier,
  });
  const r = await fetch(spotifyAccounts("/api/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Spotify token exchange failed: ${r.status} ${txt}`);
  }
  const json = (await r.json()) as {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    token_type: json.token_type,
    scope: json.scope,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}
