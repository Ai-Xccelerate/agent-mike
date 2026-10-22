import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { isPlaceholderCustomerName } from "@/lib/customer-name";
import { NO_HELPDESK, type HelpdeskCapabilities } from "@/lib/widget-defaults";
import { trustedCustomerEmail } from "@/lib/customer-identity";
import { conversations } from "@/db/schema";
import type { KnowledgeMatch } from "@/lib/knowledge";
import { executeTool, getAccountSite, proxyRequest } from "@/lib/tools-integrations/composio-client";
import { getConnectionForOrg, type IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";
import { chooseRequestType } from "@/lib/request-type-choice";

/**
 * Jira and Confluence, shared by every agent that talks to them.
 *
 * Both are connected per org through Composio (Settings > Integrations), and
 * their per-org settings (which project tickets go to, which space answers
 * come from) live on the connection row's `metadata.settings`, so they go
 * away with the connection rather than outliving it in the worker profile.
 *
 * What a caller may do with them is the caller's business: the customer agent
 * only ever sees its own customer's tickets (lookupCustomerTickets), while the
 * manager's Assistant may search the whole project.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toLogOutput(result: unknown): Record<string, unknown> | null {
  if (result == null) return null;
  if (typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { value: result };
}

export const JIRA_SEARCH_ISSUES_SLUG = "JIRA_SEARCH_ISSUES";
/** Toolkit version from composio.toolkits.get("jira") (Version: 20260915_00). */
export const JIRA_TOOLKIT_VERSION = "20260915_00";
export const JIRA_LOOKUP_TOOL_NAME = "lookup_jira_issue";
export const JIRA_LOOKUP_RETRY_BACKOFF_MS = 500;
export const JIRA_LOOKUP_FAILURE_MESSAGE =
  "Jira issue search failed after retry (authentication or connectivity issue). This needs human follow-up — end your reply with [[ESCALATE]].";

/** JQL text-search clause. Escapes backslashes then quotes so the value is a valid JQL string literal. */
export function buildJiraTextSearchJql(query: string): string {
  const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `text ~ "${escaped}"`;
}

export async function executeJiraSearch(
  query: string,
  organizationId: string,
  connectedAccountId: string,
): Promise<string> {
  const input = { query };
  const run = () =>
    executeTool(
      JIRA_SEARCH_ISSUES_SLUG,
      { jql: buildJiraTextSearchJql(query) },
      {
        connectedAccountId,
        userId: organizationId,
        version: JIRA_TOOLKIT_VERSION,
      },
    );

  let result: unknown;
  try {
    result = await run();
  } catch {
    await sleep(JIRA_LOOKUP_RETRY_BACKOFF_MS);
    try {
      result = await run();
    } catch (retryError) {
      const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
      await logToolCall({
        organizationId,
        toolId: JIRA_LOOKUP_TOOL_NAME,
        input,
        output: null,
        status: "error",
        errorMessage,
      });
      return JIRA_LOOKUP_FAILURE_MESSAGE;
    }
  }

  await logToolCall({
    organizationId,
    toolId: JIRA_LOOKUP_TOOL_NAME,
    input,
    output: toLogOutput(result),
    status: "success",
  });
  return JSON.stringify(result);
}

export const CONFLUENCE_SEARCH_SLUG = "CONFLUENCE_SEARCH_CONTENT";
export const CONFLUENCE_GET_PAGE_SLUG = "CONFLUENCE_GET_PAGE_BY_ID";
/** Toolkit version from composio.toolkits.get("confluence") (Version: 20260915_00). */
export const CONFLUENCE_TOOLKIT_VERSION = "20260915_00";
export const CONFLUENCE_SEARCH_TOOL_NAME = "search_confluence";
export const CONFLUENCE_READ_TOOL_NAME = "read_confluence_page";
export const CONFLUENCE_FAILURE_MESSAGE =
  "Confluence lookup failed after retry (authentication or connectivity issue). Don't answer from memory instead: if the answer depends on it, end your reply with [[ESCALATE]].";
/** How much of one page's text goes back to the model. */
export const CONFLUENCE_PAGE_TEXT_LIMIT = 8000;
const CONFLUENCE_SEARCH_LIMIT = 10;

/** Confluence storage format (HTML) to plain text for the model: block tags become line breaks, entities decoded. */
export function confluenceStorageToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote|pre)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** One read-only Composio call, retried once, logged either way. Null means it failed twice. */
async function runReadTool(
  toolName: string,
  slug: string,
  args: Record<string, unknown>,
  organizationId: string,
  connectedAccountId: string,
  version: string,
): Promise<unknown | null> {
  const run = () => executeTool(slug, args, { connectedAccountId, userId: organizationId, version });
  let result: unknown;
  try {
    result = await run();
  } catch {
    await sleep(JIRA_LOOKUP_RETRY_BACKOFF_MS);
    try {
      result = await run();
    } catch (retryError) {
      await logToolCall({
        organizationId,
        toolId: toolName,
        input: args,
        output: null,
        status: "error",
        errorMessage: retryError instanceof Error ? retryError.message : String(retryError),
      });
      return null;
    }
  }
  // Composio reports a refused call (missing scope, bad arguments) as a
  // result with successful: false rather than throwing; log it as the error
  // it is, so it isn't mistaken for an empty answer.
  const refused = (result as { successful?: boolean } | null)?.successful === false;
  await logToolCall({
    organizationId,
    toolId: toolName,
    input: args,
    output: toLogOutput(result),
    status: refused ? "error" : "success",
    errorMessage: refused ? String((result as { error?: unknown }).error ?? "unsuccessful") : null,
  });
  return result;
}

/** True when Composio answered but the app refused the call (e.g. a scope the connection lacks). */
export function wasRefused(result: unknown): boolean {
  return (result as { successful?: boolean } | null)?.successful === false;
}

export async function executeConfluenceSearch(query: string, organizationId: string, connectedAccountId: string) {
  const result = await runReadTool(
    CONFLUENCE_SEARCH_TOOL_NAME,
    CONFLUENCE_SEARCH_SLUG,
    { query, limit: CONFLUENCE_SEARCH_LIMIT },
    organizationId,
    connectedAccountId,
    CONFLUENCE_TOOLKIT_VERSION,
  );
  return result === null ? CONFLUENCE_FAILURE_MESSAGE : JSON.stringify(result);
}

/**
 * One page's text. `onReferenceMaterial` fires when real page text comes
 * back, so the reply check knows this turn's answer can be grounded in it.
 */
export async function executeConfluencePageRead(
  pageId: string,
  organizationId: string,
  connectedAccountId: string,
  onReferenceMaterial?: () => void,
) {
  const result = (await runReadTool(
    CONFLUENCE_READ_TOOL_NAME,
    CONFLUENCE_GET_PAGE_SLUG,
    { id: pageId },
    organizationId,
    connectedAccountId,
    CONFLUENCE_TOOLKIT_VERSION,
  )) as { data?: { id?: string; title?: string; body?: { storage?: { value?: string } }; _links?: { webui?: string } } } | null;
  if (result === null) return CONFLUENCE_FAILURE_MESSAGE;
  const page = result.data ?? {};
  const text = confluenceStorageToText(page.body?.storage?.value ?? "");
  if (!text) return JSON.stringify({ id: page.id ?? pageId, title: page.title ?? null, text: "", note: "This page has no readable text." });
  onReferenceMaterial?.();
  return JSON.stringify({
    id: page.id ?? pageId,
    title: page.title ?? null,
    link: page._links?.webui ?? null,
    text: text.slice(0, CONFLUENCE_PAGE_TEXT_LIMIT),
    truncated: text.length > CONFLUENCE_PAGE_TEXT_LIMIT,
  });
}

// ---------------------------------------------------------------------------
// Per-org settings, kept on the connection row (metadata.settings).
// ---------------------------------------------------------------------------

export const jiraSettingsSchema = z.object({
  /** The project handoffs are raised in, e.g. "SUP". Null = no ticket is raised. */
  projectKey: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{0,19}$/, "A Jira project key is letters and digits, starting with a letter (e.g. SUP)")
    .nullable(),
  /** An issue type that exists in that project, e.g. "Task". Used when no request type is set. */
  issueType: z.string().trim().min(1).max(80).nullable(),
  /**
   * A Jira Service Management request type in that project, e.g. "8" for
   * "Report a system problem". When set, handoffs are raised as service desk
   * requests, so they land in the desk's queues and portal; the request type
   * decides the issue type.
   */
  requestTypeId: z.string().trim().regex(/^\d{1,18}$/, "A request type id is a number").nullable(),
  /** The request type's name, for showing it; set by the server from Jira. */
  requestTypeName: z.string().trim().min(1).max(120).nullable(),
  /** Raise a ticket the moment the worker hands a conversation to a person. */
  createTicketOnHandoff: z.boolean(),
  /**
   * The worker picks the request type for each handoff from the desk's own
   * list (and fills in the fields it requires), instead of every handoff
   * going in as `requestTypeId`. A choice Jira wouldn't take is never swapped
   * for a default: the ticket fails visibly instead.
   */
  workerChoosesRequestType: z.boolean(),
  /**
   * For a visitor whose email was verified by a code (Settings > Customer
   * identity = email_code): find their Jira customer account, create it if
   * they have none, and raise the ticket on their behalf. Off by default.
   */
  createCustomers: z.boolean(),
});

export type JiraSettings = z.infer<typeof jiraSettingsSchema>;

export const confluenceSettingsSchema = z.object({
  /** Only search these spaces, e.g. ["SK", "PGFP"]. Empty = every space the connection can read. */
  spaceKeys: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_~]{1,255}$/, "A Confluence space key is letters and digits (e.g. SK)"),
    )
    .max(20, "Up to 20 spaces")
    .transform((keys) => [...new Set(keys)]),
  /** Search the space before every answer, not only when the model decides to look. */
  searchBeforeAnswering: z.boolean(),
});

