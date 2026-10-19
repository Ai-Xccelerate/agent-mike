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
import {
  isInternalEngineeringText,
  isSensitiveTicketText,
  looksLikeItStillHoldsAName,
  redactTicketText,
} from "@/lib/ticket-redaction";

export const RESOLVED_TICKETS_TOOL_NAME = "get_resolved_tickets_for_knowledge";

const JIRA_SEARCH_ISSUES_SLUG = "JIRA_SEARCH_ISSUES";
const JIRA_GET_ISSUE_SLUG = "JIRA_GET_ISSUE";
const JIRA_TOOLKIT_VERSION = "20260915_00";
/** Tickets read at once; each is its own Jira call. */
const READ_CONCURRENCY = 5;

export const TICKETS_DEFAULT_LIMIT = 4;
export const TICKETS_MAX_LIMIT = 25;
const FIELD_CHARS = 900;
const COMMENTS_USED = 2;

export type RedactedTicket = {
  requestType: string | null;
  priority: string | null;
  problem: string;
  resolution: string | null;
};

export type ResolvedTicketsResult = {
  tickets: RedactedTicket[];
  /** Left out because they mention health or identity documents, or contained a password or key. */
  excludedSensitive: number;
  /** Left out because they are engineers' database work, not something to publish to customers. */
  excludedInternal: number;
  /** Held back because a name or company may still be in the text after redaction. Never passed on. */
  heldBackForReview: number;
  /** Left out because there was nothing usable to write an article from. */
  excludedEmpty: number;
  /** Left out because Jira wouldn't return the ticket to this account. */
  unreadable: number;
  /** Pass back as nextPageToken to continue with the next batch; null when there are no more. */
  nextPageToken: string | null;
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

export function redactIssue(issue: unknown): {
  ticket: RedactedTicket | null;
  reason?: "sensitive" | "internal" | "review" | "empty";
  resolved: string | null;
} {
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

  // Engineers' database work is not a customer-facing how-to, and its text is full of record ids.
  if (isInternalEngineeringText(`${rawProblem}\n${rawResolution}`)) return { ticket: null, reason: "internal", resolved };

  const redactedProblem = redactTicketText(rawProblem, names);
  const redactedResolution = rawResolution ? redactTicketText(rawResolution, names) : { text: "", counts: {} as Record<string, number> };
  // A ticket that held a password, key or username is dropped whole, not trusted to be clean after one replacement.
  if ((redactedProblem.counts.secrets ?? 0) + (redactedResolution.counts.secrets ?? 0) + (redactedProblem.counts.usernames ?? 0) + (redactedResolution.counts.usernames ?? 0) > 0) {
    return { ticket: null, reason: "sensitive", resolved };
  }
  const problem = redactedProblem.text;
  const resolution = redactedResolution.text;
  if (!problem) return { ticket: null, reason: "empty", resolved };

  // A name or company that may have survived is not passed on at all: it can't be taken back once a model has it.
  if (looksLikeItStillHoldsAName(problem) || looksLikeItStillHoldsAName(resolution)) return { ticket: null, reason: "review", resolved };

  return {
    ticket: {
      requestType: nameOf(fields.issuetype),
      priority: nameOf(fields.priority),
      problem: clip(problem),
      resolution: resolution ? clip(resolution) : null,
    },
    resolved,
  };
}

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/**
 * Composio's search returns flat records ({key, summary, ...}) with no comments, so
 * all that is taken from it is the ticket keys and the paging token. Everything
 * else is read ticket by ticket, below.
 */
export function keysFromSearchResult(result: unknown): { keys: string[]; nextPageToken: string | null } | null {
  const issues = issuesFrom(result);
  if (!issues) return null;
  const keys = issues
    .map((issue) => str(obj(issue)?.key))
    .filter((key) => ISSUE_KEY.test(key));
  const top = obj(result);
  const data = obj(top?.data);
  const token = str(data?.next_page_token) || str(data?.nextPageToken) || str(top?.next_page_token);
  return { keys, nextPageToken: token || null };
}

/** The issue itself from a get-issue reply: {data: {key, fields}}, one level deeper, or bare. */
export function issueFromGetResult(result: unknown): unknown | null {
  const top = obj(result);
  for (const candidate of [obj(top?.data), obj(obj(top?.data)?.data), top]) {
    if (candidate && obj(candidate.fields)) return candidate;
  }
  return null;
}

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,19}$/;
const PAGE_TOKEN = /^[A-Za-z0-9_=.+/-]{1,2000}$/;

