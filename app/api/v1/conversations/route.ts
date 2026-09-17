import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  // Chat's rail asks for ?channel=chat (the manager's own test conversations,
  // as opposed to real "widget"/"email" traffic). Inbox omits this param and
  // should only ever see real customer traffic, so the default (no explicit
  // channel) excludes chat rather than returning every channel — otherwise a
  // manager's own Playground sessions show up mixed into real tickets.
  const channel = req.nextUrl.searchParams.get("channel");

  const rows = await db
    .select()
    .from(conversations)
    .where(
      channel
        ? and(eq(conversations.organizationId, tenant.orgId), eq(conversations.channel, channel))
        : and(eq(conversations.organizationId, tenant.orgId), ne(conversations.channel, "chat")),
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
