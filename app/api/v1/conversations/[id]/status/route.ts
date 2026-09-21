import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { conversations } from "@/db/schema";
import { db } from "@/lib/db";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { getIdentityAdapter } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["open", "resolved", "needs_human", "human_active", "closed"]);

/** Legacy Mike status endpoint retained alongside the Foundation PATCH route. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const requested = req.nextUrl.searchParams.get("conversation_status");
  if (!requested || !ALLOWED.has(requested)) {
    return NextResponse.json(
      { error: `Status must be one of ${[...ALLOWED].sort().join(", ")}` },
      { status: 422 },
    );
  }

  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.id))
    .limit(1);
  if (!existing || existing.organizationId !== tenant.orgId) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const humanControlled = requested === "human_active";
  const profile = humanControlled ? await getOrCreateProfile(tenant.orgId) : null;
  const [updated] = await db
    .update(conversations)
    .set({
      status: humanControlled ? "needs_human" : requested,
      humanControlled,
      ...(profile ? { assignedTo: profile.managerName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, existing.id))
    .returning();
  return NextResponse.json(updated);
}
