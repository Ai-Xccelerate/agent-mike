import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors, isUniqueViolation, workerPatchSchema } from "@/lib/worker-patch";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = workerPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  }

  try {
    const [updated] = await db
      .update(workerProfiles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(workerProfiles.id, profile.id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ errors: { slug: "That slug is already in use" } }, { status: 422 });
    }
    throw error;
  }
}
