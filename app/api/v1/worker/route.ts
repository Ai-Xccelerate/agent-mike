import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors, isUniqueViolation, workerPatchSchema } from "@/lib/worker-patch";
import { listSkillsForOrg } from "@/lib/tools-integrations/skills-catalog";

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

  // Skills exist in the catalog on disk or in this org's custom skills, so
  // whether an id is real cannot be decided by the schema alone. Without this
  // the column happily stored ids that match nothing — harmless at chat time,
  // since unknown ids are filtered out, but it means the screen can show a
  // worker as having skills it does not have.
  if (parsed.data.enabledSkills) {
    const known = new Set((await listSkillsForOrg(tenant.orgId, [])).map((skill) => skill.id));
    const unknown = parsed.data.enabledSkills.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return NextResponse.json(
        {
          error: "Unknown skill",
          errors: {
            enabledSkills: `No such skill: ${unknown.join(", ")}. Enable only skills listed in Settings > Skills.`,
          },
        },
        { status: 422 },
      );
    }
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
