import { NextResponse } from "next/server";
import { readAppStatus } from "@/src/lib/status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readAppStatus());
}
