import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicAppUrl } from "@/lib/env";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { ConnectionFlowError, startIntegrationConnection } from "@/lib/connection-flows";
import { getIntegrationType } from "@/lib/tools-integrations/registry";
import { availableAuthMethods } from "@/lib/tools-integrations/auth-configs";

export const dynamic = "force-dynamic";

/** Which ways of connecting a system this server has set up, so the chooser offers only those. */
export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  if (!getIntegrationType(params.type)) {
    return NextResponse.json({ error: `Unknown integration type "${params.type}"` }, { status: 400 });
  }
  const system = req.nextUrl.searchParams.get("system")?.trim() ?? "";
  if (!system) {
    return NextResponse.json({ error: "system is required" }, { status: 400 });
  }
  return NextResponse.json({ methods: availableAuthMethods(system) });
}

export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  await getOrCreateProfile(tenant.orgId);
  if (!getIntegrationType(params.type)) {
    return NextResponse.json({ error: `Unknown integration type "${params.type}"` }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const system = typeof body?.system === "string" ? body.system.trim() : "";
  if (!system) {
    return NextResponse.json({ error: "system is required" }, { status: 400 });
  }

  const connectedBy =
    typeof body?.connectedBy === "string" && body.connectedBy.trim()
      ? body.connectedBy.trim()
      : tenant.userId;

  try {
    const result = await startIntegrationConnection({
      organizationId: tenant.orgId,
      integrationType: params.type,
      system,
      connectedBy,
      appOrigin: publicAppUrl() || req.nextUrl.origin,
      authMethod: body?.authMethod === "api_key" || body?.authMethod === "client_credentials" ? body.authMethod : "oauth",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConnectionFlowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
