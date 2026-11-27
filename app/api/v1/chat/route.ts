import { startIdleSweep } from "@/lib/idle-check-in";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runChatRequest } from "@/lib/chat-turn";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Also started here, in case the server came up without a health check (lib/idle-check-in.ts).
  startIdleSweep();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const outcome = await runChatRequest(req, body);
  return NextResponse.json(outcome.json, { status: outcome.status });
}
