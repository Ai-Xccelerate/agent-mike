import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { fetchRedactedResolvedTickets, type RedactedTicket } from "@/lib/ticket-knowledge";

// Reads the connected Jira per request: never statically prerender or cache this route.
export const dynamic = "force-dynamic";

const BATCH = 25;
const DEFAULT_COUNT = 100;
const MAX_COUNT = 300;

/**
 * A sample of the helpdesk's resolved tickets with client details already removed, for replaying how customers really
 * write against the worker. Read-only. Details are removed in code before anything leaves the server, and tickets that
 * mention health or identity documents, hold a credential, are database work, or may still hold a name are left out
 * and counted (the same filter the Assistant's knowledge tool uses).
 *
 *   ?project=EESD   the Jira project to read (default EESD)
 *   ?count=120      about how many tickets to look at, in batches of 25 (default 100, at most 300)
 *
 * Paging happens here, not in a model: the Assistant has to pass Jira's paging token back itself, which it did not do
 * reliably. Org admins only.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  const project = (params.get("project") || "EESD").trim().toUpperCase();
  const count = Math.min(Math.max(Math.trunc(Number(params.get("count") || DEFAULT_COUNT)) || DEFAULT_COUNT, 1), MAX_COUNT);

  const connection = await getConnectionForOrg(tenant.orgId, "helpdesk");
  if (!connection || connection.system !== "jira" || connection.status !== "active" || !connection.composioConnectedAccountId) {
    return NextResponse.json({ error: "Jira isn't connected for this organization" }, { status: 409 });
  }

  const tickets: RedactedTicket[] = [];
  const left = { sensitive: 0, internal: 0, heldBack: 0, empty: 0, unreadable: 0 };
  let read = 0;
  let token: string | null = null;
  let finished = false;
  let stoppedBecause: string | null = null;
  const seen = new Set<string>();

  while (read < count) {
    const reply = await fetchRedactedResolvedTickets({
      organizationId: tenant.orgId,
      connectedAccountId: connection.composioConnectedAccountId,
      projectKey: project,
      limit: Math.min(BATCH, count - read),
      nextPageToken: token,
    });
    let batch: {
      tickets?: RedactedTicket[];
      excludedSensitive?: number;
      excludedInternal?: number;
      heldBackForReview?: number;
      excludedEmpty?: number;
      unreadable?: number;
      nextPageToken?: string | null;
    };
    try {
      batch = JSON.parse(reply);
    } catch {
      // The tool answers a problem in plain words: pass it on rather than guess.
      stoppedBecause = reply.slice(0, 300);
      break;
    }
    const found = batch.tickets ?? [];
    tickets.push(...found);
    left.sensitive += batch.excludedSensitive ?? 0;
    left.internal += batch.excludedInternal ?? 0;
    left.heldBack += batch.heldBackForReview ?? 0;
    left.empty += batch.excludedEmpty ?? 0;
    left.unreadable += batch.unreadable ?? 0;
    const looked =
      found.length + (batch.excludedSensitive ?? 0) + (batch.excludedInternal ?? 0) + (batch.heldBackForReview ?? 0) + (batch.excludedEmpty ?? 0) + (batch.unreadable ?? 0);
    read += looked;
    token = batch.nextPageToken ?? null;
    if (!token) {
      finished = true;
      break;
    }
    if (seen.has(token) || looked === 0) {
      stoppedBecause = "Jira's paging did not advance, so the read stopped.";
      break;
    }
    seen.add(token);
  }

  return NextResponse.json({
    project,
    asked: count,
    read,
    kept: tickets.length,
    leftOut: left,
    reachedTheEnd: finished,
    ...(stoppedBecause ? { stoppedBecause } : {}),
    tickets,
  });
}
