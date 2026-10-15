import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { jiraSiteUrl, jiraTicketUrl, readJiraTicketDetails } from "@/lib/tools-integrations/atlassian";

/**
 * What the Tickets pages take from Jira for a ticket the worker raised: a link
 * to open it, and the request type and priority for tickets raised before the
 * app kept them. Nothing here is required: with no Jira, or Jira down, the
 * ticket just has no link and keeps whatever it already had.
 */

/** A ticket Jira did not describe is not asked about again for this long. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
const attempts = new Map<string, number>();

export function clearBackfillAttempts(): void {
  attempts.clear();
}

type TicketRow = Pick<
  typeof conversations.$inferSelect,
  "id" | "organizationId" | "externalTicketKey" | "externalTicketType" | "externalTicketPriority"
>;

export type JiraBackfill = { externalTicketType: string | null; externalTicketPriority: string | null };

/**
 * Fills the request type and priority a ticket is missing from Jira, and only
 * those: what is already stored is never overwritten. Returns the stored
 * values after the call, or null when there was nothing to do or Jira said
 * nothing.
 */
export async function backfillFromJira(row: TicketRow, now = Date.now()): Promise<JiraBackfill | null> {
  const key = row.externalTicketKey;
  if (!key || (row.externalTicketType && row.externalTicketPriority)) return null;
  const last = attempts.get(row.id);
  if (last !== undefined && now - last < RETRY_AFTER_MS) return null;
  attempts.set(row.id, now);

  const details = await readJiraTicketDetails(row.organizationId, key).catch(() => null);
  if (!details) return null;
  const externalTicketType = row.externalTicketType ?? details.requestType;
  const externalTicketPriority = row.externalTicketPriority ?? details.priority;
  if (externalTicketType === row.externalTicketType && externalTicketPriority === row.externalTicketPriority) return null;

  // coalesce keeps whatever a handoff stored meanwhile.
  await db
    .update(conversations)
    .set({
      externalTicketType: sql`coalesce(${conversations.externalTicketType}, ${externalTicketType ?? null})`,
      externalTicketPriority: sql`coalesce(${conversations.externalTicketPriority}, ${externalTicketPriority ?? null})`,
    })
    .where(eq(conversations.id, row.id));
  return { externalTicketType: externalTicketType ?? null, externalTicketPriority: externalTicketPriority ?? null };
}

/** The connected Jira site, or null when no helpdesk is connected or Jira can't be asked. */
export async function jiraSiteFor(organizationId: string): Promise<string | null> {
  return jiraSiteUrl(organizationId).catch(() => null);
}

/** The Jira link for a ticket key, or null when no helpdesk is connected. */
export async function jiraLinkFor(organizationId: string, key: string | null): Promise<string | null> {
  if (!key) return null;
  const site = await jiraSiteFor(organizationId);
  return site ? jiraTicketUrl(site, key) : null;
}

/** Gives up on a slow Jira rather than holding a page open for it. */
export function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
