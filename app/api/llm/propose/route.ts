import { NextResponse } from "next/server";
import { runProposeFromCache } from "@/src/lib/pipeline/propose";
import { env } from "@/src/lib/config/env";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runProposeFromCache({
      apiKey: env().ANTHROPIC_API_KEY,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
