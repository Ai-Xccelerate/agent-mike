import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { INTERNAL_CONVERSATION_CHANNELS } from "@/lib/assistant-agent";
import { withNormalizedCitations } from "@/lib/citations";
import { feedbackForConversations } from "@/lib/answer-feedback";
import { extractStatedCustomer } from "@/lib/customer-stated";
import { lacksVerifiedCustomer } from "@/lib/tickets";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  // Playground's rail asks for ?channel=chat and the Assistant's history
  // panel asks for ?channel=assistant (each the manager's own conversations
  // with a specific internal surface) — Inbox omits channel entirely and
  // should see neither, only real "widget"/"email" customer traffic. Same
  // table, same endpoint, no schema change needed: the channel a
  // conversation came in on already distinguishes internal from real.
  const channel = req.nextUrl.searchParams.get("channel");
  // Archived conversations (soft-deleted, restorable) are hidden unless a
  // caller explicitly asks to include them — same "hidden by default" model
  // as the channel exclusion above, just for a different reason.
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";

  const scopeCondition = channel
    ? and(eq(conversations.organizationId, tenant.orgId), eq(conversations.channel, channel))
    : and(
        eq(conversations.organizationId, tenant.orgId),
        notInArray(conversations.channel, [...INTERNAL_CONVERSATION_CHANNELS]),
      );

  const rows = await db
    .select()
    .from(conversations)
    .where(includeArchived ? scopeCondition : and(scopeCondition, eq(conversations.archived, false)))
    .orderBy(desc(conversations.updatedAt));

  // The managers' ratings of these conversations' replies, in one query rather than one per conversation.
  const ratings = await feedbackForConversations(tenant.orgId, rows.map((row) => row.id), tenant.userId);

  const withMessages = await Promise.all(
    rows.map(async (conversation) => {
      const msgs = await db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, conversation.id)))
        .orderBy(messages.createdAt);
      return {
        ...conversation,
        messages: msgs.map(withNormalizedCitations),
        feedback: ratings.get(conversation.id) ?? [],
        // What the customer typed about themselves, shown (marked unverified) when no name or email was verified.
        customerStated: lacksVerifiedCustomer(conversation)
          ? extractStatedCustomer(msgs.filter((message) => message.senderType === "customer").map((message) => message.body))
          : null,
      };
    }),
  );

  return NextResponse.json(withMessages);
}
