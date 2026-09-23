import { NextResponse } from "next/server";
import { z } from "zod";
import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";

function cachePath(): string {
  return join(dataDir(), "cache.json");
}

export async function GET() {
  try {
    const cache = await readCache(cachePath());
    const { auth, ...safe } = cache;
    return NextResponse.json({
      ...safe,
      auth: auth ? { has_token: true, expires_at: auth.expires_at } : null,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "CacheVersionMismatch") {
      return NextResponse.json(
        { error: "cache_version_mismatch" },
        { status: 409 },
      );
    }
    throw err;
  }
}

const CLEARABLE = new Set(["categories", "assignments", "runs"]);

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const current = await readCache(cachePath());
  const clearKeys = Array.isArray((body as { _clear?: unknown })._clear)
    ? ((body as { _clear: unknown[] })._clear.filter(
        (k): k is string => typeof k === "string" && CLEARABLE.has(k),
      ) as Array<"categories" | "assignments" | "runs">)
    : [];
  const cleared = clearKeys.reduce(
    (acc, key) => ({
      ...acc,
      [key]: key === "runs" ? [] : {},
    }),
    current,
  );
  const { _clear: _omit, ...rest } = body as Record<string, unknown>;
  const patched = patchCache(cleared, rest);
  try {
    await writeCache(cachePath(), patched);
  } catch (err) {
    // writeCache validates before it writes, and the stored cache already
    // passed readCache, so a schema error here came from the body.
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
