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
  mergeParchmentSettings,
  parchmentPatchSchema,
  parchmentStatus,
  readParchmentSettings,
} from "@/lib/integrations";
import {
  ParchmentError,
  isParchmentConfigured,
  parchmentAgentId,
  parchmentOrgId,
  resolveWorkspaces,
} from "@/lib/parchment";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * GET  → the integration's status, plus the org's workspaces when it is active.
 * PATCH→ toggle it on/off, or pick a workspace.
 *
 * The workspace list comes from the doc's `/resolve` discovery endpoint, which
 * also lazily provisions the org's default workspace on first touch. That call
 * is only made when the integration is active, and a failure degrades to an
 * error string rather than failing the whole request — the settings screen must
 * still render (and still let you toggle it off) when Parchment is down.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = parchmentStatus(profile.integrationsConfig, tenant.orgId);

  if (!status.active) {
    return NextResponse.json({ ...status, workspaces: [], default_workspace_id: null, error: null });
  }

  const settings = readParchmentSettings(profile.integrationsConfig);
  try {
    const resolved = await resolveWorkspaces(
      parchmentOrgId(tenant.orgId, settings.orgId),
      parchmentAgentId(profile.slug),
    );
    return NextResponse.json({
      ...status,
      workspaces: resolved.workspaces,
      default_workspace_id: resolved.defaultWorkspaceId,
      error: null,
    });
  } catch (error) {
    const message = error instanceof ParchmentError ? error.message : "Parchment lookup failed";
    return NextResponse.json({
      ...status,
      workspaces: [],
      default_workspace_id: null,
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
  const parsed = parchmentPatchSchema.safeParse(body);
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
  if (parsed.data.enabled === true && !isParchmentConfigured()) {
    return NextResponse.json(
      {
        error: "Parchment is not configured on this server",
        errors: {
          enabled: "Set PARCHMENT_API_URL and PARCHMENT_INTERNAL_AGENT_KEY on the API service.",
        },
      },
      { status: 422 },
    );
  }

  const integrationsConfig = mergeParchmentSettings(profile.integrationsConfig, parsed.data);

  const [updated] = await db
    .update(workerProfiles)
    .set({ integrationsConfig, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  return NextResponse.json(parchmentStatus(updated.integrationsConfig, tenant.orgId));
}
