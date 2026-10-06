import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import type { KnowledgeMatch } from "@/lib/knowledge";
import { executeTool } from "@/lib/tools-integrations/composio-client";
import { getConnectionForOrg, type IntegrationConnection } from "@/lib/tools-integrations/connection-repository";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";

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
  /** An issue type that exists in that project, e.g. "Task" or a service desk's request type name. */
  issueType: z.string().trim().min(1).max(80).nullable(),
  /** Raise a ticket the moment the worker hands a conversation to a person. */
  createTicketOnHandoff: z.boolean(),
});

export type JiraSettings = z.infer<typeof jiraSettingsSchema>;

export const confluenceSettingsSchema = z.object({
  /** Only search this space, e.g. "SK". Null = every space the connection can read. */
  spaceKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_~]{1,255}$/, "A Confluence space key is letters and digits (e.g. SK)")
    .nullable(),
  /** Search the space before every answer, not only when the model decides to look. */
  searchBeforeAnswering: z.boolean(),
});

export type ConfluenceSettings = z.infer<typeof confluenceSettingsSchema>;

export function jiraSettingsDefaults(): JiraSettings {
  return { projectKey: null, issueType: null, createTicketOnHandoff: true };
}

export function confluenceSettingsDefaults(): ConfluenceSettings {
  return { spaceKey: null, searchBeforeAnswering: true };
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
  return readSettings(metadata, confluenceSettingsSchema, confluenceSettingsDefaults());
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
export const JIRA_ADD_COMMENT_SLUG = "JIRA_ADD_COMMENT";
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
};

export type HandoffTicketResult = { key: string; created: boolean };

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
    conversation.customerName && conversation.customerName !== "Website visitor" ? conversation.customerName : null,
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
  outcome: { key: string } | { error: string },
): Promise<void> {
  const scope = and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId));
  if ("error" in outcome) {
    await db.update(conversations).set({ externalTicketError: outcome.error }).where(scope);
    return;
  }
  // Only the first handoff's ticket is kept, if two ever race.
  await db
    .update(conversations)
    .set({ externalTicketKey: sql`coalesce(${conversations.externalTicketKey}, ${outcome.key})`, externalTicketError: null })
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

  if (conversation.externalTicketKey) {
    const commented = await runWrite(
      HANDOFF_COMMENT_TOOL_ID,
      JIRA_ADD_COMMENT_SLUG,
      { issue_id_or_key: conversation.externalTicketKey, comment: handoffComment(input) },
      organizationId,
      connectedAccountId,
    );
    if (!commented.ok) {
      const error = `Couldn't add to ${conversation.externalTicketKey}: ${commented.error}`;
      await recordTicketOutcome(organizationId, conversation.id, { error });
      return { failed: error };
    }
    return { key: conversation.externalTicketKey, created: false };
  }

  const settings = readJiraSettings(connection.metadata);
  if (!settings.createTicketOnHandoff || !settings.projectKey || !settings.issueType) return null;

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
  await recordTicketOutcome(organizationId, conversation.id, { key });
  return { key, created: true };
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
    .select({ customerEmail: conversations.customerEmail, externalTicketKey: conversations.externalTicketKey })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
    .limit(1);
  if (!conversation) return [];

  const keys = conversation.externalTicketKey ? [conversation.externalTicketKey] : [];
  const email = conversation.customerEmail?.trim().toLowerCase();
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
const CONFLUENCE_MATCH_CHARS = 3000;
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

function cqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Pages containing any of the keywords, best match first (Confluence ranks text searches by relevance). */
export function buildKnowledgeCql(keywords: string[], spaceKey: string | null): string {
  const terms = keywords.map((word) => `text ~ ${cqlString(word)}`).join(" OR ");
  return `type = page AND (${terms})${spaceKey ? ` AND space = ${cqlString(spaceKey)}` : ""}`;
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
  spaceKey: string | null,
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
  const inSpace = spaceKey ? `/spaces/${spaceKey}/`.toLowerCase() : null;
  return pages
    .filter((page) => !inSpace || (page._links?.webui ?? "").toLowerCase().includes(inSpace))
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
    { cql: buildKnowledgeCql(keywords, settings.spaceKey), limit, expand: "content.body.storage" },
    organizationId,
    connectedAccountId,
    CONFLUENCE_TOOLKIT_VERSION,
  );
  if (result === null) throw new ConfluenceKnowledgeError("Confluence search failed");

  if (wasRefused(result)) {
    const ranked = await rankPagesByKeywords(
      CONFLUENCE_KNOWLEDGE_TOOL_ID,
      keywords,
      settings.spaceKey,
      limit,
      organizationId,
      connectedAccountId,
    );
    if (ranked === null) throw new ConfluenceKnowledgeError("Confluence search and page listing both failed");
    return ranked.map((page, index) => ({
      documentId: `confluence:${page.id}`,
      title: page.title,
      heading: null,
      content: clip(page.text, CONFLUENCE_MATCH_CHARS),
      rank: 1 / (index + 1),
    }));
  }

  return cqlResultsFrom(result)
    .map((hit, index): KnowledgeMatch | null => {
      const title = hit.content?.title ?? hit.title ?? "";
      const text = confluenceStorageToText(hit.content?.body?.storage?.value ?? hit.excerpt ?? "");
      if (!title || !text) return null;
      return {
        documentId: `confluence:${hit.content?.id ?? title}`,
        title,
        heading: null,
        content: clip(text, CONFLUENCE_MATCH_CHARS),
        rank: 1 / (index + 1),
      };
    })
    .filter((match): match is KnowledgeMatch => match !== null)
    .slice(0, limit);
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
  spaceKey: string | null,
  organizationId: string,
  connectedAccountId: string,
): Promise<string> {
  const keywords = searchKeywords(query);
  if (keywords.length === 0) return JSON.stringify({ pages: [], note: "Give a few words to search for." });
  const result = await runReadTool(
    MANAGER_CONFLUENCE_SEARCH_TOOL_NAME,
    CONFLUENCE_CQL_SEARCH_SLUG,
    { cql: buildKnowledgeCql(keywords, spaceKey), limit: CONFLUENCE_SEARCH_LIMIT },
    organizationId,
    connectedAccountId,
    CONFLUENCE_TOOLKIT_VERSION,
  );
  if (result === null) return "Confluence search failed. Try again in a moment.";
  if (wasRefused(result)) {
    const ranked = await rankPagesByKeywords(
      MANAGER_CONFLUENCE_SEARCH_TOOL_NAME,
      keywords,
      spaceKey,
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
