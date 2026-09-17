import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile, getOrganizationName } from "@/lib/bootstrap";
import { fieldErrors, isUniqueViolation, workerPatchSchema } from "@/lib/worker-patch";
import {
  listSkillsForOrg,
  VERIFY_CUSTOMER_SKILL_ID,
} from "@/lib/tools-integrations/skills-catalog";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const [profile, organizationName] = await Promise.all([
    getOrCreateProfile(tenant.orgId),
    getOrganizationName(tenant.orgId),
  ]);
  return NextResponse.json({ ...profile, organizationName });
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
  const catalog = await listSkillsForOrg(tenant.orgId, profile.enabledSkills ?? []);
  const byId = new Map(catalog.map((skill) => [skill.id, skill]));
  const alreadyEnabled = new Set(profile.enabledSkills ?? []);
  const updates: typeof parsed.data = { ...parsed.data };

  if (parsed.data.enabledSkills) {
    const unknown = parsed.data.enabledSkills.filter((id) => !byId.has(id));
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

    // Only what is being switched on *now* is held to this. A skill that was
    // enabled while its integration was connected must still be storable after
    // that connection goes away, or an unrelated edit on the Skills screen
    // starts failing for a reason the manager cannot see. Those are handled at
    // chat time instead, where they drop out of the prompt.
    const turningOn = parsed.data.enabledSkills.filter((id) => !alreadyEnabled.has(id));
    const unmet = turningOn.filter((id) => byId.get(id)?.requirementsMet === false);
    if (unmet.length > 0) {
      const names = unmet.map((id) => byId.get(id)?.name ?? id);
      return NextResponse.json(
        {
          error: "Skill requirements not met",
          errors: {
            enabledSkills: `${names.join(", ")} needs an integration that is not connected. Connect it under Settings > Integrations first.`,
          },
        },
        { status: 422 },
      );
    }
  }

  // The verification guardrail is the Verify customer skill. Turning it on has
  // to actually switch that skill on, otherwise the manager is left with a
  // notice and a switch they still have to go and find — which is not a
  // default. Only the transition does this: once it is on, the manager stays
  // free to turn the skill off from Settings > Skills and have it stay off.
  const turningVerificationOn =
    parsed.data.requireUserVerification === true && !profile.requireUserVerification;

  if (turningVerificationOn) {
    const verifySkill = byId.get(VERIFY_CUSTOMER_SKILL_ID);
    if (!verifySkill?.requirementsMet) {
      return NextResponse.json(
        {
          error: "Verification requires a CRM",
          errors: {
            requireUserVerification:
              "Connect a CRM under Settings > Integrations first — verification works by looking the customer up in it.",
          },
        },
        { status: 422 },
      );
    }
    const next = parsed.data.enabledSkills ?? profile.enabledSkills ?? [];
    if (!next.includes(VERIFY_CUSTOMER_SKILL_ID)) {
      updates.enabledSkills = [...next, VERIFY_CUSTOMER_SKILL_ID];
    }
  }

  // Turning it off deliberately leaves enabledSkills alone: the manager may
  // have rewritten the skill and still want it running. The screen says so
  // rather than letting them assume verification stopped.

  try {
    const [updated] = await db
      .update(workerProfiles)
      .set({ ...updates, updatedAt: new Date() })
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
