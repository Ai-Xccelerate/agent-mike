import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import {
  agentSkillsPatchSchema,
  agentSkillsStatus,
  mergeAgentSkillsSettings,
} from "@/lib/integrations";
import {
  SkillsRepositoryError,
  listCategories,
  resolveSkillsCredentials,
} from "@/lib/skills-repository";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Skills > AIX Skills repository.
 *
 * GET  → the integration's status, plus the live category list when it is
 *        active, so the scope dropdown offers what actually exists rather than
 *        a hardcoded guess.
 * PATCH→ toggle it, scope it to a category, or change the result cap.
 *
 * A repository outage degrades to an error string rather than failing the
 * request: the screen must still render, and must still let you switch this
 * back off, when the repository is down.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = await agentSkillsStatus(profile.integrationsConfig, tenant.orgId);

  if (!status.active) {
    return NextResponse.json({ ...status, categories: [], error: null });
  }

  const resolved = await resolveSkillsCredentials(tenant.orgId);
  if (!resolved) {
    return NextResponse.json({ ...status, categories: [], error: null });
  }

  try {
    return NextResponse.json({
      ...status,
      categories: await listCategories(resolved.values),
      error: null,
    });
  } catch (error) {
    const message =
      error instanceof SkillsRepositoryError ? error.message : "Skill repository lookup failed";
    return NextResponse.json({ ...status, categories: [], error: message });
  }
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = agentSkillsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", errors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Invalid payload", errors: { _: "Provide at least one field to update" } },
      { status: 422 },
    );
  }

  // Turning it on without server credentials would leave a toggle that reads
  // "enabled" while nothing can call out. Refuse, and say what is missing.
  if (parsed.data.enabled === true && !(await resolveSkillsCredentials(tenant.orgId))) {
    return NextResponse.json(
      {
        error: "No skill repository key is configured for this agent",
        errors: {
          enabled: "Add a key below, or set AIX_SKILLS_API_KEY fleet-wide on the API service.",
        },
      },
      { status: 422 },
    );
  }

  const integrationsConfig = mergeAgentSkillsSettings(profile.integrationsConfig, parsed.data);

  const [updated] = await db
    .update(workerProfiles)
    .set({ integrationsConfig, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  return NextResponse.json(await agentSkillsStatus(updated.integrationsConfig, tenant.orgId));
}
