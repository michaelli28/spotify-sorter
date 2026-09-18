import { NextResponse } from "next/server";
import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { env } from "@/src/lib/config/env";
import { exchangeCodeForToken } from "@/src/lib/spotify/auth";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";

const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback";

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((s) => s.trim().split("=") as [string, string])
      .filter((p) => p[0]),
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      `http://127.0.0.1:3000/?error=denied&detail=${encodeURIComponent(error)}`,
      307,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state)
    return NextResponse.json(
      { error: "missing code or state" },
      { status: 400 },
    );

  const cookies = parseCookies(req.headers.get("cookie"));
  if (cookies.sorter_oauth_state !== state) {
    return NextResponse.json({ error: "state mismatch" }, { status: 400 });
  }
  const verifier = cookies.sorter_pkce_verifier;
  if (!verifier)
    return NextResponse.json(
      { error: "missing verifier cookie" },
      { status: 400 },
    );

  const tokens = await exchangeCodeForToken({
    clientId: env().SPOTIFY_CLIENT_ID,
    code,
    verifier,
    redirectUri: REDIRECT_URI,
  });

  const cachePath = join(dataDir(), "cache.json");
  const current = await readCache(cachePath);
  await writeCache(
    cachePath,
    patchCache(current, {
      auth: {
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
      },
    }),
  );

  const res = NextResponse.redirect("http://127.0.0.1:3000/scope", 307);
  res.headers.append(
    "set-cookie",
    `sorter_access_token=${tokens.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
  );
  res.headers.append("set-cookie", `sorter_pkce_verifier=; Path=/; Max-Age=0`);
  res.headers.append("set-cookie", `sorter_oauth_state=; Path=/; Max-Age=0`);
  return res;
}
