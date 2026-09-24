import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicAppUrl } from "@/lib/env";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { ConnectionFlowError, startIntegrationConnection } from "@/lib/connection-flows";
import { getIntegrationType } from "@/lib/tools-integrations/registry";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
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
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConnectionFlowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
