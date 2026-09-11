import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getAccountStatus } from "@/lib/tools-integrations/composio-client";
import { getConnectionForOrg, markConnectionActive } from "@/lib/tools-integrations/connection-repository";
import { getIntegrationType } from "@/lib/tools-integrations/registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!getIntegrationType(params.type)) {
    return NextResponse.json({ error: `Unknown integration type "${params.type}"` }, { status: 400 });
  }

  let row = await getConnectionForOrg(tenant.orgId, params.type);
  if (row?.composioConnectedAccountId && row.status === "pending") {
    try {
      const composioStatus = await getAccountStatus(row.composioConnectedAccountId);
      if (composioStatus.toUpperCase() === "ACTIVE") {
        row = await markConnectionActive(row.id, row.composioConnectedAccountId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Composio status check failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json(row);
}
