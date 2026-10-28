import { isOrgAdmin } from "@/lib/org-roles";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { getIdentityAdapter } from "@/lib/identity";
import { fieldErrors } from "@/lib/identity-fields";
import { listPendingApprovals, retirePendingApprovals } from "@/lib/tools-integrations/approval-repository";
import { connectorApprovalToolId } from "@/lib/mcp-connectors/agent-tools";
import { discoverTools, describeConnectionError } from "@/lib/mcp-connectors/client";
import {
  deleteConnector,
  endpointFromInput,
  getConnector,
  mergePermissions,
  serializeConnector,
  updateConnector,
} from "@/lib/mcp-connectors/repository";
import { updateConnectorSchema } from "@/lib/mcp-connectors/validation";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Pending calls queued against this connector, so a removal can retire them instead of leaving them approvable. */
async function pendingForConnector(orgId: string, connectorId: string) {
  const prefix = connectorApprovalToolId(connectorId, "");
  return (await listPendingApprovals(orgId)).filter((approval) => approval.toolId.startsWith(prefix));
}

/**
 * PATCH → rename, switch on/off, change per-tool permissions, or replace the
 * credentials. New credentials are tested against the server before they
 * are saved, the same as when the connector was added.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only owners and admins can do this", code: "admin_only" }, { status: 403 });

  const connector = await getConnector(tenant.orgId, params.id);
  if (!connector) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateConnectorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;
  const patch: Parameters<typeof updateConnector>[2] = {};

  if (input.name !== undefined) patch.name = input.name;
  if (input.enabled !== undefined) patch.enabled = input.enabled;

  if (input.toolPermissions) {
    const known = new Set(connector.tools.map((tool) => tool.name));
    const unknown = Object.keys(input.toolPermissions).filter((name) => !known.has(name));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Unknown tool: ${unknown.join(", ")}` }, { status: 422 });
    }
    patch.toolPermissions = { ...connector.toolPermissions, ...input.toolPermissions };
  }

  if (input.auth) {
    const authType = input.auth.authType;
    // A blank secret on the same auth type keeps the saved one, so the
    // admin can change the header name without retyping the key.
    const keepSecret = !input.auth.secret && authType === connector.authType && connector.secret;
    const secret = authType === "none" ? null : input.auth.secret || (keepSecret ? decrypt(connector.secret!) : null);
    const headerName = authType === "header" ? input.auth.headerName || null : null;
    if (authType !== "none" && !secret) {
      return NextResponse.json({ error: "Enter the token or key.", errors: { secret: "Enter the token or key." } }, { status: 422 });
    }
    if (authType === "header" && !headerName) {
      return NextResponse.json({ error: "Enter the header name.", errors: { headerName: "Enter the header name." } }, { status: 422 });
    }
    try {
      const discovered = await discoverTools(endpointFromInput(connector.url, { authType, headerName, secret }));
      patch.tools = discovered.tools;
      patch.serverName = discovered.serverName;
      patch.toolPermissions = mergePermissions(discovered.tools, patch.toolPermissions ?? connector.toolPermissions);
      patch.status = "connected";
      patch.lastError = null;
      patch.lastSyncedAt = new Date();
    } catch (error) {
      const message = describeConnectionError(error);
      return NextResponse.json({ error: message, errors: { secret: message } }, { status: 422 });
    }
    patch.authType = authType;
    patch.authHeaderName = headerName;
    patch.secret = secret ? encrypt(secret) : null;
  }

  const updated = await updateConnector(tenant.orgId, connector.id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Switching a connector (or one of its tools) off also retires calls still
  // queued against it, so an old request cannot be approved into running.
  const pending = await pendingForConnector(tenant.orgId, connector.id);
  const retire = pending.filter((approval) => {
    if (!updated.enabled) return true;
    const toolName = approval.toolId.slice(connectorApprovalToolId(connector.id, "").length);
    return (updated.toolPermissions[toolName] ?? "approval") === "off";
  });
  await retirePendingApprovals(
    retire.map((approval) => approval.id),
    "system:connector-changed",
  );

  return NextResponse.json(serializeConnector(updated));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only owners and admins can do this", code: "admin_only" }, { status: 403 });

  const pending = await pendingForConnector(tenant.orgId, params.id);
  const removed = await deleteConnector(tenant.orgId, params.id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await retirePendingApprovals(
    pending.map((approval) => approval.id),
    "system:connector-removed",
  );
  return new NextResponse(null, { status: 204 });
}
