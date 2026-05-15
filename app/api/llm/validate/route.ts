import { NextResponse } from "next/server";
import { z } from "zod";
import { validateAnthropicKey } from "@/src/lib/llm/client";

const Body = z.object({ apiKey: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "bad request" },
      { status: 400 },
    );
  return NextResponse.json(await validateAnthropicKey(parsed.data.apiKey));
}
