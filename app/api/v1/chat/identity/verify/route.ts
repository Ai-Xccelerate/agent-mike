import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { resolveChatTenant } from "@/lib/chat-turn";
import { IDENTITY_LIMITS, verifyCode } from "@/lib/customer-identity";
import { isPlaceholderCustomerName } from "@/lib/customer-name";
import { issueRememberToken } from "@/lib/remembered-customer";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/** The code card's submit: a right code marks the conversation's email verified. */
export async function POST(req: NextRequest) {
  const tenant = await resolveChatTenant(req);
  if (!tenant) return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { conversation_id?: unknown; code?: unknown } | null;
  const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : "";
  const code = typeof body?.code === "string" ? body.code : "";

  const [conversation] = conversationId
    ? await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, tenant.orgId)))
        .limit(1)
    : [];
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const result = await verifyCode({ organizationId: tenant.orgId, conversationId: conversation.id, code });
  switch (result.status) {
    case "verified": {
      const [verified] = await db
        .select({ name: conversations.customerName })
        .from(conversations)
        .where(and(eq(conversations.id, conversation.id), eq(conversations.organizationId, tenant.orgId)))
        .limit(1);
      const name = verified?.name && !isPlaceholderCustomerName(verified.name) ? verified.name : null;
      // Kept by the widget on this device so the next visit does not ask for another code.
      const remember = issueRememberToken(tenant.orgId, { email: result.email, name });
      return NextResponse.json({ ok: true, verified: true, ...(remember ? { remember_token: remember, name } : {}) });
    }
    case "wrong":
      return NextResponse.json({ error: "That code isn't right", attempts_left: result.attemptsLeft }, { status: 422 });
    case "expired":
      return NextResponse.json({ error: "expired" }, { status: 410 });
    case "locked":
      return NextResponse.json({ error: "Too many wrong codes. Ask for a new one.", attempts_left: 0 }, { status: 422 });
    default:
      return NextResponse.json({ error: "No code is waiting. Ask for a new one.", attempts_left: IDENTITY_LIMITS.maxAttempts }, { status: 422 });
  }
}
