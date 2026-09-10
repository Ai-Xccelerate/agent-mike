import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  // Chat's rail asks for ?channel=chat (the manager's own test conversations,
  // as opposed to real "widget"/"email" traffic) — Inbox omits this and gets
  // everything. Same table, same endpoint, no schema change needed: the
  // channel a conversation came in on already distinguishes test from real.
  const channel = req.nextUrl.searchParams.get("channel");

  const rows = await db
    .select()
    .from(conversations)
    .where(
      channel
        ? and(eq(conversations.organizationId, tenant.orgId), eq(conversations.channel, channel))
        : eq(conversations.organizationId, tenant.orgId),
    )
    .orderBy(desc(conversations.updatedAt));

  const withMessages = await Promise.all(
    rows.map(async (conversation) => {
      const msgs = await db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, conversation.id)))
        .orderBy(messages.createdAt);
      return { ...conversation, messages: msgs };
    }),
  );

  return NextResponse.json(withMessages);
}
