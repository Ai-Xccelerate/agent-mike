import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { envList } from "@/lib/env";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { getAuthConfigId } from "@/lib/tools-integrations/auth-configs";
import { linkConnection } from "@/lib/tools-integrations/composio-client";
import {
  attachConnectedAccountId,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";
import { getIntegrationType } from "@/lib/tools-integrations/registry";

export const dynamic = "force-dynamic";

// The frontend and this API commonly live on different hosts (split deploy)
// — req.nextUrl.origin is this API's own origin (on Railway, an internal
// bind address the browser can never reach), not the page Composio must send
// the manager back to. Prefer the configured allowed origin, same fix as the
// Nylas mailbox callback in app/api/v1/mailbox/callback/route.ts.
function firstAllowedOrigin(): string | null {
  const origins = envList(process.env.CORS_ALLOWED_ORIGINS);
  return origins[0] ?? null;
}

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

  const callbackUrl = `${firstAllowedOrigin() || req.nextUrl.origin}/settings/integrations`;
  let linked: { redirectUrl: string; id: string | null };
  try {
    linked = await linkConnection(tenant.orgId, authConfigId, callbackUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Composio link failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const connectedBy =
    typeof body?.connectedBy === "string" && body.connectedBy.trim()
      ? body.connectedBy.trim()
      : tenant.userId;

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
