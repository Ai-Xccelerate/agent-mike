import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { firstAllowedOrigin } from "@/lib/env";
import {
  NylasError,
  callbackUri,
  exchangeCodeForGrant,
  resolveNylasCredentials,
  verifyState,
} from "@/lib/nylas";
import { saveMailbox } from "@/lib/mailbox-repository";

// Exchanges a one-time code per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Where Nylas returns the manager after they authorise the mailbox.
 *
 * This is a browser navigation, not an API call, so it answers with a redirect
 * back to Settings rather than JSON — the outcome is carried as a query
 * parameter for the screen to render.
 *
 * Unlike the Composio flow, Nylas hands *us* the code and we do the exchange.
 * That is why this route exists at all, and why `state` has to be verified
 * here: it is the only thing tying this request back to the org that started
 * it. Without that check anyone could call this endpoint with their own code
 * and bind a mailbox they control to another org's worker.
 */
function settingsUrl(req: NextRequest, params: Record<string, string>): string {
  // The frontend and this API commonly live on different hosts (split
  // deploy) — req.nextUrl.origin is this API's own origin, which doesn't
  // serve /settings/tools, so prefer the configured allowed origin.
  const base = firstAllowedOrigin() || req.nextUrl.origin;
  // The mailbox card lives under Tools > External tools, so that is where the
  // manager must land to see whether the connection took.
  const url = new URL("/settings/tools", base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const providerError = req.nextUrl.searchParams.get("error");

  // The user pressed cancel, or the provider refused. Not an error worth a 500.
  if (providerError) {
    return NextResponse.redirect(
      settingsUrl(req, { mailbox: "error", reason: providerError.slice(0, 120) }),
    );
  }

  if (!code) {
    return NextResponse.redirect(settingsUrl(req, { mailbox: "error", reason: "missing_code" }));
  }

  let issued: ReturnType<typeof verifyState>;
  try {
    issued = verifyState(state);
  } catch {
    // NYLAS_STATE_SECRET/ENCRYPTION_KEY missing — a server misconfiguration,
    // not something the user did; land them on an error rather than a 500.
    return NextResponse.redirect(settingsUrl(req, { mailbox: "error", reason: "server_misconfigured" }));
  }
  if (!issued) {
    // Expired, tampered with, or replayed. Never fall back to a default org —
    // that would be the exact hijack this check exists to prevent.
    return NextResponse.redirect(settingsUrl(req, { mailbox: "error", reason: "invalid_state" }));
  }

  try {
    // The org comes from the signed state, so the right agent's credentials
    // can be resolved even though this request carries no session.
    const resolved = await resolveNylasCredentials(issued.orgId);
    if (!resolved) {
      return NextResponse.redirect(settingsUrl(req, { mailbox: "error", reason: "unconfigured" }));
    }

    const grant = await exchangeCodeForGrant({
      credentials: resolved.values,
      code,
      redirectUri: callbackUri(firstAllowedOrigin() || req.nextUrl.origin),
    });
    await saveMailbox({
      organizationId: issued.orgId,
      grantId: grant.grantId,
      email: grant.email,
      provider: grant.provider || null,
      // Rides in the signed state: this route has no session of its own, and
      // a mailbox is worth knowing the author of once identity is real.
      connectedBy: issued.userId,
    });
    return NextResponse.redirect(settingsUrl(req, { mailbox: "connected" }));
  } catch (error) {
    const reason =
      error instanceof NylasError ? error.kind : error instanceof Error ? "exchange_failed" : "unknown";
    console.error("[mailbox] Nylas code exchange failed:", error);
    return NextResponse.redirect(settingsUrl(req, { mailbox: "error", reason }));
  }
}
