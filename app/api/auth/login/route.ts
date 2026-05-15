import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/src/lib/config/env";
import { createVerifier, deriveChallenge } from "@/src/lib/spotify/pkce";
import { buildAuthorizeUrl } from "@/src/lib/spotify/auth";

const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback";

export async function GET(_req: Request) {
  const verifier = createVerifier();
  const challenge = await deriveChallenge(verifier);
  const state = randomBytes(16).toString("base64url");

  const url = buildAuthorizeUrl({
    clientId: env().SPOTIFY_CLIENT_ID,
    redirectUri: REDIRECT_URI,
    challenge,
    state,
  });

  const res = NextResponse.redirect(url, 307);
  const cookieOpts = "Path=/; HttpOnly; SameSite=Lax; Max-Age=600";
  res.headers.append(
    "set-cookie",
    `sorter_pkce_verifier=${verifier}; ${cookieOpts}`,
  );
  res.headers.append(
    "set-cookie",
    `sorter_oauth_state=${state}; ${cookieOpts}`,
  );
  return res;
}
