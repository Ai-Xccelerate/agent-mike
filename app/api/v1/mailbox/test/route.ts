import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { checkNylasConnection, resolveNylasCredentials } from "@/lib/nylas";
import { getMailbox } from "@/lib/mailbox-repository";

// Calls out per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Identity > Mailbox > "Test connection".
 *
 * Always 200 — a failed test is a result to render, not a failed request.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const empty = {
    ok: false,
    email: null,
    provider: null,
    messageCount: 0,
    recentMessages: [],
    upcomingEvents: [],
  };

  const resolved = await resolveNylasCredentials(tenant.orgId);
  if (!resolved) {
    return NextResponse.json({
      ...empty,
      error: "No Nylas application is configured for this agent.",
      errorKind: "unconfigured",
    });
  }

  const mailbox = await getMailbox(tenant.orgId);
  if (!mailbox) {
    return NextResponse.json({
      ...empty,
      error: "No mailbox is connected yet.",
      errorKind: "grant_invalid",
    });
  }

  return NextResponse.json(await checkNylasConnection(resolved.values, mailbox.grantId));
}
