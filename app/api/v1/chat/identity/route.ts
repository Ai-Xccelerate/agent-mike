import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { resolveChatTenant } from "@/lib/chat-turn";
import {
  clientIp,
  identityInputSchema,
  IDENTITY_LIMITS,
  normalizeIdentityMode,
  requestVerificationCode,
  saveCustomerIdentity,
} from "@/lib/customer-identity";
import { lookupJiraCustomerByEmail } from "@/lib/tools-integrations/atlassian";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The identity card's submit: saves the visitor's name and email on the
 * conversation, and in email_code mode emails them a 6-digit code (also how
 * "Resend code" works; the limits in lib/customer-identity.ts apply).
 *
 * Public with the widget's site token, like /api/v1/chat. The conversation must
 * belong to the caller's organization: a foreign or unknown id is a plain 404.
 */
export async function POST(req: NextRequest) {
  const tenant = await resolveChatTenant(req);
  if (!tenant) return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { conversation_id?: unknown; name?: unknown; email?: unknown } | null;
  const parsed = identityInputSchema.safeParse({ name: body?.name ?? "", email: body?.email ?? "" });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return NextResponse.json({ error: "Check your details", errors }, { status: 422 });
  }

  const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : "";
  const [conversation] = conversationId
    ? await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, tenant.orgId)))
        .limit(1)
    : [];
  if (!conversation || conversation.channel === "email" || conversation.channel === "assistant") {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const profile = await getOrCreateProfile(tenant.orgId);
  const mode = normalizeIdentityMode(profile.identityMode);
  if (mode === "off") return NextResponse.json({ error: "Customer identity is switched off" }, { status: 400 });

  const { name, email } = parsed.data;

  if (mode === "email_match") {
    await saveCustomerIdentity({ organizationId: tenant.orgId, conversation, name, email });
    // Informational only: an address Jira knows is not proof the visitor owns it.
    const known = await lookupJiraCustomerByEmail(tenant.orgId, email);
    return NextResponse.json({ ok: true, mode, next: "done", known_customer: known, resend_in: 0 });
  }

  // email_code: the address is saved as said, and trusted only once the code comes back.
  const sent = await requestVerificationCode({
    organizationId: tenant.orgId,
    conversationId: conversation.id,
    email,
    ip: clientIp(req),
  });
  if (sent.status === "limited") {
    return NextResponse.json(
      { error: "Too many codes requested. Try again shortly.", retry_after: sent.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(sent.retryAfterSeconds) } },
    );
  }
  if (sent.status === "failed") {
    return NextResponse.json({ error: sent.reason }, { status: 502 });
  }
  await saveCustomerIdentity({ organizationId: tenant.orgId, conversation, name, email });
  return NextResponse.json({
    ok: true,
    mode,
    next: "code",
    known_customer: null,
    resend_in: sent.resendInSeconds,
    expires_in: IDENTITY_LIMITS.codeTtlMs / 1000,
  });
}
