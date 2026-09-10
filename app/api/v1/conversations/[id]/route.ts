import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.id))
    .limit(1);

  if (!conversation || conversation.organizationId !== tenant.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt);

  return NextResponse.json({ ...conversation, messages: msgs });
}
