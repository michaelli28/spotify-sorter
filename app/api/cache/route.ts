import { NextResponse } from "next/server";
import { join } from "node:path";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";

function cachePath(): string {
  return join(
    process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data"),
    "cache.json",
  );
}

export async function GET() {
  const cache = await readCache(cachePath());
  const { auth, ...safe } = cache;
  return NextResponse.json({
    ...safe,
    auth: auth ? { has_token: true, expires_at: auth.expires_at } : null,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const current = await readCache(cachePath());
  const patched = patchCache(current, body);
  await writeCache(cachePath(), patched);
  return NextResponse.json({ ok: true });
}
