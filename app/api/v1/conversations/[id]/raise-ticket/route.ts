import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { toHistoryTurns } from "@/lib/customer-turn";
import { handoffTicketNotice, helpdeskRaisesTickets, isHandoffTicket, recordHandoffInJira } from "@/lib/tools-integrations/atlassian";

export const dynamic = "force-dynamic";

/**
 * A manager raises the helpdesk ticket for a conversation themselves, for a customer who could not finish the emailed
 * code (or whose handover was held waiting for it). The ticket carries what the customer typed, marked as not verified,
 * and is raised in the worker's own helpdesk account rather than on the customer's behalf.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only an admin can raise a ticket" }, { status: 403 });

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, params.id)).limit(1);
  if (!conversation || conversation.organizationId !== tenant.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conversation.externalTicketKey) {
    return NextResponse.json({ error: `This conversation already has ticket ${conversation.externalTicketKey}`, key: conversation.externalTicketKey }, { status: 409 });
  }
  if (!(await helpdeskRaisesTickets(tenant.orgId))) {
    return NextResponse.json({ error: "Ticket raising is not switched on for the helpdesk. Turn on raising tickets in Integrations first." }, { status: 409 });
  }

  const profile = await getOrCreateProfile(tenant.orgId);
  const thread = await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt));
  const latestCustomer = [...thread].reverse().find((message) => message.senderType === "customer");

  const outcome = await recordHandoffInJira({
    organizationId: tenant.orgId,
    workerName: profile.displayName,
    conversation,
    transcript: toHistoryTurns(thread),
    latestMessage: latestCustomer?.body ?? conversation.subject ?? "",
    raisedByManager: true,
  }).catch((error: unknown) => ({ failed: error instanceof Error ? error.message : "The helpdesk could not be reached" }));

  if (!outcome || !isHandoffTicket(outcome)) {
    return NextResponse.json({ error: outcome && "failed" in outcome ? outcome.failed : "No ticket was raised" }, { status: 502 });
  }
  if (conversation.status !== "needs_human") {
    await db.update(conversations).set({ status: "needs_human" }).where(eq(conversations.id, conversation.id));
  }
  return NextResponse.json({ key: outcome.key, title: outcome.title ?? null, requestType: outcome.requestType ?? null, notice: handoffTicketNotice(outcome) });
}
