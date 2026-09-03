import { NextResponse } from "next/server";
import { assertLocalBypassSafe } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  assertLocalBypassSafe();
  return NextResponse.json({ status: "ok", service: "mike-api" });
}
