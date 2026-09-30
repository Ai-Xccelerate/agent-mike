/**
 * Which Composio actions the worker may run on its own, and which wait for a
 * manager.
 *
 * Every action a connected integration offers falls into one tier:
 *
 *   read     — look things up. Always runs.
 *   routine  — the everyday support writes: create a ticket, add a comment,
 *              mark it resolved, update a contact, create an event. Runs on
 *              its own unless the worker requires approval for every write.
 *   email    — sends or replies from a connected mailbox. Runs on its own only
 *              when every recipient is this conversation's own customer;
 *              anyone else waits for a manager.
 *   risky    — reassigning, bulk changes, sharing, anything we can't place.
 *              Always waits for a manager.
 *   delete   — removing records. Always waits for a manager.
 *
 * The tier comes from the action's slug (JIRA_DELETE_ISSUE,
 * GMAIL_FETCH_EMAILS…), with Composio's own read-only / destructive hints
 * honoured when present. Anything the rules can't place is risky: an action
 * we don't understand should cost a manager a click, not run by itself.
 */

export type ActionTier = "read" | "routine" | "email" | "risky" | "delete";

/** Toolkits whose send/reply actions deliver real email. */
const EMAIL_TOOLKITS = new Set(["gmail", "outlook"]);

const DELETE_WORDS = new Set(["DELETE", "REMOVE", "TRASH", "PURGE", "DESTROY", "ERASE", "UNSUBSCRIBE"]);

/** Verbs that reach beyond one record or one person: always a manager's call. */
const RISKY_VERBS = new Set([
  "BULK",
  "BATCH",
  "ASSIGN",
  "UNASSIGN",
  "SHARE",
  "INVITE",
  "MOVE",
  "ARCHIVE",
  "FORWARD",
  "IMPORT",
  "MERGE",
  "TRANSFER",
]);

/** Things that are fine to read but risky to change (UPDATE_USER, SET_PRIORITY, ADD_MEMBER…). */
const RISKY_NOUNS = new Set([
  "PRIORITY",
  "PERMISSION",
  "PERMISSIONS",
  "USER",
  "USERS",
  "MEMBER",
  "MEMBERS",
  "ROLE",
  "ROLES",
  "SETTINGS",
  "WEBHOOK",
  "WEBHOOKS",
  "ACL",
  "OWNER",
  "ASSIGNEE",
]);

const EMAIL_SEND_WORDS = new Set(["SEND", "REPLY"]);

/**
 * Verbs only. Nouns such as COMMENT or DRAFT appear in reads too
 * (JIRA_GET_COMMENT), so ADD_COMMENT / CREATE_EMAIL_DRAFT count as writes
 * through their verb, not their noun.
 */
const ROUTINE_WORDS = new Set([
  "CREATE",
  "ADD",
  "UPDATE",
  "EDIT",
  "UPSERT",
  "TRANSITION",
  "MARK",
  "PATCH",
  "UPLOAD",
  "SET",
  "INSERT",
  "MODIFY",
  "APPEND",
  "RESOLVE",
  "CLOSE",
  "REOPEN",
]);

const READ_WORDS = new Set([
  "GET",
  "LIST",
  "SEARCH",
  "FETCH",
  "FIND",
  "QUERY",
  "READ",
  "RETRIEVE",
  "COUNT",
  "CHECK",
  "DOWNLOAD",
  "VIEW",
  "LOOKUP",
  "DESCRIBE",
]);

function slugWords(slug: string): string[] {
  return slug.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

function hasAny(words: string[], set: Set<string>): boolean {
  return words.some((word) => set.has(word));
}

function hasTag(tags: readonly string[] | undefined, name: string): boolean {
  return Boolean(tags?.some((tag) => tag.toLowerCase() === name.toLowerCase()));
}

export function classifyAction(input: { slug: string; toolkit: string; tags?: readonly string[] }): ActionTier {
  const words = slugWords(input.slug);
  const toolkit = input.toolkit.toLowerCase();

  // Deletes first: a "read-only" hint on a slug that says DELETE is wrong
  // about one of the two, and the safe reading is the destructive one.
  if (hasAny(words, DELETE_WORDS) || hasTag(input.tags, "destructiveHint")) return "delete";

  // BULK/BATCH alone don't make a write: GMAIL_BATCH_GET is still a read.
  const writes =
    hasAny(words, ROUTINE_WORDS) ||
    hasAny(words, EMAIL_SEND_WORDS) ||
    words.some((word) => RISKY_VERBS.has(word) && word !== "BULK" && word !== "BATCH");
  if (!writes && (hasAny(words, READ_WORDS) || hasTag(input.tags, "readOnlyHint"))) return "read";

  if (hasAny(words, RISKY_VERBS) || hasAny(words, RISKY_NOUNS)) return "risky";
  if (hasAny(words, EMAIL_SEND_WORDS)) return EMAIL_TOOLKITS.has(toolkit) ? "email" : "risky";
  if (hasAny(words, ROUTINE_WORDS)) return "routine";
  return "risky";
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Argument names that carry who an email goes to, across Gmail and Outlook actions. */
function isRecipientKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("recipient") ||
    k === "to" ||
    k === "cc" ||
    k === "bcc" ||
    k === "to_email" ||
    k === "to_emails" ||
    k === "reply_to" ||
    k === "torecipients" ||
    k === "ccrecipients" ||
    k === "bccrecipients"
  );
}

function collectEmails(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.match(EMAIL_PATTERN) ?? []) out.add(match.toLowerCase());
  } else if (Array.isArray(value)) {
    for (const item of value) collectEmails(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectEmails(item, out);
  }
}

/** Every address an email action would deliver to, read from its recipient arguments only (not the body). */
export function emailRecipients(args: Record<string, unknown>): string[] {
  const found = new Set<string>();
  for (const [key, value] of Object.entries(args)) {
    if (isRecipientKey(key)) collectEmails(value, found);
  }
  return [...found];
}

export type ActionDecision = { run: true } | { run: false; reason: string };

/**
 * Run now, or queue for a manager. `requireWriteApproval` is the worker's
 * master switch: on (the default), every non-read action waits.
 */
export function decideAction(input: {
  tier: ActionTier;
  requireWriteApproval: boolean;
  args: Record<string, unknown>;
  customerEmail?: string | null;
}): ActionDecision {
  const { tier } = input;
  if (tier === "read") return { run: true };
  if (tier === "delete") return { run: false, reason: "Deleting always needs a manager's approval." };
  if (tier === "risky") return { run: false, reason: "This kind of change needs a manager's approval." };
  if (input.requireWriteApproval) {
    return { run: false, reason: "This worker is set to have a manager approve every change." };
  }
  if (tier === "routine") return { run: true };

  const customer = (input.customerEmail || "").trim().toLowerCase();
  const recipients = emailRecipients(input.args);
  if (customer && recipients.length > 0 && recipients.every((address) => address === customer)) {
    return { run: true };
  }
  return { run: false, reason: "Emailing anyone other than this conversation's customer needs a manager's approval." };
}
