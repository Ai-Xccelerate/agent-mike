import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerUsers } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const rows = await db.select().from(workerUsers).where(eq(workerUsers.organizationId, tenant.orgId));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = body?.email as string | undefined;
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const [created] = await db
    .insert(workerUsers)
    .values({
      organizationId: tenant.orgId,
      email,
      name: (body?.name as string | undefined) ?? null,
      role: (body?.role as string | undefined) ?? "member",
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
