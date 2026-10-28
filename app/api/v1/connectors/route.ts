import { isOrgAdmin } from "@/lib/org-roles";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { fieldErrors } from "@/lib/identity-fields";
import { listPendingApprovals } from "@/lib/tools-integrations/approval-repository";
import { discoverTools, describeConnectionError } from "@/lib/mcp-connectors/client";
import { parseConnectorApprovalToolId } from "@/lib/mcp-connectors/agent-tools";
import {
  createConnector,
  endpointFromInput,
  listConnectors,
  MAX_CONNECTORS_PER_ORG,
  serializeConnector,
} from "@/lib/mcp-connectors/repository";
import { ConnectorUrlError, parseConnectorUrl } from "@/lib/mcp-connectors/url-safety";
import { createConnectorSchema } from "@/lib/mcp-connectors/validation";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Connectors: remote MCP servers an admin plugs in.
 *
 * GET  → every connector (secrets never included) plus the connector calls
 *        still waiting on approval. Any manager may read; members see it
 *        read-only, like every other settings screen.
 * POST → add one. Owner/admin only. The server is contacted before anything
 *        is saved: a connector that cannot list its tools is refused with
 *        the reason, rather than saved in a broken state.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const [connectors, pending] = await Promise.all([
    listConnectors(tenant.orgId),
    listPendingApprovals(tenant.orgId),
  ]);
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  const pendingApprovals = pending.flatMap((approval) => {
    const parsed = parseConnectorApprovalToolId(approval.toolId);
    if (!parsed) return [];
    return [
      {
        id: approval.id,
        connectorId: parsed.connectorId,
        connectorName: byId.get(parsed.connectorId)?.name ?? "Removed connector",
        toolName: parsed.toolName,
        input: approval.input,
        conversationId: approval.conversationId,
        createdAt: approval.createdAt,
      },
    ];
  });

  return NextResponse.json({ connectors: connectors.map(serializeConnector), pendingApprovals });
}

export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only owners and admins can do this", code: "admin_only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createConnectorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  let url: URL;
  try {
    url = parseConnectorUrl(input.url);
  } catch (error) {
    const message = error instanceof ConnectorUrlError ? error.message : "Enter a valid URL.";
    return NextResponse.json({ error: message, errors: { url: message } }, { status: 422 });
  }

  const existing = await listConnectors(tenant.orgId);
  if (existing.length >= MAX_CONNECTORS_PER_ORG) {
    return NextResponse.json(
      { error: `You can add up to ${MAX_CONNECTORS_PER_ORG} connectors. Remove one first.` },
      { status: 409 },
    );
  }

  const authInput = { authType: input.authType, headerName: input.headerName, secret: input.secret };
  let discovered;
  try {
    discovered = await discoverTools(endpointFromInput(url.href, authInput));
  } catch (error) {
    const message = describeConnectionError(error);
    return NextResponse.json({ error: message, errors: { url: message } }, { status: 422 });
  }

  try {
    const connector = await createConnector({
      organizationId: tenant.orgId,
      name: input.name,
      url: url.href,
      auth: authInput,
      discovered,
      createdBy: tenant.userId,
    });
    return NextResponse.json(serializeConnector(connector), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENCRYPTION_KEY")) {
      return NextResponse.json(
        { error: "This server cannot store credentials yet. An administrator needs to set ENCRYPTION_KEY." },
        { status: 503 },
      );
    }
    throw error;
  }
}
