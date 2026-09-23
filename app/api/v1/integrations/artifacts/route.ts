import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import { artifactsPatchSchema, artifactsStatus, mergeArtifactsSettings } from "@/lib/integrations";
import { ArtifactsError, isArtifactsConfigured, listBrandKits, listTools } from "@/lib/artifacts";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * GET  → the integration's status, plus the live tool surface and brand kits
 *        when it is active, so the screen shows what the worker can actually do
 *        rather than a hardcoded promise.
 * PATCH→ toggle it, pick a brand kit, or grant/revoke permission to publish.
 *
 * An Artifacts outage degrades to an error string rather than failing the
 * request: the settings screen must still render, and must still let you switch
 * it off, when the engine is down.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = artifactsStatus(profile.integrationsConfig);

  if (!status.active) {
    return NextResponse.json({ ...status, tools: [], brand_kits: [], error: null });
  }

  try {
    const tools = await listTools();
    // Brand kits sit behind their own `brand:read` scope, so a token can list
    // tools and still not reach kits. Missing kits is information, not failure.
    const brandKits = await listBrandKits().catch(() => []);
    return NextResponse.json({ ...status, tools, brand_kits: brandKits, error: null });
  } catch (error) {
    const message = error instanceof ArtifactsError ? error.message : "Artifacts lookup failed";
    return NextResponse.json({ ...status, tools: [], brand_kits: [], error: message });
  }
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = artifactsPatchSchema.safeParse(body);
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
  if (parsed.data.enabled === true && !isArtifactsConfigured()) {
    return NextResponse.json(
      {
        error: "Artifacts is not configured on this server",
        errors: { enabled: "Set ARTIFACTS_MCP_URL and ARTIFACTS_MCP_TOKEN on the API service." },
      },
      { status: 422 },
    );
  }

  const merged = mergeArtifactsSettings(profile.integrationsConfig, parsed.data);

  // Publishing is meaningless while the integration is off, and leaving it
  // silently armed would mean switching Artifacts back on quietly restores the
  // right to publish. Clearing it makes that an explicit decision each time.
  if (parsed.data.enabled === false) {
    merged.artifacts = { ...merged.artifacts, allowPublish: false };
  }

  const [updated] = await db
    .update(workerProfiles)
    .set({ integrationsConfig: merged, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  return NextResponse.json(artifactsStatus(updated.integrationsConfig));
}
