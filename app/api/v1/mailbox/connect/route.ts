import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicAppUrl } from "@/lib/env";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { ConnectionFlowError, startMailboxConnection } from "@/lib/connection-flows";

// Starts an OAuth flow per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Settings > Identity > "Connect mailbox".
 *
 * Returns the Nylas hosted-auth URL for the browser to visit. The redirect is
 * handed back as JSON rather than issued here so the caller is a normal fetch
 * from the settings screen — a 302 out of an XHR would be swallowed.
 *
 * `login_hint` is seeded from the worker's configured address so the manager
 * lands on the right account, but Nylas is the authority on what actually got
 * connected: whatever address comes back from the token exchange is what gets
 * stored.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
  const loginHint =
    typeof body?.email === "string" && body.email.trim() ? body.email.trim() : profile.email;

  try {
    const result = await startMailboxConnection({
      organizationId: tenant.orgId,
      userId: tenant.userId,
      appOrigin: publicAppUrl() || req.nextUrl.origin,
      provider: provider || null,
      loginHint: loginHint || null,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConnectionFlowError) {
      return NextResponse.json(
        { error: error.message, ...(error.field ? { errors: { mailbox: error.field } } : {}) },
        { status: error.status },
      );
    }
    throw error;
  }
}
