import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { runAssistantTurn } from "@/lib/assistant-turn";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The admin assistant's own chat endpoint — deliberately not the customer
 * chat route. That route simulates how the worker answers a customer
 * (guardrails, escalation, "I'm bringing in {manager}"); this one is the
 * manager asking their own assistant a question, answered by a distinct
 * agent (lib/assistant-agent.ts) with read-only tools over the org's data.
 * One JSON response per turn; /api/v1/assistant/agui streams the same turn
 * (lib/assistant-turn.ts) as AG-UI events for the Assistant page.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const outcome = await runAssistantTurn(req, tenant, body);
  if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status });
  return NextResponse.json(outcome.response);
}
