import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { classifyAction, decideAction, type ActionTier } from "@/lib/tools-integrations/action-policy";
import { createPendingApproval } from "@/lib/tools-integrations/approval-repository";
import {
  executeTool,
  getActionSchema,
  searchActions,
  type ComposioActionSchema,
} from "@/lib/tools-integrations/composio-client";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { INTEGRATIONS } from "@/lib/tools-integrations/registry";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";

/**
 * Every action a connected integration offers, not just the handful of
 * lookups wired by hand in lib/agent.ts.
 *
 * The agent gets two tools instead of hundreds: search for an action, then
 * run one. That keeps each model call small (Jira alone has more actions than
 * a request can carry) and puts every run through one policy check
 * (lib/tools-integrations/action-policy.ts): reads run, routine writes run
 * unless the worker requires approval, and emails to anyone but the
 * customer, risky changes and deletes queue for a manager.
 */

export const SEARCH_ACTIONS_TOOL_NAME = "search_integration_actions";
export const RUN_ACTION_TOOL_NAME = "run_integration_action";
export const COMPOSIO_ACTION_APPROVAL_TOOL_ID = "composio_action";

const SEARCH_LIMIT = 8;
const DESCRIPTION_LIMIT = 300;
const RESULT_TEXT_LIMIT = 12000;

export const ACTION_FAILURE_MESSAGE =
  "That action didn't go through. Tell the customer you've noted it and a teammate will follow up, rather than saying it was done.";

export type ConnectedToolkit = { toolkit: string; connectedAccountId: string };

/** The Composio toolkits this org has an active connection for, one per integration type. */
export async function connectedToolkits(organizationId: string): Promise<ConnectedToolkit[]> {
  const types = [...new Set(INTEGRATIONS.map((integration) => integration.integrationType))];
  const rows = await Promise.all(types.map((type) => getConnectionForOrg(organizationId, type)));
  const found: ConnectedToolkit[] = [];
  for (const row of rows) {
    if (row?.status !== "active" || !row.composioConnectedAccountId) continue;
    if (!INTEGRATIONS.some((integration) => integration.system === row.system)) continue;
    found.push({ toolkit: row.system.toLowerCase(), connectedAccountId: row.composioConnectedAccountId });
  }
  return found;
}

function summarizeParameters(schema: ComposioActionSchema): Record<string, string> {
  const properties = schema.inputParameters?.properties ?? {};
  const required = new Set(schema.inputParameters?.required ?? []);
  const summary: Record<string, string> = {};
  for (const [name, raw] of Object.entries(properties)) {
    const prop = (raw ?? {}) as { type?: unknown; description?: unknown };
    const type = typeof prop.type === "string" ? prop.type : Array.isArray(prop.type) ? prop.type.join("|") : "any";
    const description = typeof prop.description === "string" ? ` — ${prop.description.slice(0, 160)}` : "";
    summary[name] = `${type}${required.has(name) ? " (required)" : ""}${description}`;
  }
  return summary;
}

const TIER_NOTE: Record<ActionTier, string> = {
  read: "runs now",
  routine: "runs now unless this worker requires approval for every change",
  email: "runs now only when every recipient is this conversation's customer; otherwise a manager approves",
  risky: "a manager approves first",
  delete: "a manager approves first",
};

