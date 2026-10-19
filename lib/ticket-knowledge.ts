/**
 * Resolved Jira tickets, made safe to turn into knowledge articles.
 *
 * The Assistant's ordinary Jira tools hand a model the raw ticket, and the
 * generic tool runner writes that raw result into the tool-call log. For
 * tickets that can hold client details that is the wrong shape, so this path
 * is separate: it calls Jira directly (read-only), redacts in code, and
 * returns only the redacted problem and resolution. The raw result is never
 * logged and never leaves this module.
 */

import { executeTool } from "@/lib/tools-integrations/composio-client";
import { logToolCall } from "@/lib/tools-integrations/tool-call-log";
import { isSensitiveTicketText, looksLikeItStillHoldsAName, redactTicketText } from "@/lib/ticket-redaction";

export const RESOLVED_TICKETS_TOOL_NAME = "get_resolved_tickets_for_knowledge";

const JIRA_SEARCH_ISSUES_SLUG = "JIRA_SEARCH_ISSUES";
const JIRA_TOOLKIT_VERSION = "20260915_00";

export const TICKETS_DEFAULT_LIMIT = 10;
export const TICKETS_MAX_LIMIT = 25;
const FIELD_CHARS = 900;
const COMMENTS_USED = 2;

export type RedactedTicket = {
  requestType: string | null;
  priority: string | null;
  problem: string;
  resolution: string | null;
  /** True when the text may still hold a name; the reviewer should read it closely. */
  checkForNames: boolean;
};

export type ResolvedTicketsResult = {
  tickets: RedactedTicket[];
  /** Left out because they mention health or identity documents. */
  excludedSensitive: number;
  /** Left out because there was nothing usable to write an article from. */
  excludedEmpty: number;
  /** The earliest resolution date seen, so the next call can continue from there. */
  oldestResolved: string | null;
};

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Plain text from Atlassian Document Format, or the string itself when Jira sent wiki text. */
export function adfToText(node: unknown): string {
  if (typeof node === "string") return node;
  const item = obj(node);
  if (!item) return "";
  const type = str(item.type);
  if (type === "text") return str(item.text);
  if (type === "mention") return "[name]";
  if (type === "hardBreak") return "\n";
  const content = Array.isArray(item.content) ? item.content : [];
  const inner = content.map(adfToText).join("");
  return ["paragraph", "heading", "listItem", "codeBlock", "blockquote", "tableRow"].includes(type) ? `${inner}\n` : inner;
}

function issuesFrom(result: unknown): unknown[] | null {
  const top = obj(result);
  const data = obj(top?.data);
  const nested = obj(data?.data);
  for (const holder of [data, nested, top]) {
    for (const key of ["issues", "results", "values"]) {
      const list = holder?.[key];
      if (Array.isArray(list)) return list;
    }
  }
  return null;
}

function personName(value: unknown): string {
  const person = obj(value);
  return str(person?.displayName) || str(person?.name);
}

function personId(value: unknown): string {
  const person = obj(value);
  return str(person?.accountId) || str(person?.emailAddress) || str(person?.displayName);
}

function nameOf(value: unknown): string | null {
  const named = obj(value);
  return str(named?.name) || null;
}

function clip(text: string): string {
  return text.length > FIELD_CHARS ? `${text.slice(0, FIELD_CHARS).trimEnd()}…` : text;
}

export function redactIssue(issue: unknown): { ticket: RedactedTicket | null; reason?: "sensitive" | "empty"; resolved: string | null } {
  const fields = obj(obj(issue)?.fields) ?? {};
  const resolved = str(fields.resolutiondate) || null;

  const reporter = personId(fields.reporter);
  const comments = (Array.isArray(obj(fields.comment)?.comments) ? (obj(fields.comment)?.comments as unknown[]) : [])
    .map((entry) => obj(entry))
    .filter((entry): entry is Json => entry !== null);

  // Everyone named on the ticket is a name to remove from its text.
  const names = [personName(fields.reporter), personName(fields.creator), personName(fields.assignee), ...comments.map((c) => personName(c.author))].filter(Boolean);

  const summary = adfToText(fields.summary).trim();
  const description = adfToText(fields.description).trim();
  const teamComments = comments
    .filter((c) => personId(c.author) && personId(c.author) !== reporter)
    .map((c) => adfToText(c.body).trim())
    .filter(Boolean)
    .slice(-COMMENTS_USED);

  const rawProblem = [summary, description].filter(Boolean).join("\n");
  const rawResolution = teamComments.join("\n\n");
  if (!rawProblem) return { ticket: null, reason: "empty", resolved };

  // Judged on the raw text: redaction could remove the very words that mark it sensitive.
  if (isSensitiveTicketText(`${rawProblem}\n${rawResolution}`)) return { ticket: null, reason: "sensitive", resolved };

  const problem = redactTicketText(rawProblem, names).text;
  const resolution = rawResolution ? redactTicketText(rawResolution, names).text : "";
  if (!problem) return { ticket: null, reason: "empty", resolved };

  return {
    ticket: {
      requestType: nameOf(fields.issuetype),
      priority: nameOf(fields.priority),
      problem: clip(problem),
      resolution: resolution ? clip(resolution) : null,
      checkForNames: looksLikeItStillHoldsAName(problem) || looksLikeItStillHoldsAName(resolution),
    },
    resolved,
  };
}

