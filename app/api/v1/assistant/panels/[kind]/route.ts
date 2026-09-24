import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isPanelKind, loadPanel } from "@/lib/assistant-panels";

// Reads live settings per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Live data for one interactive panel in an admin Assistant reply. Read-only:
 * a panel's buttons go back through the chat route as proposals.
 */
export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isPanelKind(params.kind)) {
    return NextResponse.json({ error: "Unknown panel" }, { status: 404 });
  }
  return NextResponse.json(await loadPanel(tenant.orgId, params.kind));
}
