import { NextResponse } from "next/server";
import { rejectUnlessFromApp } from "@/src/lib/http/same-origin";
import { z } from "zod";
import { runReclassifyForNewCategories } from "@/src/lib/pipeline/reclassify";
import { env } from "@/src/lib/config/env";

const Body = z.object({ newCategoryIds: z.array(z.string()).min(1) });

export async function POST(req: Request) {
  const blocked = rejectUnlessFromApp(req);
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const result = await runReclassifyForNewCategories({
    apiKey: env().ANTHROPIC_API_KEY,
    newCategoryIds: parsed.data.newCategoryIds,
  });
  return NextResponse.json(result);
}
