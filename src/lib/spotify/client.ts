import { join } from "node:path";
import { env } from "@/src/lib/config/env";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";
import { refreshAccessToken } from "./refresh";

export interface Session {
  accessToken: string;
  accessTokenExpiresAt: number;
}

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

export async function ensureFreshToken(
  session: Session | undefined,
): Promise<string> {
  if (session && session.accessTokenExpiresAt > Date.now() + 30_000) {
    return session.accessToken;
  }
  const cachePath = join(dataDir(), "cache.json");
  const cache = await readCache(cachePath);
  if (!cache.auth)
    throw new Error("No Spotify auth in cache. User must connect.");
  const fresh = await refreshAccessToken({
    clientId: env().SPOTIFY_CLIENT_ID,
    refreshToken: cache.auth.refresh_token,
  });
  await writeCache(
    cachePath,
    patchCache(cache, {
      auth: {
        refresh_token: fresh.refresh_token,
        expires_at: fresh.expires_at,
      },
    }),
  );
  return fresh.access_token;
}

export async function withSpotify<T>(
  session: Session | undefined,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const token = await ensureFreshToken(session);
  return fn(token);
}