export function resolvedTicketsJql(projectKey: string): string {
  return `project = "${projectKey}" AND statusCategory = Done ORDER BY resolved DESC`;
}

const GET_ISSUE_FIELDS = ["summary", "description", "comment", "issuetype", "priority", "reporter", "creator", "assignee", "resolutiondate"];

async function logOutcome(
  organizationId: string,
  input: Record<string, unknown>,
  status: "success" | "error",
  output: Record<string, unknown> | null,
  errorMessage: string | null,
) {
  await logToolCall({ organizationId, toolId: RESOLVED_TICKETS_TOOL_NAME, calledBy: "assistant", input, output, status, errorMessage });
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
  nextPageToken: string | null;
}): Promise<string> {
  const projectKey = input.projectKey.trim().toUpperCase();
  if (!PROJECT_KEY.test(projectKey)) return "That isn't a valid Jira project key (for example EESD).";
  const limit = Math.min(Math.max(Math.trunc(input.limit) || TICKETS_DEFAULT_LIMIT, 1), TICKETS_MAX_LIMIT);
  const token = input.nextPageToken && PAGE_TOKEN.test(input.nextPageToken) ? input.nextPageToken : null;
  const logged = { projectKey, limit, paged: token !== null };
  const run = (slug: string, args: Record<string, unknown>) =>
    executeTool(slug, args, { connectedAccountId: input.connectedAccountId, userId: input.organizationId, version: JIRA_TOOLKIT_VERSION });

  let search: unknown;
  try {
    search = await run(JIRA_SEARCH_ISSUES_SLUG, {
      jql: resolvedTicketsJql(projectKey),
      fields: ["summary"],
      max_results: limit,
      ...(token ? { next_page_token: token } : {}),
    });
  } catch {
    await logOutcome(input.organizationId, logged, "error", null, "Jira search failed");
    return "Jira search failed. Try again in a moment.";
  }
  if ((search as { successful?: boolean } | null)?.successful === false) {
    await logOutcome(input.organizationId, logged, "error", null, "Jira refused the search");
    return `Jira refused that search for ${projectKey}. The connected account may not be able to read that project.`;
  }
  const found = keysFromSearchResult(search);
  if (!found) {
    await logOutcome(input.organizationId, logged, "error", null, "Unrecognised search result shape");
    return "Jira answered, but not in a shape I can read safely, so nothing was returned.";
  }

  const tickets: RedactedTicket[] = [];
  let excludedSensitive = 0;
  let excludedInternal = 0;
  let heldBackForReview = 0;
  let excludedEmpty = 0;
  let unreadable = 0;
  const keys = found.keys.slice(0, limit);
  for (let i = 0; i < keys.length; i += READ_CONCURRENCY) {
    const batch = await Promise.all(
      keys.slice(i, i + READ_CONCURRENCY).map(async (key) => {
        try {
          const reply = await run(JIRA_GET_ISSUE_SLUG, { issue_id_or_key: key, fields: GET_ISSUE_FIELDS });
          if ((reply as { successful?: boolean } | null)?.successful === false) return "unreadable" as const;
          const issue = issueFromGetResult(reply);
          return issue ? redactIssue(issue) : ("unreadable" as const);
        } catch {
          return "unreadable" as const;
        }
      }),
    );
    for (const result of batch) {
      if (result === "unreadable") unreadable++;
      else if (result.ticket) tickets.push(result.ticket);
      else if (result.reason === "sensitive") excludedSensitive++;
      else if (result.reason === "internal") excludedInternal++;
      else if (result.reason === "review") heldBackForReview++;
      else excludedEmpty++;
    }
  }

  await logOutcome(input.organizationId, logged, "success", { returned: tickets.length, excludedSensitive, excludedInternal, heldBackForReview, excludedEmpty, unreadable }, null);

  const result: ResolvedTicketsResult = {
    tickets,
    excludedSensitive,
    excludedInternal,
    heldBackForReview,
    excludedEmpty,
    unreadable,
    nextPageToken: found.nextPageToken,
  };
  return JSON.stringify({
    project: projectKey,
    ...result,
    note:
      "Details were removed automatically and tickets that may still hold a name, company or credential were held back, " +
      "but nothing here is guaranteed clean. Write generic customer-facing how-to articles only, skip anything that reads as an " +
      "internal procedure, never copy a sentence that looks like it names a person or company, and ask the manager to read " +
      "each article before approving it.",
  });
}
