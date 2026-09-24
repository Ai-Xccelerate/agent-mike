import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors, isUniqueViolation, workerPatchSchema } from "@/lib/worker-patch";
import { listSkillsForOrg, VERIFY_CUSTOMER_SKILL_ID } from "@/lib/tools-integrations/skills-catalog";

type Profile = typeof workerProfiles.$inferSelect;

export type WorkerPatchResult =
  | { ok: true; profile: Profile }
  | { ok: false; status: number; error: string; errors: Record<string, string> };

/**
 * The one way worker settings get saved: Settings' PATCH /worker and the
 * admin Assistant's approved changes both come through here, so the rules
 * below (skill checks, the verification guardrail, slug uniqueness) can
 * never be bypassed by one path and enforced by the other.
 */
export async function applyWorkerPatch(organizationId: string, body: unknown): Promise<WorkerPatchResult> {
  const profile = await getOrCreateProfile(organizationId);

  const parsed = workerPatchSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 422, error: "Invalid payload", errors: fieldErrors(parsed.error) };
  }

  // Skills exist in the catalog on disk or in this org's custom skills, so
  // whether an id is real cannot be decided by the schema alone. Without this
  // the column happily stored ids that match nothing — harmless at chat time,
  // since unknown ids are filtered out, but it means the screen can show a
  // worker as having skills it does not have.
  const catalog = await listSkillsForOrg(organizationId, profile.enabledSkills ?? []);
  const byId = new Map(catalog.map((skill) => [skill.id, skill]));
  const alreadyEnabled = new Set(profile.enabledSkills ?? []);
  const updates: typeof parsed.data = { ...parsed.data };

  if (parsed.data.enabledSkills) {
    const unknown = parsed.data.enabledSkills.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      return {
        ok: false,
        status: 422,
        error: "Unknown skill",
        errors: {
          enabledSkills: `No such skill: ${unknown.join(", ")}. Enable only skills listed in Settings > Skills.`,
        },
      };
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
      return {
        ok: false,
        status: 422,
        error: "Skill requirements not met",
        errors: {
          enabledSkills: `${names.join(", ")} needs an integration that is not connected. Connect it under Settings > Integrations first.`,
        },
      };
    }
  }

  // The verification guardrail is the Verify customer skill. Turning it on has
  // to actually switch that skill on, otherwise the manager is left with a
  // notice and a switch they still have to go and find — which is not a
  // default. Only the transition does this: once it is on, the manager stays
  // free to turn the skill off from Settings > Skills and have it stay off.
  const turningVerificationOn = parsed.data.requireUserVerification === true && !profile.requireUserVerification;

  if (turningVerificationOn) {
    const verifySkill = byId.get(VERIFY_CUSTOMER_SKILL_ID);
    if (!verifySkill?.requirementsMet) {
      return {
        ok: false,
        status: 422,
        error: "Verification requires a CRM",
        errors: {
          requireUserVerification:
            "Connect a CRM under Settings > Integrations first — verification works by looking the customer up in it.",
        },
      };
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
    return { ok: true, profile: updated };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, status: 422, error: "Invalid payload", errors: { slug: "That slug is already in use" } };
    }
    throw error;
  }
}

/** One readable sentence from a failed patch, for the Assistant to relay. */
export function describePatchErrors(result: Extract<WorkerPatchResult, { ok: false }>): string {
  const details = Object.values(result.errors);
  return details.length > 0 ? details.join(" ") : result.error;
}
