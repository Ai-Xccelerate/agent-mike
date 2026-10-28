import { isOrgAdmin } from "@/lib/org-roles";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { discoverTools, describeConnectionError } from "@/lib/mcp-connectors/client";
import {
  connectorEndpoint,
  getConnector,
  mergePermissions,
  serializeConnector,
  updateConnector,
} from "@/lib/mcp-connectors/repository";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * POST → ask the server for its tool list again. Decisions already made on
 * existing tools are kept; tools the server added arrive with the default
 * (read-only → auto, anything else → needs approval). A failed refresh
 * marks the connector failed with the reason, which also takes its tools
 * away from the worker until it reconnects.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only owners and admins can do this", code: "admin_only" }, { status: 403 });

  const connector = await getConnector(tenant.orgId, params.id);
  if (!connector) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const discovered = await discoverTools(connectorEndpoint(connector));
    const updated = await updateConnector(tenant.orgId, connector.id, {
      tools: discovered.tools,
      serverName: discovered.serverName,
      toolPermissions: mergePermissions(discovered.tools, connector.toolPermissions),
      status: "connected",
      lastError: null,
      lastSyncedAt: new Date(),
    });
    return NextResponse.json(serializeConnector(updated ?? connector));
  } catch (error) {
    const message = describeConnectionError(error);
    const updated = await updateConnector(tenant.orgId, connector.id, { status: "failed", lastError: message });
    return NextResponse.json({ error: message, connector: serializeConnector(updated ?? connector) }, { status: 502 });
  }
}
