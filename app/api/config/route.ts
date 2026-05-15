import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readCache, writeCache, patchCache } from "@/src/lib/cache";

const Body = z.object({
  spotify_client_id: z.string().min(20),
  anthropic_api_key: z.string().regex(/^sk-ant-/),
  prefix: z.string().min(1).max(8),
});

function dataDir(): string {
  return process.env.SORTER_DATA_DIR ?? join(process.cwd(), "data");
}

function envFile(): string {
  return process.env.SORTER_ENV_FILE ?? join(process.cwd(), ".env.local");
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { spotify_client_id, anthropic_api_key, prefix } = parsed.data;

  const envContent = `SPOTIFY_CLIENT_ID=${spotify_client_id}\nANTHROPIC_API_KEY=${anthropic_api_key}\n`;
  await writeFile(envFile(), envContent, "utf-8");

  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const cachePath = join(dir, "cache.json");
  const current = await readCache(cachePath);
  await writeCache(
    cachePath,
    patchCache(current, { config: { ...current.config, prefix } }),
  );

  return NextResponse.json({ ok: true });
}
