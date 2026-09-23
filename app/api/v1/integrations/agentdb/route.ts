import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { resolveAgentDbCredentials } from "@/lib/agentdb";
import { fieldErrors } from "@/lib/identity-fields";
import {
  agentDbPatchSchema,
  agentDbStatus,
  mergeAgentDbSettings,
  readAgentDbSettings,
} from "@/lib/integrations";
import {
  AgentDbError,
  agentDbAgentId,
  agentDbOrgId,
  isAgentDbConfigured,
  resolveWorkspaces,
} from "@/lib/agentdb";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * GET  → the integration's status, plus the org's workspaces when it is active.
 * PATCH→ toggle it on/off, or pick a workspace.
 *
 * The workspace list comes from the doc's `/resolve` endpoint, which is also
 * the call that enables (and may provision) the org. It is only made when the
 * integration is active, and a failure degrades to an error string rather than
 * failing the whole request — the settings screen must still render, and must
 * still let you toggle AgentDB back off, when AgentDB is down or the org was
 * never enabled.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const hasOwnKey = Boolean((await resolveAgentDbCredentials(tenant.orgId))?.values.apiKey);
  const status = agentDbStatus(profile.integrationsConfig, tenant.orgId, hasOwnKey);

  if (!status.active) {
    return NextResponse.json({
      ...status,
      workspaces: [],
      default_workspace_id: null,
      has_access: null,
      error: null,
    });
  }

  const settings = readAgentDbSettings(profile.integrationsConfig);
  try {
    const resolved = await resolveWorkspaces(
      agentDbOrgId(tenant.orgId, settings.orgId),
      agentDbAgentId(profile.slug),
    );
    return NextResponse.json({
      ...status,
      workspaces: resolved.workspaces,
      default_workspace_id: resolved.defaultWorkspaceId,
      // A 200 with has_access:false is not a failure — the org simply is not
      // entitled to AgentDB in Core. The screen says so in words.
      has_access: resolved.hasAccess,
      error: resolved.hasAccess ? null : "AgentDB is not enabled for this organization in AIX Core.",
    });
  } catch (error) {
    const message = error instanceof AgentDbError ? error.message : "AgentDB lookup failed";
    return NextResponse.json({
      ...status,
      workspaces: [],
      default_workspace_id: null,
      has_access: null,
      error: message,
    });
  }
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = agentDbPatchSchema.safeParse(body);
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
  // "enabled" while nothing can call out. Refuse, and say which vars are missing.
  if (parsed.data.enabled === true && !isAgentDbConfigured()) {
    return NextResponse.json(
      {
        error: "AgentDB is not configured on this server",
        errors: {
          enabled: "Set AGENTDB_API_URL and AGENTDB_INTERNAL_AGENT_KEY on the API service.",
        },
      },
      { status: 422 },
    );
  }

  const integrationsConfig = mergeAgentDbSettings(profile.integrationsConfig, parsed.data);

  const [updated] = await db
    .update(workerProfiles)
    .set({ integrationsConfig, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  const hasOwnKey = Boolean((await resolveAgentDbCredentials(tenant.orgId))?.values.apiKey);
  return NextResponse.json(agentDbStatus(updated.integrationsConfig, tenant.orgId, hasOwnKey));
}
