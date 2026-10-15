import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { computeTickets } from "@/lib/tickets";

// Reads the DB per request: never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/** The Tickets page: every customer conversation as a ticket row, with the queue counts. No message bodies. */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  return NextResponse.json(await computeTickets({ organizationId: tenant.orgId }));
}
