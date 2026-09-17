import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { firstAllowedOrigin } from "@/lib/env";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { getAuthConfigId } from "@/lib/tools-integrations/auth-configs";
import { findActiveConnectedAccount, linkConnection } from "@/lib/tools-integrations/composio-client";
import {
  attachConnectedAccountId,
  markConnectionActive,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";
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

  let authConfigId: string;
  try {
    authConfigId = getAuthConfigId(system);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid auth config";
    const status = message.endsWith("is not set") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const connectedBy =
    typeof body?.connectedBy === "string" && body.connectedBy.trim()
      ? body.connectedBy.trim()
      : tenant.userId;

  const callbackUrl = `${firstAllowedOrigin() || req.nextUrl.origin}/settings/integrations`;
  let linked: { redirectUrl: string; id: string | null };
  try {
    linked = await linkConnection(tenant.orgId, authConfigId, callbackUrl);
  } catch (error) {
    // Composio refuses a second link when one already exists for this
    // user+auth-config (e.g. a connection made outside our own DB's
    // tracking, or a row that got lost). Rather than surface Composio's raw
    // "multiple connected accounts" error, adopt the account it already has
    // if one is genuinely active — that is what the manager actually wants.
    const active = await findActiveConnectedAccount(tenant.orgId, system);
    if (!active) {
      const message = error instanceof Error ? error.message : "Composio link failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const row = await upsertPendingConnection({
      organizationId: tenant.orgId,
      integrationType: params.type,
      system,
      composioAuthConfigId: authConfigId,
      connectedBy,
    });
    await markConnectionActive(row.id, active);
    return NextResponse.json({ redirectUrl: null, alreadyConnected: true });
  }

  const row = await upsertPendingConnection({
    organizationId: tenant.orgId,
    integrationType: params.type,
    system,
    composioAuthConfigId: authConfigId,
    connectedBy,
  });

  if (linked.id) {
    await attachConnectedAccountId(row.id, linked.id);
  }

  return NextResponse.json({ redirectUrl: linked.redirectUrl });
}