export async function executeSearchActions(
  query: string,
  app: string | undefined,
  organizationId: string,
): Promise<string> {
  const connected = await connectedToolkits(organizationId);
  const wanted = app ? connected.filter((entry) => entry.toolkit === app.trim().toLowerCase()) : connected;
  if (wanted.length === 0) {
    return app
      ? `"${app}" isn't connected. Connected apps: ${connected.map((entry) => entry.toolkit).join(", ") || "none"}.`
      : "No apps are connected.";
  }

  let found: ComposioActionSchema[];
  try {
    found = await searchActions(wanted.map((entry) => entry.toolkit), query, SEARCH_LIMIT);
  } catch (error) {
    await logToolCall({
      organizationId,
      toolId: SEARCH_ACTIONS_TOOL_NAME,
      input: { query, app: app ?? null },
      output: null,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return "Searching the connected apps failed. Try again, or answer without it.";
  }

  const actions = found
    .filter((schema) => !schema.isDeprecated)
    .map((schema) => {
      const tier = classifyAction(schema);
      return {
        action: schema.slug,
        app: schema.toolkit,
        description: (schema.description ?? schema.name).slice(0, DESCRIPTION_LIMIT),
        approval: TIER_NOTE[tier],
        parameters: summarizeParameters(schema),
      };
    });
  return JSON.stringify({ actions });
}

export async function customerEmailFor(organizationId: string, conversationId: string | null | undefined): Promise<string | null> {
  if (!conversationId) return null;
  const [row] = await db
    .select({ customerEmail: conversations.customerEmail })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
    .limit(1);
  return row?.customerEmail ?? null;
}

function resultText(result: unknown): string {
  const text = JSON.stringify(result);
  return text.length > RESULT_TEXT_LIMIT ? `${text.slice(0, RESULT_TEXT_LIMIT)}… (truncated)` : text;
}

function toolkitFor(schema: ComposioActionSchema, connected: ConnectedToolkit[]): ConnectedToolkit | null {
  return connected.find((entry) => entry.toolkit === schema.toolkit) ?? null;
}

type ActionApprovalInput = {
  action: string;
  app: string;
  version: string;
  tier: ActionTier;
  arguments: Record<string, unknown>;
};

async function runAndLog(
  input: ActionApprovalInput,
  organizationId: string,
  connectedAccountId: string,
  calledBy: string,
): Promise<{ ok: boolean; text: string }> {
  const logInput = { action: input.action, app: input.app, tier: input.tier, arguments: input.arguments };
  try {
    const result = (await executeTool(input.action, input.arguments, {
      connectedAccountId,
      userId: organizationId,
      version: input.version,
    })) as { successful?: boolean; error?: unknown };
    const failed = result?.successful === false;
    await logToolCall({
      organizationId,
      toolId: RUN_ACTION_TOOL_NAME,
      calledBy,
      input: logInput,
      output: { result: resultText(result).slice(0, 1500) },
      status: failed ? "error" : "success",
      errorMessage: failed ? String(result.error ?? "unsuccessful") : null,
    });
    return { ok: !failed, text: resultText(result) };
  } catch (error) {
    await logToolCall({
      organizationId,
      toolId: RUN_ACTION_TOOL_NAME,
      calledBy,
      input: logInput,
      output: null,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, text: ACTION_FAILURE_MESSAGE };
  }
}

export async function executeRunAction(
  input: { action: string; argumentsJson: string },
  context: { organizationId: string; conversationId?: string | null; requireWriteApproval: boolean },
): Promise<string> {
  const { organizationId, conversationId } = context;

  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(input.argumentsJson || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    args = parsed as Record<string, unknown>;
  } catch {
    return "arguments_json must be a JSON object, e.g. {\"issue_key\": \"AIX-12\"}.";
  }

  let schema: ComposioActionSchema;
  try {
    schema = await getActionSchema(input.action);
  } catch {
    return `There's no action called ${input.action}. Use ${SEARCH_ACTIONS_TOOL_NAME} to find the right one.`;
  }
  if (schema.isDeprecated || !schema.version) {
    return `${input.action} can't be run right now. Use ${SEARCH_ACTIONS_TOOL_NAME} to find another way.`;
  }

  const connected = await connectedToolkits(organizationId);
  const target = toolkitFor(schema, connected);
  if (!target) {
    return `${input.action} belongs to ${schema.toolkit || "an app"} that isn't connected, so it can't be used.`;
  }

  const tier = classifyAction(schema);
  const approvalInput: ActionApprovalInput = {
    action: schema.slug,
    app: schema.toolkit,
    version: schema.version,
    tier,
    arguments: args,
  };
  const decision = decideAction({
    tier,
    requireWriteApproval: context.requireWriteApproval,
    args,
    customerEmail: await customerEmailFor(organizationId, conversationId),
  });

  if (!decision.run) {
    const approval = await createPendingApproval({
      organizationId,
      conversationId: conversationId ?? null,
      toolId: COMPOSIO_ACTION_APPROVAL_TOOL_ID,
      input: approvalInput,
    });
    await logToolCall({
      organizationId,
      toolId: RUN_ACTION_TOOL_NAME,
      calledBy: "agent",
      input: { action: schema.slug, app: schema.toolkit, tier, arguments: args },
      output: { approvalId: approval.id },
      status: "escalated",
      errorMessage: null,
    });
    return `Queued for manager approval (id ${approval.id}): ${schema.slug}. ${decision.reason} Nothing has changed yet, so tell the customer a teammate will confirm it rather than saying it's done.`;
  }

  const result = await runAndLog(approvalInput, organizationId, target.connectedAccountId, "agent");
  return result.text;
}

/**
 * Runs a queued action once a manager approves it. The connection is looked
 * up again rather than trusted from the queue: it may have been disconnected
 * (or reconnected to another account) since the agent asked.
 */
export async function applyComposioActionApproval(
  input: Record<string, unknown>,
  organizationId: string,
  decidedBy: string,
): Promise<{ ok: boolean; output: string }> {
  const queued = input as Partial<ActionApprovalInput>;
  if (!queued.action || !queued.app || !queued.version || !queued.arguments || typeof queued.arguments !== "object") {
    return { ok: false, output: "This queued action is incomplete and can't be run." };
  }
  const connected = await connectedToolkits(organizationId);
  const target = connected.find((entry) => entry.toolkit === queued.app);
  if (!target) {
    return { ok: false, output: `${queued.app} is no longer connected, so ${queued.action} can't run.` };
  }
  const result = await runAndLog(queued as ActionApprovalInput, organizationId, target.connectedAccountId, decidedBy);
  return { ok: result.ok, output: result.text };
}