export type ConfluenceSettings = z.infer<typeof confluenceSettingsSchema>;

export function jiraSettingsDefaults(): JiraSettings {
  return {
    projectKey: null,
    issueType: null,
    requestTypeId: null,
    requestTypeName: null,
    createTicketOnHandoff: true,
    workerChoosesRequestType: false,
    createCustomers: false,
  };
}

export function confluenceSettingsDefaults(): ConfluenceSettings {
  return { spaceKeys: [], searchBeforeAnswering: true };
}

function readSettings<T>(metadata: unknown, schema: z.ZodType<T>, defaults: T): T {
  const stored =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).settings : undefined;
  if (!stored || typeof stored !== "object") return defaults;
  const parsed = schema.safeParse({ ...defaults, ...(stored as object) });
  return parsed.success ? parsed.data : defaults;
}

export function readJiraSettings(metadata: unknown): JiraSettings {
  return readSettings(metadata, jiraSettingsSchema, jiraSettingsDefaults());
}

export function readConfluenceSettings(metadata: unknown): ConfluenceSettings {
  const stored = metadata && typeof metadata === "object" ? (metadata as { settings?: unknown }).settings : undefined;
  const legacy = stored && typeof stored === "object" ? (stored as { spaceKey?: unknown }).spaceKey : undefined;
  // Settings saved before multi-space support kept one `spaceKey`.
  const migrated =
    typeof legacy === "string" && legacy && !("spaceKeys" in (stored as object))
      ? { ...(metadata as object), settings: { ...(stored as object), spaceKeys: [legacy] } }
      : metadata;
  return readSettings(migrated, confluenceSettingsSchema, confluenceSettingsDefaults());
}

/**
 * The settings schema for one connection, by integration type and system.
 * Null when that connection has no settings of its own.
 */
export function connectionSettingsSchema(integrationType: string, system: string) {
  if (integrationType === "helpdesk" && system === "jira") return jiraSettingsSchema;
  if (integrationType === "knowledge_base" && system === "confluence") return confluenceSettingsSchema;
  return null;
}

/**
 * What the connected helpdesk lets the worker do for a customer, for the widget's
 * default quick actions (lib/widget-defaults.ts). Never throws: a helpdesk that
 * can't be read just means the worker is not offered as ticket-capable.
 */
export async function helpdeskCapabilities(organizationId: string): Promise<HelpdeskCapabilities> {
  try {
    const connection = await getConnectionForOrg(organizationId, "helpdesk");
    if (!connection || !activeAccount(connection, "jira")) return NO_HELPDESK;
    const settings = readJiraSettings(connection.metadata);
    return { raisesTickets: Boolean(settings.createTicketOnHandoff && settings.projectKey), looksUpTickets: true };
  } catch {
    return NO_HELPDESK;
  }
}

export function readConnectionSettings(connection: Pick<IntegrationConnection, "integrationType" | "system" | "metadata">) {
  if (connection.integrationType === "helpdesk" && connection.system === "jira") return readJiraSettings(connection.metadata);
  if (connection.integrationType === "knowledge_base" && connection.system === "confluence") {
    return readConfluenceSettings(connection.metadata);
  }
  return null;
}

function activeAccount(connection: IntegrationConnection | null, system: string): string | null {
  if (connection?.status !== "active" || connection.system !== system) return null;
  return connection.composioConnectedAccountId ?? null;
}

// ---------------------------------------------------------------------------
// Handoff tickets: raised by code when the worker hands over, never left to
// the model, so a handoff can't be "forgotten" or invented.
// ---------------------------------------------------------------------------

export const JIRA_CREATE_ISSUE_SLUG = "JIRA_CREATE_ISSUE";
export const JIRA_GET_ISSUE_SLUG = "JIRA_GET_ISSUE";
export const HANDOFF_TICKET_TOOL_ID = "create_handoff_ticket";
export const HANDOFF_COMMENT_TOOL_ID = "comment_on_handoff_ticket";
export const HANDOFF_TICKET_LABEL = "ai-worker-handoff";
/** How much of the conversation goes into the ticket. */
const HANDOFF_TRANSCRIPT_MESSAGES = 20;
const HANDOFF_MESSAGE_CHARS = 1500;
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;

export type HandoffConversation = {
  id: string;
  ticketNumber: number;
  channel: string;
  customerName: string;
  customerEmail: string | null;
  subject: string | null;
  summary: string | null;
  /** A short "what this is about" written for the person picking the ticket up. */
  ticketSummary?: string | null;
  externalTicketKey: string | null;
};

export type HandoffTicketInput = {
  organizationId: string;
  workerName: string;
  conversation: HandoffConversation;
  /** The conversation so far, oldest first, including the latest customer message. */
  transcript: { speaker: string; body: string }[];
  latestMessage: string;
  /** What the worker said in this handoff reply (e.g. its handoff summary), before the ticket notice. */
  workerReply?: string;
  /** Set only for a customer whose email was verified by a code: the ticket may be raised on their behalf. */
  verifiedCustomer?: { email: string; name: string | null };
};

export type HandoffTicketResult = {
  key: string;
  created: boolean;
  /** The ticket's title, when this handoff raised it. */
  title?: string;
  /** The service desk request type it went in as, if it's a request. */
  requestType?: string | null;
};

