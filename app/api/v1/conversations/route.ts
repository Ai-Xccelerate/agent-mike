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

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.organizationId, tenant.orgId))
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
