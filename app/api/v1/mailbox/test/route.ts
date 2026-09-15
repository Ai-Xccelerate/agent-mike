import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { checkNylasConnection, isNylasConfigured } from "@/lib/nylas";
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

  if (!isNylasConfigured()) {
    return NextResponse.json({
      ...empty,
      error: "Set NYLAS_CLIENT_ID and NYLAS_API_KEY on the API service.",
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

  return NextResponse.json(await checkNylasConnection(mailbox.grantId));
}
