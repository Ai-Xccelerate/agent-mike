import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { mcpConnectors, type McpConnectorTool, type McpToolPermission } from "@/db/schema";
import type { ConnectorEndpoint, DiscoveredServer } from "@/lib/mcp-connectors/client";

export type McpConnector = typeof mcpConnectors.$inferSelect;
export type ConnectorAuthType = "none" | "bearer" | "header";

export const TOOL_PERMISSIONS: McpToolPermission[] = ["auto", "approval", "off"];
export const MAX_CONNECTORS_PER_ORG = 20;

export type ConnectorAuthInput = {
  authType: ConnectorAuthType;
  /** Only for authType "header", e.g. X-API-Key. */
  headerName?: string | null;
  /** The token or header value. Omitted on update means "keep the saved one". */
  secret?: string | null;
};

/**
 * The default for a tool nobody has decided on yet. A tool the server marks
 * read-only can run on its own; anything else waits for a person. The hint
 * is the server's claim, which is why it only ever picks the default and the
 * admin can always override it.
 */
export function defaultPermission(tool: McpConnectorTool): McpToolPermission {
  return tool.readOnly && !tool.destructive ? "auto" : "approval";
}

/** Keeps every decision an admin already made; new tools get the default. Tools the server dropped are forgotten. */
export function mergePermissions(
  tools: McpConnectorTool[],
  existing: Record<string, McpToolPermission>,
): Record<string, McpToolPermission> {
  const next: Record<string, McpToolPermission> = {};
  for (const tool of tools) next[tool.name] = existing[tool.name] ?? defaultPermission(tool);
  return next;
}

export function permissionFor(connector: Pick<McpConnector, "toolPermissions">, toolName: string): McpToolPermission {
  return connector.toolPermissions[toolName] ?? "approval";
}

function authHeaders(authType: string, headerName: string | null, secret: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (secret && authType === "bearer") headers.Authorization = `Bearer ${secret}`;
  if (secret && authType === "header" && headerName) headers[headerName] = secret;
  return headers;
}

/** The headers to send, decrypted. Server-side only. */
export function connectorEndpoint(
  connector: Pick<McpConnector, "url" | "authType" | "authHeaderName" | "secret">,
): ConnectorEndpoint {
  const secret = connector.secret ? decrypt(connector.secret) : null;
  return { url: connector.url, headers: authHeaders(connector.authType, connector.authHeaderName, secret) };
}

/** For testing credentials the admin just typed, before anything is saved. */
export function endpointFromInput(url: string, auth: ConnectorAuthInput): ConnectorEndpoint {
  return { url, headers: authHeaders(auth.authType, auth.headerName ?? null, auth.secret ?? null) };
}

/** What a route may return. The secret never leaves; the screen only learns that one is set. */
export function serializeConnector(connector: McpConnector) {
  let host = connector.url;
  try {
    host = new URL(connector.url).host;
  } catch {
    /* keep the raw value */
  }
  return {
    id: connector.id,
    name: connector.name,
    url: connector.url,
    host,
    authType: connector.authType as ConnectorAuthType,
    authHeaderName: connector.authHeaderName,
    hasSecret: Boolean(connector.secret),
    enabled: connector.enabled,
    status: connector.status as "connected" | "failed",
    lastError: connector.lastError,
    serverName: connector.serverName,
    tools: connector.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      readOnly: tool.readOnly,
      destructive: tool.destructive,
      permission: permissionFor(connector, tool.name),
    })),
    lastSyncedAt: connector.lastSyncedAt,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
  };
}

export async function listConnectors(organizationId: string): Promise<McpConnector[]> {
  return db
    .select()
    .from(mcpConnectors)
    .where(eq(mcpConnectors.organizationId, organizationId))
    .orderBy(asc(mcpConnectors.createdAt));
}

export async function getConnector(organizationId: string, id: string): Promise<McpConnector | null> {
  const [row] = await db
    .select()
    .from(mcpConnectors)
    .where(and(eq(mcpConnectors.organizationId, organizationId), eq(mcpConnectors.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createConnector(input: {
  organizationId: string;
  name: string;
  url: string;
  auth: ConnectorAuthInput;
  discovered: DiscoveredServer;
  createdBy: string;
}): Promise<McpConnector> {
  const [row] = await db
    .insert(mcpConnectors)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      url: input.url,
      authType: input.auth.authType,
      authHeaderName: input.auth.authType === "header" ? input.auth.headerName ?? null : null,
      secret: input.auth.authType !== "none" && input.auth.secret ? encrypt(input.auth.secret) : null,
      status: "connected",
      serverName: input.discovered.serverName,
      tools: input.discovered.tools,
      toolPermissions: mergePermissions(input.discovered.tools, {}),
      createdBy: input.createdBy,
      lastSyncedAt: new Date(),
    })
    .returning();
  return row;
}

export async function updateConnector(
  organizationId: string,
  id: string,
  patch: Partial<Omit<typeof mcpConnectors.$inferInsert, "id" | "organizationId" | "createdAt">>,
): Promise<McpConnector | null> {
  const [row] = await db
    .update(mcpConnectors)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(mcpConnectors.organizationId, organizationId), eq(mcpConnectors.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteConnector(organizationId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(mcpConnectors)
    .where(and(eq(mcpConnectors.organizationId, organizationId), eq(mcpConnectors.id, id)))
    .returning({ id: mcpConnectors.id });
  return rows.length > 0;
}
