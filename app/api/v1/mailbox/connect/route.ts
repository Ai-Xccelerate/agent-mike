import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import {
  DEFAULT_SCOPES,
  buildAuthUrl,
  callbackUri,
  resolveNylasCredentials,
  signState,
} from "@/lib/nylas";

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
  const profile = await getOrCreateProfile(tenant.orgId);

  const resolved = await resolveNylasCredentials(tenant.orgId);
  if (!resolved) {
    return NextResponse.json(
      {
        error: "No Nylas application is configured for this agent",
        errors: {
          mailbox: "Add a Nylas client ID and API key below, or set them fleet-wide on the API service.",
        },
      },
      { status: 422 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
  const loginHint =
    typeof body?.email === "string" && body.email.trim() ? body.email.trim() : profile.email;

  const redirectUri = callbackUri(req.nextUrl.origin);

  try {
    const url = buildAuthUrl({
      credentials: resolved.values,
      redirectUri,
      // Signed rather than stored: the callback has no session to look anything
      // up in, and an unsigned state would let anyone bind a mailbox they
      // control to someone else's worker.
      state: signState(tenant.orgId, tenant.userId),
      provider: provider || null,
      loginHint: loginHint || null,
      scopes: DEFAULT_SCOPES,
    });
    return NextResponse.json({ redirectUrl: url, redirectUri });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Nylas auth";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
