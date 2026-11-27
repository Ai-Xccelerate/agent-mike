import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveChatTenant } from "@/lib/chat-turn";
import { recordVisitorActivity, startIdleSweep, runIdleCheckIn } from "@/lib/idle-check-in";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The website chat asking whether its idle check-in is due (lib/idle-check-in.ts). The widget only says which stage it
 * thinks is next; the server decides from the stored messages' times, posts at most once, and says { due: false }
 * otherwise (too early, already done, the setting off, or a conversation it never applies to).
 */
export async function POST(req: NextRequest) {
  // Also started here, in case the server came up without a health check (lib/idle-check-in.ts).
  startIdleSweep();
  const tenant = await resolveChatTenant(req);
  if (!tenant) return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { conversation_id?: unknown; stage?: unknown } | null;
  const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : "";
  const stage = body?.stage === "nudge" || body?.stage === "close" || body?.stage === "activity" ? body.stage : null;
  if (!stage) return NextResponse.json({ error: "stage must be nudge, close or activity" }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  // The visitor is typing: the check-in counts from now (the widget sends this at most every 20 seconds).
  if (stage === "activity") {
    const found = await recordVisitorActivity({ organizationId: tenant.orgId, conversationId });
    return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const outcome = await runIdleCheckIn({ organizationId: tenant.orgId, conversationId, stage });
  if (!outcome) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (!outcome.due) {
    return NextResponse.json({
      due: false,
      ...(outcome.status ? { status: outcome.status } : {}),
      ...(outcome.dueInSeconds !== undefined ? { due_in_seconds: outcome.dueInSeconds } : {}),
    });
  }
  // Only what the visitor sees in the chat, as /chat/messages returns it.
  const { message } = outcome;
  return NextResponse.json({
    due: true,
    status: outcome.status,
    message: {
      id: message.id,
      conversationId: message.conversationId,
      senderType: message.senderType,
      senderName: message.senderName,
      body: message.body,
      citations: message.citations,
      cards: message.cards,
      createdAt: message.createdAt,
    },
  });
}