function clip(text: string, max: number): string {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The ticket's title: the email subject, else the customer's first real
 * message (what they came about). Not their latest one: by handoff time that
 * is usually an answer to an intake question ("ana@acme.com").
 */
export function handoffTicketSummary(input: Pick<HandoffTicketInput, "conversation" | "transcript" | "latestMessage" | "workerName">): string {
  const opening = input.transcript.find(
    (turn) => turn.speaker !== input.workerName && oneLine(turn.body).split(" ").length >= 3,
  );
  const topic = oneLine(input.conversation.subject || opening?.body || input.latestMessage) || "Customer needs help";
  return clip(topic, 120);
}

export function handoffTicketDescription(input: HandoffTicketInput): string {
  const { conversation, workerName } = input;
  const customer = [
    !isPlaceholderCustomerName(conversation.customerName) ? conversation.customerName : null,
    conversation.customerEmail ? `<${conversation.customerEmail}>` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const turns = input.workerReply ? [...input.transcript, { speaker: input.workerName, body: input.workerReply }] : input.transcript;
  const transcript = turns
    .slice(-HANDOFF_TRANSCRIPT_MESSAGES)
    .map((turn) => `**${turn.speaker}:** ${clip(turn.body, HANDOFF_MESSAGE_CHARS)}`)
    .join("\n\n");
  return [
    `${workerName} handed this conversation to a person and raised this ticket automatically.`,
    "",
    `**Customer:** ${customer || "unknown (not given)"}`,
    `**Channel:** ${conversation.channel}`,
    `**Conversation:** #${conversation.ticketNumber}`,
    conversation.ticketSummary ? `\n**Summary:** ${clip(conversation.ticketSummary, 600)}` : "",
    conversation.summary ? `\n**Summary so far:** ${clip(conversation.summary, 2000)}` : "",
    "",
    "**Conversation:**",
    "",
    transcript,
  ]
    .join("\n")
    .trim();
}

/** Composio returns the created issue under `data`, in a shape that has moved between toolkit versions. */
export function issueKeyFrom(result: unknown, depth = 0): string | null {
  if (!result || typeof result !== "object" || depth > 4) return null;
  const record = result as Record<string, unknown>;
  if (typeof record.key === "string" && ISSUE_KEY_PATTERN.test(record.key)) return record.key;
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = issueKeyFrom(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** A write's result, or the reason it didn't go through (Jira's own words where it gave some). */
type WriteOutcome = { ok: true; result: unknown } | { ok: false; error: string };

const ERROR_CHARS = 300;

async function runWrite(
  toolId: string,
  slug: string,
  args: Record<string, unknown>,
  organizationId: string,
  connectedAccountId: string,
): Promise<WriteOutcome> {
  try {
    const result = (await executeTool(slug, args, {
      connectedAccountId,
      userId: organizationId,
      version: JIRA_TOOLKIT_VERSION,
    })) as { successful?: boolean; error?: unknown } | null;
    const failed = result?.successful === false;
    const error = failed ? clip(String(result?.error ?? "Jira didn't accept it"), ERROR_CHARS) : null;
    await logToolCall({
      organizationId,
      toolId,
      calledBy: "system",
      input: args,
      output: toLogOutput(result),
      status: failed ? "error" : "success",
      errorMessage: error,
    });
    return error ? { ok: false, error } : { ok: true, result };
  } catch (thrown) {
    const error = clip(thrown instanceof Error ? thrown.message : String(thrown), ERROR_CHARS);
    await logToolCall({
      organizationId,
      toolId,
      calledBy: "system",
      input: args,
      output: null,
      status: "error",
      errorMessage: error,
    });
    return { ok: false, error };
  }
}

/** The handoff ticket couldn't be raised or updated; `reason` is shown to the manager. */
export type HandoffTicketFailure = { failed: string };

export function isHandoffTicket(outcome: HandoffTicketResult | HandoffTicketFailure | null): outcome is HandoffTicketResult {
  return Boolean(outcome && "key" in outcome);
}

/** Records the outcome on the conversation, so the Inbox and the manager's email can show it. */
async function recordTicketOutcome(
  organizationId: string,
  conversationId: string,
  outcome: { key: string; type?: string | null; priority?: string | null } | { error: string },
): Promise<void> {
  const scope = and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId));
  if ("error" in outcome) {
    await db.update(conversations).set({ externalTicketError: outcome.error }).where(scope);
    return;
  }
  // Only the first handoff's ticket is kept, if two ever race.
  await db
    .update(conversations)
    .set({
      externalTicketKey: sql`coalesce(${conversations.externalTicketKey}, ${outcome.key})`,
      externalTicketType: sql`coalesce(${conversations.externalTicketType}, ${outcome.type ?? null})`,
      externalTicketPriority: sql`coalesce(${conversations.externalTicketPriority}, ${outcome.priority ?? null})`,
      externalTicketError: null,
    })
    .where(scope);
}

/**
 * Raises (or, if this conversation already has one, updates) the Jira ticket
 * for a handoff. Null when Jira isn't connected or isn't set up for handoffs;
 * { failed } when Jira refused, with its reason recorded on the conversation.
 * The handoff itself happens either way, so a Jira problem never leaves a
 * customer without a person. Not retried: a create that timed out may still
 * have created the issue.
 */
export async function recordHandoffInJira(
  input: HandoffTicketInput,
): Promise<HandoffTicketResult | HandoffTicketFailure | null> {
  const { organizationId, conversation } = input;
  const connection = await getConnectionForOrg(organizationId, "helpdesk");
  const connectedAccountId = activeAccount(connection, "jira");
  if (!connection || !connectedAccountId) return null;

  const settings = readJiraSettings(connection.metadata);
  if (conversation.externalTicketKey) {
    const commented = await commentOnHandoffTicket(
      input,
      conversation.externalTicketKey,
      Boolean(settings.requestTypeId) || settings.workerChoosesRequestType,
      connectedAccountId,
    );
    if (!commented.ok) {
      const error = `Couldn't add to ${conversation.externalTicketKey}: ${commented.error}`;
      await recordTicketOutcome(organizationId, conversation.id, { error });
      return { failed: error };
    }
    return { key: conversation.externalTicketKey, created: false };
  }

  if (!settings.createTicketOnHandoff || !settings.projectKey) return null;
  const onBehalf = settings.createCustomers ? input.verifiedCustomer : undefined;
  if (settings.workerChoosesRequestType) {
    return raiseServiceRequest(input, settings.projectKey, "worker", connectedAccountId, null, onBehalf);
  }
  if (settings.requestTypeId) {
    return raiseServiceRequest(input, settings.projectKey, settings.requestTypeId, connectedAccountId, settings.requestTypeName, onBehalf);
  }
  if (!settings.issueType) return null;

  const created = await runWrite(
    HANDOFF_TICKET_TOOL_ID,
    JIRA_CREATE_ISSUE_SLUG,
    {
      project_key: settings.projectKey,
      issue_type: settings.issueType,
      summary: handoffTicketSummary(input),
      description: handoffTicketDescription(input),
      labels: [HANDOFF_TICKET_LABEL],
    },
    organizationId,
    connectedAccountId,
  );
  const key = created.ok ? issueKeyFrom(created.result) : null;
  if (!key) {
    const error = created.ok ? "Jira didn't return a ticket key" : created.error;
    await recordTicketOutcome(organizationId, conversation.id, { error });
    return { failed: error };
  }
  await recordTicketOutcome(organizationId, conversation.id, {
    key,
    type: settings.issueType,
    priority: await ticketPriority(connectedAccountId, key),
  });
  return { key, created: true, title: handoffTicketSummary(input), requestType: null };
}

/**
 * Adds a later handoff to the conversation's ticket, through Jira's own API:
 * Composio's comment action fails without saying why. On a service desk
 * ticket it's an internal note, so the team sees it and the customer isn't
 * emailed; elsewhere a plain comment.
 */
async function commentOnHandoffTicket(
  input: HandoffTicketInput,
  key: string,
  asRequest: boolean,
  connectedAccountId: string,
): Promise<JiraCall> {
  const body = toJiraWikiMarkup(handoffComment(input));
  const post = async (path: string, payload: Record<string, unknown>) => {
    const commented = await callJira(connectedAccountId, "POST", path, payload);
    await logToolCall({
      organizationId: input.organizationId,
      toolId: HANDOFF_COMMENT_TOOL_ID,
      calledBy: "system",
      input: { key, ...payload },
      output: commented.ok ? toLogOutput(commented.data) : null,
      status: commented.ok ? "success" : "error",
      errorMessage: commented.ok ? null : commented.error,
    });
    return commented;
  };
  if (asRequest) {
    const note = await post(`/rest/servicedeskapi/request/${key}/comment`, { body, public: false });
    // A ticket raised before the desk's request type was set isn't a request.
    if (note.ok) return note;
  }
  return post(`/rest/api/2/issue/${key}/comment`, { body });
}

/** A later handoff on the same conversation: what the customer added, and what the worker passed on. */
export function handoffComment(input: Pick<HandoffTicketInput, "latestMessage" | "workerReply" | "workerName">): string {
  return [
    `The customer needs a person again. Their latest message:\n\n${clip(input.latestMessage, HANDOFF_MESSAGE_CHARS)}`,
    input.workerReply ? `${input.workerName} replied:\n\n${clip(input.workerReply, HANDOFF_MESSAGE_CHARS)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The line added to the customer's reply once their ticket exists. */
export function handoffTicketNotice(result: HandoffTicketResult): string {
  return result.created
    ? `I've logged this for the team as ${result.key}, so you can quote that number if you follow up.`
    : `I've added this to your ticket ${result.key} for the team.`;
}

// ---------------------------------------------------------------------------
// The customer's own tickets. The customer agent may only see tickets this
// worker raised for this conversation or for the same customer email — never
// a free-text search of the project, which would show anyone's tickets.
// ---------------------------------------------------------------------------

export const CUSTOMER_TICKETS_TOOL_NAME = "lookup_my_tickets";
const CUSTOMER_TICKET_LIMIT = 10;

export async function customerTicketKeys(organizationId: string, conversationId: string): Promise<string[]> {
  const [conversation] = await db
    .select({
      channel: conversations.channel,
      customerEmail: conversations.customerEmail,
      customerEmailVerifiedAt: conversations.customerEmailVerifiedAt,
      externalTicketKey: conversations.externalTicketKey,
    })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
    .limit(1);
  if (!conversation) return [];

  const keys = conversation.externalTicketKey ? [conversation.externalTicketKey] : [];
  // Other tickets under the same address only for an address that can be relied
  // on: a visitor's typed email would let anyone read someone else's tickets.
  const email = trustedCustomerEmail(conversation)?.trim().toLowerCase();
  if (email) {
    const rows = await db
      .select({ key: conversations.externalTicketKey })
      .from(conversations)
      .where(
        and(
          eq(conversations.organizationId, organizationId),
          ne(conversations.id, conversationId),
          isNotNull(conversations.externalTicketKey),
          sql`lower(${conversations.customerEmail}) = ${email}`,
        ),
      )
      .orderBy(sql`${conversations.updatedAt} desc`)
      .limit(CUSTOMER_TICKET_LIMIT);
    for (const row of rows) if (row.key && !keys.includes(row.key)) keys.push(row.key);
  }
  return keys.slice(0, CUSTOMER_TICKET_LIMIT);
}

type IssueFields = {
  summary?: string;
  status?: { name?: string };
  resolution?: { name?: string } | null;
  updated?: string;
};

function issueFieldsFrom(result: unknown): IssueFields {
  const data = (result as { data?: Record<string, unknown> } | null)?.data ?? {};
  const fields = (data.fields ?? (data.issue as { fields?: unknown } | undefined)?.fields ?? {}) as IssueFields;
  return fields;
}

export async function lookupCustomerTickets(
  organizationId: string,
  conversationId: string | null | undefined,
  connectedAccountId: string,
): Promise<string> {
  const keys = conversationId ? await customerTicketKeys(organizationId, conversationId) : [];
  if (keys.length === 0) {
    return JSON.stringify({
      tickets: [],
      note: "This customer has no tickets on record. If they quote a number you can't find here, tell them a teammate will check it.",
    });
  }
  const tickets = await Promise.all(
    keys.map(async (key) => {
      const result = await runReadTool(
        CUSTOMER_TICKETS_TOOL_NAME,
        JIRA_GET_ISSUE_SLUG,
        { issue_id_or_key: key, fields: ["summary", "status", "resolution", "updated"] },
        organizationId,
        connectedAccountId,
        JIRA_TOOLKIT_VERSION,
      );
      if (result === null) return { key, error: "couldn't be read right now" };
      const fields = issueFieldsFrom(result);
      return {
        key,
        summary: fields.summary ?? null,
        status: fields.status?.name ?? null,
        resolution: fields.resolution?.name ?? null,
        updated: fields.updated ?? null,
      };
    }),
  );
  return JSON.stringify({
    tickets,
    note: "These are this customer's own tickets. Share their status, not internal details.",
  });
}

// ---------------------------------------------------------------------------
// Confluence as knowledge searched before every answer (lib/retrieval.ts),
// full-text rather than the title-only search the model's tool offers.
// ---------------------------------------------------------------------------

export const CONFLUENCE_CQL_SEARCH_SLUG = "CONFLUENCE_CQL_SEARCH";
export const CONFLUENCE_KNOWLEDGE_TOOL_ID = "confluence_knowledge_search";
const CONFLUENCE_MATCH_CHARS = 5000;
/** Candidates fetched per search; re-ranked by title before the best few are kept. */
const CONFLUENCE_CANDIDATES = 15;
const MAX_KEYWORDS = 6;

const STOP_WORDS = new Set(
  (
    "a an and are as at be but by can could do does did for from get got had has have hello hey hi how i if " +
    "in into is it its me my no not of on or our please so some than that the their them then there these " +
    "they this to too up us was we were what when where which who why will with would you your yours thanks " +
    "thank need want help just still also any again"
  ).split(" "),
);

export class ConfluenceKnowledgeError extends Error {}

/** The words worth searching for in a customer's message. */
export function searchKeywords(message: string): string[] {
  const words = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

/**
 * Puts pages whose title carries the customer's words first. Confluence ranks an OR of everyday words
 * ("members", "register") by body text, so the page actually named for the question can fall outside the top few.
 * Words are matched by a shortened stem, so "scheduling" finds "Self-Scheduler" and "register" finds "Registration".
 * Equal scores keep Confluence's own order.
 */
export function rankByTitleMatch<T extends { title: string }>(pages: T[], keywords: string[]): T[] {
  const stems = keywords.map((word) => word.slice(0, Math.max(4, word.length - 3)));
  const score = (title: string) => {
    const lower = title.toLowerCase();
    return stems.filter((stem) => lower.includes(stem)).length;
  };
  return pages
    .map((page, index) => ({ page, index, score: score(page.title) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.page);
}

function cqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Pages containing any of the keywords, best match first (Confluence ranks text searches by relevance). */
export function buildKnowledgeCql(keywords: string[], spaceKeys: string[]): string {
  const terms = keywords.map((word) => `text ~ ${cqlString(word)}`).join(" OR ");
  const spaces = spaceKeys.length > 0 ? ` AND space in (${spaceKeys.map(cqlString).join(", ")})` : "";
  return `type = page AND (${terms})${spaces}`;
}

type CqlResult = {
  title?: string;
  excerpt?: string;
  content?: { id?: string; title?: string; body?: { storage?: { value?: string } } };
};

function cqlResultsFrom(result: unknown): CqlResult[] {
  const data = (result as { data?: unknown } | null)?.data as { results?: unknown; data?: { results?: unknown } } | undefined;
  const results = data?.results ?? data?.data?.results;
  return Array.isArray(results) ? (results as CqlResult[]) : [];
}

export const CONFLUENCE_GET_PAGES_SLUG = "CONFLUENCE_GET_PAGES";
/** Confluence's own cap on one page of results. */
const PAGE_LIST_LIMIT = 250;

type ListedPage = { id?: string; title?: string; body?: { storage?: { value?: string } }; _links?: { webui?: string } };
export type RankedPage = { id: string; title: string; text: string; score: number };

/** How well a page matches the keywords: a title hit counts more than body hits (capped per word). */
export function scorePage(title: string, text: string, keywords: string[]): number {
  const lowerTitle = title.toLowerCase();
  const lowerText = text.toLowerCase();
  let score = 0;
  for (const word of keywords) {
    if (lowerTitle.includes(word)) score += 3;
    score += Math.min(3, lowerText.split(word).length - 1);
  }
  return score;
}

/**
 * The search Confluence would have done, done here: list the space's pages
 * with their text and rank them by keyword. Used when the connection may read
 * pages but not search (Composio's managed Atlassian app has no
 * search:confluence scope unless it's added to the auth config). Only reads
 * the first PAGE_LIST_LIMIT pages, which covers a support knowledge base.
 */
export async function rankPagesByKeywords(
  toolId: string,
  keywords: string[],
  spaceKeys: string[],
  limit: number,
  organizationId: string,
  connectedAccountId: string,
): Promise<RankedPage[] | null> {
  const result = await runReadTool(
    toolId,
    CONFLUENCE_GET_PAGES_SLUG,
    { limit: PAGE_LIST_LIMIT, status: "current", body_format: "storage" },
    organizationId,
    connectedAccountId,
    CONFLUENCE_TOOLKIT_VERSION,
  );
  if (result === null || wasRefused(result)) return null;
  const data = (result as { data?: { results?: unknown } }).data;
  const pages = Array.isArray(data?.results) ? (data.results as ListedPage[]) : [];
  const inSpaces = spaceKeys.map((key) => `/spaces/${key}/`.toLowerCase());
  return pages
    .filter((page) => {
      const link = (page._links?.webui ?? "").toLowerCase();
      return inSpaces.length === 0 || inSpaces.some((space) => link.includes(space));
    })
    .map((page) => {
      const title = page.title ?? "";
      const text = confluenceStorageToText(page.body?.storage?.value ?? "");
      return { id: page.id ?? title, title, text, score: scorePage(title, text, keywords) };
    })
    .filter((page) => page.title && page.text && page.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Null when Confluence isn't connected or isn't set to be searched before
 * answering. Throws ConfluenceKnowledgeError when the search itself fails, so
 * retrieval can report it without taking the answer down.
 */
export async function searchConfluenceKnowledge(
  organizationId: string,
  query: string,
  limit: number,
): Promise<KnowledgeMatch[] | null> {
  const connection = await getConnectionForOrg(organizationId, "knowledge_base");
  const connectedAccountId = activeAccount(connection, "confluence");
  if (!connection || !connectedAccountId) return null;
  const settings = readConfluenceSettings(connection.metadata);
  if (!settings.searchBeforeAnswering) return null;

  const keywords = searchKeywords(query);
  if (keywords.length === 0) return [];

  const result = await runReadTool(
    CONFLUENCE_KNOWLEDGE_TOOL_ID,
    CONFLUENCE_CQL_SEARCH_SLUG,
    { cql: buildKnowledgeCql(keywords, settings.spaceKeys), limit: Math.max(limit, CONFLUENCE_CANDIDATES), expand: "content.body.storage" },
    organizationId,
    connectedAccountId,
    CONFLUENCE_TOOLKIT_VERSION,
  );
  if (result === null) throw new ConfluenceKnowledgeError("Confluence search failed");

  if (wasRefused(result)) {
    const ranked = await rankPagesByKeywords(
      CONFLUENCE_KNOWLEDGE_TOOL_ID,
      keywords,
      settings.spaceKeys,
      limit,
      organizationId,
      connectedAccountId,
    );
    if (ranked === null) throw new ConfluenceKnowledgeError("Confluence search and page listing both failed");
    return rankByTitleMatch(ranked, keywords).map((page, index) => ({
      documentId: `confluence:${page.id}`,
      title: page.title,
      heading: null,
      content: clip(page.text, CONFLUENCE_MATCH_CHARS),
      rank: 1 / (index + 1),
    }));
  }

  const found = cqlResultsFrom(result)
    .map((hit): KnowledgeMatch | null => {
      const title = hit.content?.title ?? hit.title ?? "";
      const text = confluenceStorageToText(hit.content?.body?.storage?.value ?? hit.excerpt ?? "");
      if (!title || !text) return null;
      return {
        documentId: `confluence:${hit.content?.id ?? title}`,
        title,
        heading: null,
        content: clip(text, CONFLUENCE_MATCH_CHARS),
        rank: 0,
      };
    })
    .filter((match): match is KnowledgeMatch => match !== null);
  return rankByTitleMatch(found, keywords)
    .slice(0, limit)
    .map((match, index) => ({ ...match, rank: 1 / (index + 1) }));
}

// ---------------------------------------------------------------------------
// The manager's view (the Assistant): the whole project and every space the
// connection can read. Never given to the customer agent.
// ---------------------------------------------------------------------------

export const MANAGER_JIRA_SEARCH_TOOL_NAME = "search_jira_issues";
export const MANAGER_JIRA_READ_TOOL_NAME = "read_jira_issue";
export const MANAGER_CONFLUENCE_SEARCH_TOOL_NAME = "search_confluence_pages";
const MANAGER_RESULT_CHARS = 12000;
const MANAGER_SEARCH_LIMIT = 20;

function capped(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MANAGER_RESULT_CHARS ? `${text.slice(0, MANAGER_RESULT_CHARS)}… (truncated)` : text;
}

/** The org's active Jira or Confluence account, or a sentence saying it isn't connected. */
export async function managerAccount(
  organizationId: string,
  system: "jira" | "confluence",
): Promise<{ connection: IntegrationConnection; connectedAccountId: string } | string> {
  const connection = await getConnectionForOrg(organizationId, system === "jira" ? "helpdesk" : "knowledge_base");
  const connectedAccountId = activeAccount(connection, system);
  if (!connection || !connectedAccountId) {
    return `${system === "jira" ? "Jira" : "Confluence"} isn't connected. It's connected in Settings > Integrations.`;
  }
  return { connection, connectedAccountId };
}

export function buildManagerJiraJql(query: string, projectKey: string | null): string {
  const text = query.trim() ? `text ~ ${cqlString(query.trim())}` : "";
  const project = projectKey ? `project = ${cqlString(projectKey)}` : "";
  return `${[project, text].filter(Boolean).join(" AND ") || "created >= -30d"} ORDER BY updated DESC`;
}

export async function executeJiraIssueSearch(
  query: string,
  projectKey: string | null,
  organizationId: string,
  connectedAccountId: string,
): Promise<string> {
  const result = await runReadTool(
    MANAGER_JIRA_SEARCH_TOOL_NAME,
    JIRA_SEARCH_ISSUES_SLUG,
    {
      jql: buildManagerJiraJql(query, projectKey),
      fields: ["summary", "status", "assignee", "priority", "updated", "labels"],
      max_results: MANAGER_SEARCH_LIMIT,
    },
    organizationId,
    connectedAccountId,
    JIRA_TOOLKIT_VERSION,
  );
  return result === null ? "Jira search failed. Try again in a moment." : capped(result);
}

export async function executeJiraIssueRead(key: string, organizationId: string, connectedAccountId: string): Promise<string> {
  const result = await runReadTool(
    MANAGER_JIRA_READ_TOOL_NAME,
    JIRA_GET_ISSUE_SLUG,
    {
      issue_id_or_key: key,
      fields: ["summary", "status", "assignee", "reporter", "priority", "description", "comment", "labels", "created", "updated"],
    },
    organizationId,
    connectedAccountId,
    JIRA_TOOLKIT_VERSION,
  );
  return result === null ? `Couldn't read ${key} from Jira right now.` : capped(result);
}

/** Full-text search over page content, for the manager: titles, ids and excerpts. */
export async function executeConfluenceTextSearch(
  query: string,
  spaceKeys: string[],
  organizationId: string,
  connectedAccountId: string,
): Promise<string> {
  const keywords = searchKeywords(query);
  if (keywords.length === 0) return JSON.stringify({ pages: [], note: "Give a few words to search for." });
  const result = await runReadTool(
    MANAGER_CONFLUENCE_SEARCH_TOOL_NAME,
    CONFLUENCE_CQL_SEARCH_SLUG,
    { cql: buildKnowledgeCql(keywords, spaceKeys), limit: CONFLUENCE_SEARCH_LIMIT },
    organizationId,
    connectedAccountId,
    CONFLUENCE_TOOLKIT_VERSION,
  );
  if (result === null) return "Confluence search failed. Try again in a moment.";
  if (wasRefused(result)) {
    const ranked = await rankPagesByKeywords(
      MANAGER_CONFLUENCE_SEARCH_TOOL_NAME,
      keywords,
      spaceKeys,
      CONFLUENCE_SEARCH_LIMIT,
      organizationId,
      connectedAccountId,
    );
    if (ranked === null) return "Confluence search failed. Try again in a moment.";
    return JSON.stringify({ pages: ranked.map((page) => ({ id: page.id, title: page.title, excerpt: page.text.slice(0, 300) })) });
  }
  const pages = cqlResultsFrom(result).map((hit) => ({
    id: hit.content?.id ?? null,
    title: hit.content?.title ?? hit.title ?? null,
    excerpt: hit.excerpt ? confluenceStorageToText(hit.excerpt).slice(0, 300) : null,
  }));
  return JSON.stringify({ pages });
}

// ---------------------------------------------------------------------------
// Jira projects and their issue types, for the settings dialog's dropdowns
// and to check a project/issue type before it's saved: a type the project
// doesn't have makes every handoff ticket fail.
// ---------------------------------------------------------------------------

export const JIRA_LIST_PROJECTS_SLUG = "JIRA_LIST_ALL_PROJECTS";
export const JIRA_PROJECTS_TOOL_ID = "list_jira_projects";

export type JiraProject = { key: string; name: string; issueTypes: string[] };

type RawProject = { key?: string; name?: string; issueTypes?: { name?: string; subtask?: boolean }[] };

/** Every project the connection can see, with the issue types a ticket can be raised as. Null if Jira can't be reached. */
export async function listJiraProjects(organizationId: string, connectedAccountId: string): Promise<JiraProject[] | null> {
  const result = await runReadTool(
    JIRA_PROJECTS_TOOL_ID,
    JIRA_LIST_PROJECTS_SLUG,
    { expand: "issueTypes" },
    organizationId,
    connectedAccountId,
    JIRA_TOOLKIT_VERSION,
  );
  if (result === null || wasRefused(result)) return null;
  const data = (result as { data?: { projects?: unknown } | unknown[] }).data;
  const raw = Array.isArray(data) ? data : Array.isArray((data as { projects?: unknown })?.projects) ? (data as { projects: unknown[] }).projects : [];
  return (raw as RawProject[])
    .filter((project) => project.key)
    .map((project) => ({
      key: project.key as string,
      name: project.name ?? (project.key as string),
      // Sub-tasks need a parent ticket, so a handoff can't be raised as one.
      issueTypes: (project.issueTypes ?? []).filter((type) => !type.subtask && type.name).map((type) => type.name as string),
    }));
}

/** Why this project/issue type pair can't take handoff tickets, or null when it can. */
export function jiraSettingsProblem(projects: JiraProject[], projectKey: string, issueType: string): string | null {
  const project = projects.find((entry) => entry.key === projectKey);
  if (!project) {
    return `There's no project ${projectKey} on this Jira. Projects: ${projects.map((entry) => entry.key).join(", ") || "none"}.`;
  }
  if (!project.issueTypes.includes(issueType)) {
    return `"${issueType}" isn't an issue type in ${projectKey}. Choose one of: ${project.issueTypes.join(", ")}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Jira Service Management. A handoff raised through the service desk's
// request API, rather than as a plain issue, carries a request type, so it
// shows in the desk's queues and on its portal like any other request.
// Composio has no actions for that API, so it's called through Composio's
// proxy, with the connection's own sign-in.
// ---------------------------------------------------------------------------

export const JSM_REQUEST_TOOL_ID = "create_service_request";
export const JSM_REQUEST_TYPES_TOOL_ID = "list_service_desk_request_types";
const ATLASSIAN_SITES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

type JiraCall = { ok: true; data: unknown } | { ok: false; error: string; /** The HTTP status when Jira answered; absent when the call itself failed or timed out. */ status?: number };

const jiraApiBases = new Map<string, string>();

function siteKey(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

/**
 * The connection's Jira REST base through Atlassian's API gateway, which an
 * OAuth sign-in has to use: https://api.atlassian.com/ex/jira/{cloudId}.
 * Null when the connection's site can't be told apart from the others it can see.
 */
export async function jiraApiBase(connectedAccountId: string): Promise<string | null> {
  const cached = jiraApiBases.get(connectedAccountId);
  if (cached) return cached;
  const [site, sites] = await Promise.all([
    getAccountSite(connectedAccountId),
    proxyRequest({ connectedAccountId, endpoint: ATLASSIAN_SITES_URL, method: "GET" }),
  ]);
  const listed = Array.isArray(sites.data) ? (sites.data as { id?: string; url?: string }[]) : [];
  const match = site
    ? listed.find((entry) => entry.url && siteKey(entry.url) === siteKey(site))
    : listed.length === 1
      ? listed[0]
      : undefined;
  if (!match?.id) return null;
  const base = `https://api.atlassian.com/ex/jira/${match.id}`;
  jiraApiBases.set(connectedAccountId, base);
  return base;
}

/** Jira's reason for refusing, from either API's error shape. */
function jiraErrorText(data: unknown): string {
  if (!data || typeof data !== "object") return typeof data === "string" ? data : "";
  const record = data as { errorMessage?: unknown; errorMessages?: unknown; errors?: unknown };
  const parts = [
    typeof record.errorMessage === "string" ? record.errorMessage : null,
    ...(Array.isArray(record.errorMessages) ? record.errorMessages.map(String) : []),
    ...(record.errors && typeof record.errors === "object"
      ? Object.entries(record.errors as Record<string, unknown>).map(([field, message]) => `${field}: ${String(message)}`)
      : []),
  ].filter(Boolean);
  return parts.join("; ");
}

async function callJira(
  connectedAccountId: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<JiraCall> {
  try {
    const base = await jiraApiBase(connectedAccountId);
    if (!base) return { ok: false, error: "Couldn't tell which Jira site this connection is for" };
    const response = await proxyRequest({ connectedAccountId, endpoint: `${base}${path}`, method, body });
    if (response.status >= 400) {
      return { ok: false, status: response.status, error: clip(jiraErrorText(response.data) || `Jira answered ${response.status}`, ERROR_CHARS) };
    }
    return { ok: true, data: response.data };
  } catch (thrown) {
    return { ok: false, error: clip(thrown instanceof Error ? thrown.message : String(thrown), ERROR_CHARS) };
  }
}

function pageValues<T>(data: unknown): T[] {
  const values = (data as { values?: unknown } | null)?.values;
  return Array.isArray(values) ? (values as T[]) : [];
}

/**
 * The priority Jira gave a new ticket (a request type's preset, or what the
 * worker chose), for the Overview. Null if Jira doesn't say.
 */
async function ticketPriority(connectedAccountId: string, key: string): Promise<string | null> {
  const issue = await callJira(connectedAccountId, "GET", `/rest/api/3/issue/${key}?fields=priority`);
  const name = issue.ok ? (issue.data as { fields?: { priority?: { name?: unknown } } } | null)?.fields?.priority?.name : null;
  return typeof name === "string" ? name : null;
}

const jiraSiteCache = new Map<string, { site: string | null; at: number }>();
const SITE_CACHE_MS = 60 * 60 * 1000;

/** The connected Jira site's address (e.g. https://acme.atlassian.net), cached for an hour. Null when no helpdesk is connected. */
export async function jiraSiteUrl(organizationId: string): Promise<string | null> {
  const cached = jiraSiteCache.get(organizationId);
  if (cached && Date.now() - cached.at < SITE_CACHE_MS) return cached.site;
  const connection = await getConnectionForOrg(organizationId, "helpdesk");
  const connectedAccountId = activeAccount(connection, "jira");
  if (!connectedAccountId) return null;
  const found = await getAccountSite(connectedAccountId).catch(() => null);
  const site = found ? found.replace(/\/+$/, "") : null;
  // A failed lookup is not remembered, so the next view tries again.
  if (site) jiraSiteCache.set(organizationId, { site, at: Date.now() });
  return site;
}

/** Where an agent opens a Jira ticket. */
export function jiraTicketUrl(site: string, key: string): string {
  return `${site}/browse/${encodeURIComponent(key)}`;
}

export function clearJiraSiteCache(): void {
  jiraSiteCache.clear();
}

/**
 * What Jira says about one ticket: the request type it was raised as and its
 * priority. For tickets raised before the app kept those with the ticket.
 * Null when no helpdesk is connected; a field Jira doesn't report is null.
 */
export async function readJiraTicketDetails(
  organizationId: string,
  key: string,
): Promise<{ requestType: string | null; priority: string | null } | null> {
  const connection = await getConnectionForOrg(organizationId, "helpdesk");
  const connectedAccountId = activeAccount(connection, "jira");
  if (!connectedAccountId) return null;
  const [request, priority] = await Promise.all([
    callJira(connectedAccountId, "GET", `/rest/servicedeskapi/request/${encodeURIComponent(key)}?expand=requestType`),
    ticketPriority(connectedAccountId, key),
  ]);
  const name = request.ok ? (request.data as { requestType?: { name?: unknown } } | null)?.requestType?.name : null;
  return { requestType: typeof name === "string" && name ? name : null, priority };
}

/**
 * What the connected helpdesk offers, for the Overview's breakdowns: the
 * desk's request types (or the issue type tickets go in as) and the site's
 * priorities, in Jira's order. Null when no helpdesk is set up for handoffs.
 */
export async function helpdeskBreakdownSource(
  organizationId: string,
): Promise<{ project: string; types: string[]; priorities: string[] } | null> {
  const connection = await getConnectionForOrg(organizationId, "helpdesk");
  const connectedAccountId = activeAccount(connection, "jira");
  if (!connection || !connectedAccountId) return null;
  const settings = readJiraSettings(connection.metadata);
  if (!settings.projectKey) return null;
  let types: string[] = settings.issueType ? [settings.issueType] : [];
  if (settings.workerChoosesRequestType || settings.requestTypeId) {
    const catalog = await getRequestTypeCatalog(connectedAccountId, settings.projectKey);
    if (!("problem" in catalog)) types = catalog.requestTypes.map((type) => type.name);
    else if (settings.requestTypeName) types = [settings.requestTypeName];
  }
  const listed = await callJira(connectedAccountId, "GET", "/rest/api/3/priority");
  const priorities =
    listed.ok && Array.isArray(listed.data)
      ? (listed.data as { name?: unknown }[]).map((entry) => entry.name).filter((name): name is string => typeof name === "string")
      : [];
  return { project: settings.projectKey, types, priorities };
}

export type ServiceDesk = { id: string; projectKey: string; requestTypes: { id: string; name: string }[] };

/**
 * Every service desk the connection can see, with the request types a
 * handoff can be raised as. Null if Jira can't be reached; empty when the
 * site has no Jira Service Management.
 */
export async function listServiceDesks(organizationId: string, connectedAccountId: string): Promise<ServiceDesk[] | null> {
  const desks = await callJira(connectedAccountId, "GET", "/rest/servicedeskapi/servicedesk?limit=50");
  if (!desks.ok) {
    await logToolCall({
      organizationId,
      toolId: JSM_REQUEST_TYPES_TOOL_ID,
      calledBy: "system",
      input: {},
      output: null,
      status: "error",
      errorMessage: desks.error,
    });
    return null;
  }
  const listed = pageValues<{ id?: unknown; projectKey?: unknown }>(desks.data).filter(
    (desk) => desk.id != null && typeof desk.projectKey === "string",
  );
  return Promise.all(
    listed.map(async (desk) => {
      const types = await callJira(connectedAccountId, "GET", `/rest/servicedeskapi/servicedesk/${String(desk.id)}/requesttype?limit=100`);
      const requestTypes = types.ok
        ? pageValues<{ id?: unknown; name?: unknown }>(types.data)
            .filter((type) => type.id != null && typeof type.name === "string")
            .map((type) => ({ id: String(type.id), name: type.name as string }))
        : [];
      return { id: String(desk.id), projectKey: desk.projectKey as string, requestTypes };
    }),
  );
}

/** The request type's name, or why this project/request type pair can't take handoffs. */
export function serviceRequestTarget(
  desks: ServiceDesk[],
  projectKey: string,
  requestTypeId: string,
): { name: string } | { problem: string } {
  const desk = desks.find((entry) => entry.projectKey === projectKey);
  if (!desk) return { problem: `${projectKey} isn't a Jira Service Management project, so it has no request types.` };
  const type = desk.requestTypes.find((entry) => entry.id === requestTypeId);
  if (!type) {
    return {
      problem: `That request type isn't in ${projectKey}. Choose one of: ${desk.requestTypes.map((entry) => entry.name).join(", ") || "none"}.`,
    };
  }
  return { name: type.name };
}

// ---------------------------------------------------------------------------
// The worker choosing the request type. The desk's request types, what each
// is for and the fields each needs are read from Jira, never written into
// the code or the prompt by hand, so a new client's desk works as it is.
// ---------------------------------------------------------------------------

/** Filled in by the code on every request, so never asked of the worker. */
const BUILT_IN_REQUEST_FIELDS = new Set(["summary", "description", "attachment"]);
const CATALOG_TTL_MS = 10 * 60 * 1000;
/** Past this, a stale catalog is too old to serve while a fresh one loads. */
const CATALOG_MAX_STALE_MS = 60 * 60 * 1000;
const FIELD_VALUE_CHARS = 2000;

export type RequestFieldKind = "text" | "number" | "option" | "options" | "unsupported";

export type RequestTypeField = {
  fieldId: string;
  name: string;
  required: boolean;
  kind: RequestFieldKind;
  /** For option fields: what Jira accepts (`value`, an option id) and what people see (`label`). */
  options: { value: string; label: string }[];
};

export type CatalogRequestType = { id: string; name: string; description: string; fields: RequestTypeField[] };
export type RequestTypeCatalog = { serviceDeskId: string; projectKey: string; requestTypes: CatalogRequestType[] };

/** What the worker picked: a request type, and a value for each field it filled in. */
export type RequestTypeChoice = {
  requestTypeId: string | null;
  fields: { fieldId: string; values: string[] }[];
  /** A descriptive ticket title the worker wrote, if it wrote one. */
  title?: string;
};

type RawRequestField = {
  fieldId?: unknown;
  name?: unknown;
  required?: unknown;
  validValues?: { value?: unknown; label?: unknown }[];
  jiraSchema?: { type?: unknown; items?: unknown };
};

function fieldKind(schema: RawRequestField["jiraSchema"], hasOptions: boolean): RequestFieldKind {
  const type = typeof schema?.type === "string" ? schema.type : "";
  if (type === "string") return hasOptions ? "option" : "text";
  if (type === "number") return "number";
  if (type === "option" || type === "priority") return "option";
  if (type === "array" && hasOptions) return "options";
  return "unsupported";
}

export function requestTypeFieldsFrom(data: unknown): RequestTypeField[] {
  const raw = (data as { requestTypeFields?: unknown } | null)?.requestTypeFields;
  if (!Array.isArray(raw)) return [];
  return (raw as RawRequestField[])
    .filter((field) => typeof field.fieldId === "string" && !BUILT_IN_REQUEST_FIELDS.has(field.fieldId))
    .map((field) => {
      const options = (field.validValues ?? [])
        .filter((option) => option.value != null && typeof option.label === "string")
        .map((option) => ({ value: String(option.value), label: option.label as string }));
      return {
        fieldId: field.fieldId as string,
        name: typeof field.name === "string" ? field.name : (field.fieldId as string),
        required: field.required === true,
        kind: fieldKind(field.jiraSchema, options.length > 0),
        options,
      };
    });
}

const catalogs = new Map<string, { at: number; catalog: RequestTypeCatalog }>();
/** One load per desk at a time: a burst of turns shares it instead of each reading Jira. */
const catalogLoads = new Map<string, Promise<RequestTypeCatalog | { problem: string }>>();

/** Tests start from an empty cache. */
export function clearRequestTypeCatalogCache(): void {
  catalogs.clear();
  catalogLoads.clear();
}

/**
 * The project's request types with what each is for and the fields each
 * needs, as the desk shows them in its portal. Read on every customer turn,
 * so it is cached, and an expired copy is served while a fresh one loads in
 * the background: the customer who happens to message just after it expires
 * used to wait for every Jira call (about 8 seconds on a desk with nine
 * request types). { problem } if Jira can't be reached or the project isn't
 * a service desk.
 */
export async function getRequestTypeCatalog(
  connectedAccountId: string,
  projectKey: string,
): Promise<RequestTypeCatalog | { problem: string }> {
  const cacheKey = `${connectedAccountId}:${projectKey}`;
  const cached = catalogs.get(cacheKey);
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < CATALOG_TTL_MS) return cached.catalog;
  if (cached && age < CATALOG_MAX_STALE_MS) {
    // A failed refresh keeps the old copy; the next turn tries again.
    void loadCatalogOnce(cacheKey, connectedAccountId, projectKey).catch(() => undefined);
    return cached.catalog;
  }
  return loadCatalogOnce(cacheKey, connectedAccountId, projectKey);
}

function loadCatalogOnce(
  cacheKey: string,
  connectedAccountId: string,
  projectKey: string,
): Promise<RequestTypeCatalog | { problem: string }> {
  const running = catalogLoads.get(cacheKey);
  if (running) return running;
  const load = loadRequestTypeCatalog(connectedAccountId, projectKey).finally(() => catalogLoads.delete(cacheKey));
  catalogLoads.set(cacheKey, load);
  return load;
}

async function loadRequestTypeCatalog(
  connectedAccountId: string,
  projectKey: string,
): Promise<RequestTypeCatalog | { problem: string }> {
  const cacheKey = `${connectedAccountId}:${projectKey}`;
  const desks = await callJira(connectedAccountId, "GET", "/rest/servicedeskapi/servicedesk?limit=50");
  if (!desks.ok) return { problem: `Couldn't find the ${projectKey} service desk: ${desks.error}` };
  const desk = pageValues<{ id?: unknown; projectKey?: unknown }>(desks.data).find((entry) => entry.projectKey === projectKey);
  if (desk?.id == null) return { problem: `${projectKey} isn't a Jira Service Management project` };
  const serviceDeskId = String(desk.id);

  const types = await callJira(connectedAccountId, "GET", `/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype?limit=100`);
  if (!types.ok) return { problem: `Couldn't read ${projectKey}'s request types: ${types.error}` };
  // A request type in no portal group (e.g. "Emailed request") isn't one a
  // customer can ask for: it describes how a ticket arrived, not what it's about.
  const listed = pageValues<{ id?: unknown; name?: unknown; description?: unknown; groupIds?: unknown }>(types.data).filter(
    (type) =>
      type.id != null && typeof type.name === "string" && !(Array.isArray(type.groupIds) && type.groupIds.length === 0),
  );
  if (listed.length === 0) return { problem: `${projectKey} has no request types` };

  // One call per request type, all at once: read one after another they were most of the load time.
  const loaded = await Promise.all(
    listed.map(async (type) => {
      const id = String(type.id);
      const fields = await callJira(connectedAccountId, "GET", `/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype/${id}/field`);
      return { type, id, fields };
    }),
  );
  const requestTypes: CatalogRequestType[] = [];
  for (const { type, id, fields } of loaded) {
    if (!fields.ok) return { problem: `Couldn't read the fields of "${String(type.name)}": ${fields.error}` };
    requestTypes.push({
      id,
      name: type.name as string,
      description: typeof type.description === "string" ? oneLine(type.description) : "",
      fields: requestTypeFieldsFrom(fields.data),
    });
  }
  const catalog = { serviceDeskId, projectKey, requestTypes };
  catalogs.set(cacheKey, { at: Date.now(), catalog });
  return catalog;
}

function describeField(field: RequestTypeField, withIds: boolean): string {
  const name = withIds ? `${field.name} [${field.fieldId}]` : field.name;
  if (!field.options.length) return name;
  const labels = field.options.map((option) => option.label).join(", ");
  return `${name} (${field.kind === "options" ? "one or more of" : "one of"}: ${labels})`;
}

/**
 * The desk's request types as the worker reads them: id, name, what it's for,
 * and what it needs. With field ids for the chooser, which fills them in;
 * without for the conversation, where only the names matter.
 */
export function describeRequestTypes(catalog: RequestTypeCatalog, options: { fieldIds?: boolean } = {}): string {
  const withIds = options.fieldIds === true;
  return catalog.requestTypes
    .map((type) => {
      const required = type.fields.filter((field) => field.required);
      const optional = type.fields.filter((field) => !field.required && field.kind !== "unsupported");
      return [
        `- [${type.id}] ${type.name}${type.description ? `: ${type.description}` : ""}`,
        required.length ? `  Needs: ${required.map((field) => describeField(field, withIds)).join("; ")}` : "",
        optional.length ? `  Optional: ${optional.map((field) => describeField(field, withIds)).join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

/**
 * The part of the customer agent's instructions that tells it which kinds of
 * ticket the desk takes and what each needs, so it collects that before it
 * hands over. Empty when the worker doesn't choose request types, or the desk
 * can't be read (the handoff then fails visibly, never silently).
 */
export async function requestTypeGuidance(organizationId: string): Promise<string> {
  try {
    const connection = await getConnectionForOrg(organizationId, "helpdesk");
    const connectedAccountId = activeAccount(connection, "jira");
    if (!connection || !connectedAccountId) return "";
    const settings = readJiraSettings(connection.metadata);
    // Not tied to the ticket switch: with tickets off, the worker still gathers what the desk's form asks for,
    // so a test conversation shows exactly what a real one would collect.
    if (!settings.workerChoosesRequestType || !settings.projectKey) return "";
    const catalog = await getRequestTypeCatalog(connectedAccountId, settings.projectKey);
    if ("problem" in catalog) return "";
    const opening = settings.createTicketOnHandoff
      ? "a ticket is raised on the team's service desk under the kind of request below that fits it."
      : "the team's service desk takes it as the kind of request below that fits it (no ticket is raised yet, but collect everything as if one were).";
    return (
      "\n\nHelpdesk tickets: when you hand a conversation to a person, " +
      opening +
      " Work out which kind it is yourself: never ask the customer to " +
      "pick a category, and never mention request types, ids or field names. If two kinds could fit, ask one plain " +
      "question that tells them apart (for example: did this work before, or is it something new? Is it stopping " +
      "everyone from working, or just this task?). Judge anything you can from what they've said yourself, such as " +
      "how urgent it is from how much it stops their work; never ask the customer to choose a priority.\n" +
      "Ask only what's necessary. Before each question, check whether the team could act on the ticket without " +
      "coming back to the customer: what happened or what's wanted, where, who it affects, and what that kind of " +
      "request needs. If the conversation already makes that clear, don't ask anything more. Ask only for facts " +
      "only the customer knows, in plain words, one or two at a time.\n" +
      "Before you hand over, the conversation must contain what that kind of request needs. If something is missing, " +
      "ask for it and end that reply with [[FOLLOWUP]], not [[ESCALATE]]; hand over once you have it. This holds even " +
      "where other rules say to hand over, because a handoff without those details raises no ticket. The one " +
      "exception: if something is down for the customer's users, hand over straight away.\n" +
      `Kinds of request:\n${describeRequestTypes(catalog)}`
    );
  } catch {
    return "";
  }
}

/**
 * Turns the worker's choice into what Jira's request API takes, or says
 * what's wrong with it in words the worker can act on: a request type the
 * desk doesn't have, a required field left out, an option that isn't offered.
 */
export function requestFieldValuesFor(
  catalog: RequestTypeCatalog,
  choice: RequestTypeChoice,
): { requestTypeId: string; name: string; values: Record<string, unknown> } | { problem: string } {
  const type = catalog.requestTypes.find((entry) => entry.id === choice.requestTypeId);
  if (!type) {
    return {
      problem: choice.requestTypeId
        ? `There's no request type ${choice.requestTypeId}. Choose one of the ids listed.`
        : "No request type was chosen. Choose one of the ids listed.",
    };
  }
  const given = new Map(
    choice.fields
      .map((field) => [field.fieldId, field.values.map((value) => value.trim()).filter(Boolean)] as const)
      .filter(([, values]) => values.length > 0),
  );
  const values: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const field of type.fields) {
    const raw = given.get(field.fieldId);
    if (!raw) {
      if (field.required) problems.push(`${field.name} is required for ${type.name}`);
      continue;
    }
    if (field.kind === "unsupported") {
      if (field.required) problems.push(`${field.name} can't be filled in by the worker`);
      continue;
    }
    if (field.kind === "text") {
      values[field.fieldId] = clip(raw.join("\n"), FIELD_VALUE_CHARS);
      continue;
    }
    if (field.kind === "number") {
      const number = Number(raw[0]);
      if (Number.isFinite(number)) values[field.fieldId] = number;
      else problems.push(`${field.name} must be a number`);
      continue;
    }
    const picked = raw.map((value) =>
      field.options.find(
        (option) => option.value === value || option.label.toLowerCase() === value.toLowerCase(),
      ),
    );
    if (picked.some((option) => !option)) {
      problems.push(`${field.name} must be one of: ${field.options.map((option) => option.label).join(", ")}`);
      continue;
    }
    const ids = picked.map((option) => ({ id: option!.value }));
    values[field.fieldId] = field.kind === "options" ? ids : ids[0];
  }
  if (problems.length) return { problem: `${problems.join("; ")}.` };
  return { requestTypeId: type.id, name: type.name, values };
}

/** The ticket description in Jira's wiki markup, which the request API renders (bold is *x*, not **x**). */
export function toJiraWikiMarkup(markdown: string): string {
  return markdown.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
}

type RequestTarget = {
  serviceDeskId: string;
  requestTypeId: string;
  values: Record<string, unknown>;
  title?: string;
  requestTypeName?: string | null;
};

const TITLE_CHARS = 120;

/** The worker's title, if it's a real one; otherwise the ticket keeps the conversation's own topic. */
export function workerTitle(title: string | undefined): string | undefined {
  const value = oneLine(title ?? "").replace(/^["']|["']$/g, "");
  return value.length >= 8 ? clip(value, TITLE_CHARS) : undefined;
}

/** The conversation as the request type chooser reads it. */
function conversationText(input: HandoffTicketInput): string {
  const turns = input.workerReply ? [...input.transcript, { speaker: input.workerName, body: input.workerReply }] : input.transcript;
  return turns
    .slice(-HANDOFF_TRANSCRIPT_MESSAGES)
    .map((turn) => `${turn.speaker}: ${clip(turn.body, HANDOFF_MESSAGE_CHARS)}`)
    .join("\n");
}

/**
 * The worker's request type for this handoff, checked against the desk. A
 * choice the desk can't take goes back once with the reason; if the second
 * one can't be used either, there's no ticket rather than a wrong one.
 */
async function workerChosenTarget(
  input: HandoffTicketInput,
  projectKey: string,
  connectedAccountId: string,
): Promise<RequestTarget | { problem: string }> {
  const catalog = await getRequestTypeCatalog(connectedAccountId, projectKey);
  if ("problem" in catalog) return catalog;
  const catalogText = describeRequestTypes(catalog, { fieldIds: true });
  const conversation = conversationText(input);
  let problem: string | undefined;
  // Once the worker has named a real request type, the retry is only for its
  // fields: switching to a type that asks for less would be a fallback.
  let keepType: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const choice = await chooseRequestType({ catalogText, conversation, problem, keepRequestTypeId: keepType });
    if (!("problem" in choice) && keepType && choice.requestTypeId !== keepType) {
      problem = `It switched from request type ${keepType} to ${choice.requestTypeId ?? "none"} to get round a required field.`;
      break;
    }
    const resolved = "problem" in choice ? choice : requestFieldValuesFor(catalog, choice);
    if (!("problem" in resolved)) {
      return {
        serviceDeskId: catalog.serviceDeskId,
        requestTypeId: resolved.requestTypeId,
        values: resolved.values,
        title: "problem" in choice ? undefined : workerTitle(choice.title),
        requestTypeName: resolved.name,
      };
    }
    problem = resolved.problem;
    if (!("problem" in choice) && catalog.requestTypes.some((type) => type.id === choice.requestTypeId)) {
      keepType = choice.requestTypeId;
    }
  }
  return { problem: `${input.workerName} couldn't choose a request type: ${problem}` };
}

async function fixedTarget(
  projectKey: string,
  requestTypeId: string,
  connectedAccountId: string,
  requestTypeName: string | null,
): Promise<RequestTarget | { problem: string }> {
  const desks = await callJira(connectedAccountId, "GET", "/rest/servicedeskapi/servicedesk?limit=50");
  if (!desks.ok) return { problem: `Couldn't find the ${projectKey} service desk: ${desks.error}` };
  const desk = pageValues<{ id?: unknown; projectKey?: unknown }>(desks.data).find((entry) => entry.projectKey === projectKey);
  if (desk?.id == null) return { problem: `${projectKey} isn't a Jira Service Management project` };
  return { serviceDeskId: String(desk.id), requestTypeId, values: {}, requestTypeName };
}

async function raiseServiceRequest(
  input: HandoffTicketInput,
  projectKey: string,
  /** A fixed request type id, or "worker" for the worker to choose one. */
  requestType: string,
  connectedAccountId: string,
  /** The fixed request type's name, for showing it. */
  requestTypeName: string | null = null,
  /** A verified customer to raise the request for, when Create customers is on. */
  onBehalf?: { email: string; name: string | null },
): Promise<HandoffTicketResult | HandoffTicketFailure> {
  const { organizationId, conversation } = input;
  const fail = async (error: string): Promise<HandoffTicketFailure> => {
    await recordTicketOutcome(organizationId, conversation.id, { error });
    return { failed: error };
  };

  const target =
    requestType === "worker"
      ? await workerChosenTarget(input, projectKey, connectedAccountId)
      : await fixedTarget(projectKey, requestType, connectedAccountId, requestTypeName);
  if ("problem" in target) return fail(target.problem);

  // A customer problem never blocks the ticket: without the account it is raised
  // as the connected account, with the customer's address in the description.
  const customer = onBehalf
    ? await ensureJiraCustomer({ organizationId, connectedAccountId, serviceDeskId: target.serviceDeskId, ...onBehalf })
    : null;
  const raiseOnBehalfOf = customer && "accountId" in customer ? customer.accountId : null;

  const request = {
    serviceDeskId: target.serviceDeskId,
    requestTypeId: target.requestTypeId,
    requestFieldValues: {
      ...target.values,
      summary: target.title ?? handoffTicketSummary(input),
      description: toJiraWikiMarkup(handoffTicketDescription(input)),
    },
    ...(raiseOnBehalfOf ? { raiseOnBehalfOf } : {}),
  };
  let created = await callJira(connectedAccountId, "POST", "/rest/servicedeskapi/request", request);
  // Jira answering 4xx means nothing was created (typically the connected
  // account may not raise on behalf of others), so raising as ourselves is safe.
  // A call that failed without an answer may have created it, so it is not repeated.
  if (!created.ok && raiseOnBehalfOf && created.status && created.status >= 400 && created.status < 500) {
    const { raiseOnBehalfOf: _dropped, ...plain } = request;
    void _dropped;
    created = await callJira(connectedAccountId, "POST", "/rest/servicedeskapi/request", plain);
  }
  const issueKey = created.ok ? (created.data as { issueKey?: unknown } | null)?.issueKey : null;
  const key = typeof issueKey === "string" && ISSUE_KEY_PATTERN.test(issueKey) ? issueKey : null;
  await logToolCall({
    organizationId,
    toolId: JSM_REQUEST_TOOL_ID,
    calledBy: "system",
    input: request,
    output: created.ok ? toLogOutput(created.data) : null,
    status: key ? "success" : "error",
    errorMessage: key ? null : created.ok ? "Jira didn't return a ticket key" : created.error,
  });
  if (!key) return fail(created.ok ? "Jira didn't return a ticket key" : created.error);

  // The request API can't set labels, so the label that marks the worker's
  // tickets goes on afterwards. A ticket without it is still a good ticket.
  await callJira(connectedAccountId, "PUT", `/rest/api/3/issue/${key}`, {
    update: { labels: [{ add: HANDOFF_TICKET_LABEL }] },
  });
  await recordTicketOutcome(organizationId, conversation.id, {
    key,
    type: target.requestTypeName ?? null,
    priority: await ticketPriority(connectedAccountId, key),
  });
  return { key, created: true, title: request.requestFieldValues.summary, requestType: target.requestTypeName ?? null };
}


// ---------------------------------------------------------------------------
// Jira Service Management customers: find one by email, create one for a
// visitor whose email was verified, and add them to the desk so a request can
// be raised on their behalf. Soft-failing: a problem here never stops a ticket.
// ---------------------------------------------------------------------------

export const JIRA_CUSTOMER_TOOL_ID = "jira_customer";
const CUSTOMER_LOOKUP_WAIT_MS = 4000;

type CustomerRecord = { accountId?: unknown; emailAddress?: unknown };

function accountIdFrom(records: CustomerRecord[], email: string): string | null {
  const wanted = email.trim().toLowerCase();
  for (const record of records) {
    if (typeof record.accountId !== "string") continue;
    if (typeof record.emailAddress === "string" && record.emailAddress.trim().toLowerCase() === wanted) return record.accountId;
  }
  return null;
}

async function logCustomerCall(organizationId: string, action: string, input: Record<string, unknown>, outcome: { ok: boolean; detail: string }) {
  try {
    await logToolCall({
      organizationId,
      toolId: JIRA_CUSTOMER_TOOL_ID,
      calledBy: "system",
      input: { action, ...input },
      output: { detail: outcome.detail },
      status: outcome.ok ? "success" : "error",
      errorMessage: outcome.ok ? null : outcome.detail,
    });
  } catch {
    // The audit row must not stop the ticket.
  }
}

/** The desk's customer with this email, or null. { problem } if Jira couldn't say. */
export async function findJiraCustomer(
  connectedAccountId: string,
  serviceDeskId: string,
  email: string,
): Promise<{ accountId: string } | null | { problem: string }> {
  const viaDesk = await callJira(
    connectedAccountId,
    "GET",
    `/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer?query=${encodeURIComponent(email)}&limit=50`,
  );
  if (viaDesk.ok) {
    const found = accountIdFrom(pageValues<CustomerRecord>(viaDesk.data), email);
    if (found) return { accountId: found };
  }
  // The desk's customer search is not offered everywhere; the user search sees customers too.
  const viaUsers = await callJira(connectedAccountId, "GET", `/rest/api/3/user/search?query=${encodeURIComponent(email)}`);
  if (viaUsers.ok) {
    const found = accountIdFrom(Array.isArray(viaUsers.data) ? (viaUsers.data as CustomerRecord[]) : [], email);
    return found ? { accountId: found } : null;
  }
  return viaDesk.ok ? null : { problem: viaDesk.error };
}

/**
 * Whether this email is already a customer of the connected service desk.
 * Null when there is no helpdesk, or Jira couldn't say in time. Read-only.
 */
export async function lookupJiraCustomerByEmail(organizationId: string, email: string): Promise<boolean | null> {
  try {
    const connection = await getConnectionForOrg(organizationId, "helpdesk");
    const connectedAccountId = activeAccount(connection, "jira");
    if (!connection || !connectedAccountId) return null;
    const { projectKey } = readJiraSettings(connection.metadata);
    if (!projectKey) return null;
    const lookup = (async () => {
      const desks = await callJira(connectedAccountId, "GET", "/rest/servicedeskapi/servicedesk?limit=50");
      if (!desks.ok) return null;
      const desk = pageValues<{ id?: unknown; projectKey?: unknown }>(desks.data).find((entry) => entry.projectKey === projectKey);
      if (desk?.id == null) return null;
      const found = await findJiraCustomer(connectedAccountId, String(desk.id), email);
      return found && "accountId" in found ? true : found === null ? false : null;
    })();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CUSTOMER_LOOKUP_WAIT_MS));
    return await Promise.race([lookup, timeout]);
  } catch {
    return null;
  }
}

/**
 * The customer's account on the desk: found, or created and added. Only ever
 * called for an email a code was typed back for. { problem } says what failed.
 */
export async function ensureJiraCustomer(input: {
  organizationId: string;
  connectedAccountId: string;
  serviceDeskId: string;
  email: string;
  name: string | null;
}): Promise<{ accountId: string; created: boolean } | { problem: string }> {
  const { organizationId, connectedAccountId, serviceDeskId, email, name } = input;
  const existing = await findJiraCustomer(connectedAccountId, serviceDeskId, email);
  if (existing && "accountId" in existing) {
    await logCustomerCall(organizationId, "found", { email }, { ok: true, detail: "Customer already exists" });
    return { accountId: existing.accountId, created: false };
  }
  if (existing && "problem" in existing) {
    await logCustomerCall(organizationId, "lookup", { email }, { ok: false, detail: existing.problem });
    return { problem: existing.problem };
  }

  const made = await callJira(connectedAccountId, "POST", "/rest/servicedeskapi/customer", {
    email,
    displayName: name && !isPlaceholderCustomerName(name) ? name : email,
  });
  const accountId = made.ok ? (made.data as { accountId?: unknown } | null)?.accountId : null;
  if (typeof accountId !== "string" || !accountId) {
    const problem = made.ok ? "Jira didn't return the new customer's account" : made.error;
    await logCustomerCall(organizationId, "create", { email }, { ok: false, detail: problem });
    return { problem };
  }
  const added = await callJira(connectedAccountId, "POST", `/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer`, {
    accountIds: [accountId],
  });
  await logCustomerCall(organizationId, "create", { email }, { ok: true, detail: added.ok ? "Created and added to the desk" : `Created; adding to the desk failed: ${added.error}` });
  return { accountId, created: true };
}