/** Turns Jira's search result into redacted tickets. Returns null when the result isn't a list of issues. */
export function redactSearchResult(result: unknown, limit: number): ResolvedTicketsResult | null {
  const issues = issuesFrom(result);
  if (!issues) return null;

  const tickets: RedactedTicket[] = [];
  let excludedSensitive = 0;
  let excludedEmpty = 0;
  let oldestResolved: string | null = null;

  for (const issue of issues.slice(0, limit)) {
    const { ticket, reason, resolved } = redactIssue(issue);
    if (resolved && (!oldestResolved || resolved < oldestResolved)) oldestResolved = resolved;
    if (ticket) tickets.push(ticket);
    else if (reason === "sensitive") excludedSensitive++;
    else excludedEmpty++;
  }
  return { tickets, excludedSensitive, excludedEmpty, oldestResolved };
}

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,19}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function resolvedTicketsJql(projectKey: string, resolvedBefore: string | null): string {
  const before = resolvedBefore && DATE_ONLY.test(resolvedBefore) ? ` AND resolved < "${resolvedBefore}"` : "";
  return `project = "${projectKey}" AND statusCategory = Done${before} ORDER BY resolved DESC`;
}

/**
 * Reads resolved tickets from one project and returns them redacted, as the
 * JSON text the Assistant tool hands back. Only counts are logged, never the
 * ticket text. Any failure is reported in a sentence, without the raw result.
 */
export async function fetchRedactedResolvedTickets(input: {
  organizationId: string;
  connectedAccountId: string;
  projectKey: string;
  limit: number;
  resolvedBefore: string | null;
}): Promise<string> {
  const projectKey = input.projectKey.trim().toUpperCase();
  if (!PROJECT_KEY.test(projectKey)) return "That isn't a valid Jira project key (for example EESD).";
  const limit = Math.min(Math.max(Math.trunc(input.limit) || TICKETS_DEFAULT_LIMIT, 1), TICKETS_MAX_LIMIT);
  const args = {
    jql: resolvedTicketsJql(projectKey, input.resolvedBefore),
    fields: ["summary", "description", "comment", "issuetype", "priority", "reporter", "creator", "assignee", "resolutiondate"],
    max_results: limit,
  };

  let raw: unknown;
  try {
    raw = await executeTool(JIRA_SEARCH_ISSUES_SLUG, args, {
      connectedAccountId: input.connectedAccountId,
      userId: input.organizationId,
      version: JIRA_TOOLKIT_VERSION,
    });
  } catch {
    await logToolCall({
      organizationId: input.organizationId,
      toolId: RESOLVED_TICKETS_TOOL_NAME,
      calledBy: "assistant",
      input: { projectKey, limit },
      status: "error",
      errorMessage: "Jira search failed",
    });
    return "Jira search failed. Try again in a moment.";
  }

  if ((raw as { successful?: boolean } | null)?.successful === false) {
    await logToolCall({
      organizationId: input.organizationId,
      toolId: RESOLVED_TICKETS_TOOL_NAME,
      calledBy: "assistant",
      input: { projectKey, limit },
      status: "error",
      errorMessage: "Jira refused the search",
    });
    return `Jira refused that search for ${projectKey}. The connected account may not be able to read that project.`;
  }

  const redacted = redactSearchResult(raw, limit);
  if (!redacted) {
    await logToolCall({
      organizationId: input.organizationId,
      toolId: RESOLVED_TICKETS_TOOL_NAME,
      calledBy: "assistant",
      input: { projectKey, limit },
      status: "error",
      errorMessage: "Unrecognised result shape",
    });
    return "Jira answered, but not in a shape I can read safely, so nothing was returned.";
  }

  await logToolCall({
    organizationId: input.organizationId,
    toolId: RESOLVED_TICKETS_TOOL_NAME,
    calledBy: "assistant",
    input: { projectKey, limit, resolvedBefore: input.resolvedBefore },
    output: {
      returned: redacted.tickets.length,
      excludedSensitive: redacted.excludedSensitive,
      excludedEmpty: redacted.excludedEmpty,
    },
    status: "success",
  });

  return JSON.stringify({
    project: projectKey,
    ...redacted,
    note:
      "Details were removed automatically, but that can miss names. Write generic how-to articles from these, never copy a " +
      "sentence that looks like it names a person or company, and ask the manager to read each article before approving it.",
  });
}
