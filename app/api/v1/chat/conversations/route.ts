import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveChatTenant } from "@/lib/chat-turn";
import { listCustomerChats, verifiedEmailFor } from "@/lib/customer-chat-history";

// Reads the DB per request, never prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The website chat's history drawer: this customer's earlier chats from the last 30 days. Public like the rest of the
 * widget API, so it is scoped to the site token's organization, and it answers only a customer whose email was checked
 * with a code (by the verified chat they are in, or the token this device kept). Anyone else gets an empty list marked
 * not available, never an error that says which part failed. Sent as POST so the device token stays out of the URL.
 */
export async function POST(req: NextRequest) {
  const tenant = await resolveChatTenant(req);
  // Customer history belongs to the website chat. A manager's sign-in (the Playground) has no customer to list for.
  if (!tenant || tenant.source !== "widget") return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { conversation_id?: unknown; remember_token?: unknown } | null;
  const email = await verifiedEmailFor({ organizationId: tenant.orgId, conversationId: body?.conversation_id, rememberToken: body?.remember_token });
  if (!email) return NextResponse.json({ available: false, conversations: [] });

  const chats = await listCustomerChats(tenant.orgId, email);
  return NextResponse.json({
    available: true,
    conversations: chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      resolved: chat.resolved,
      waiting_for_team: chat.waitingForTeam,
      ticket_key: chat.ticketKey,
      last_message_at: chat.lastMessageAt,
    })),
  });
}
