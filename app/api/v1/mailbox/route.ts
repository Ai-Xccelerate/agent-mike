import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { firstAllowedOrigin } from "@/lib/env";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import {
  NYLAS_PROVIDER,
  NYLAS_REQUIRED_FIELDS,
  NylasError,
  callbackUri,
  envNylasCredentials,
  getGrant,
  nylasRegion,
  resolveNylasCredentials,
} from "@/lib/nylas";
import { describeCredentials } from "@/lib/provider-credentials";
import { deleteMailbox, getMailbox, markMailboxInvalid, touchMailbox } from "@/lib/mailbox-repository";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Settings > Identity > Mailbox.
 *
 * GET    → whether a mailbox is connected, and whether its grant is still live.
 * DELETE → disconnect.
 *
 * The status check is what turns a grant revoked in Google's console into
 * something the screen can report. Without it the first sign of trouble would
 * be a failed send.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  await getOrCreateProfile(tenant.orgId);

  // This agent's own application if it has one, the fleet's otherwise.
  const resolved = await resolveNylasCredentials(tenant.orgId);
  const available = Boolean(resolved);
  const mailbox = await getMailbox(tenant.orgId);

  const credentials = await describeCredentials(
    tenant.orgId,
    NYLAS_PROVIDER,
    [...NYLAS_REQUIRED_FIELDS],
    envNylasCredentials,
  );

  const base = {
    available,
    // Where the credentials came from, so the screen can say whether this
    // agent is on the fleet application or its own.
    credentials,
    region: resolved ? nylasRegion(resolved.values.apiUri) : nylasRegion(envNylasCredentials().apiUri),
    // Host only — the API key is never serialized.
    api_url: resolved ? resolved.values.apiUri : null,
    // What must be registered on the Nylas application. Computed here rather
    // than guessed by the screen, which knows its own origin but not this
    // service's, and would print Nylas's host if it guessed from api_url.
    callback_uri: callbackUri(firstAllowedOrigin() || req.nextUrl.origin),
    unavailableReason: available
      ? null
      : "Add a Nylas client ID and API key for this agent, or set them fleet-wide on the API service.",
  };

  if (!mailbox) {
    return NextResponse.json({ ...base, connected: false, mailbox: null, error: null });
  }

  const payload = {
    id: mailbox.id,
    email: mailbox.email,
    provider: mailbox.provider,
    status: mailbox.status,
    connectedBy: mailbox.connectedBy,
    connectedAt: mailbox.connectedAt,
    lastCheckedAt: mailbox.lastCheckedAt,
  };

  if (!available) {
    return NextResponse.json({ ...base, connected: false, mailbox: payload, error: null });
  }

  // Re-check the grant so a mailbox revoked upstream stops reading "connected".
  try {
    const grant = await getGrant(resolved!.values, mailbox.grantId);
    await touchMailbox(mailbox.id);
    const live = grant.status.toLowerCase() === "valid";
    if (!live && mailbox.status === "connected") {
      await markMailboxInvalid(mailbox.id);
    }
    return NextResponse.json({
      ...base,
      connected: live,
      mailbox: { ...payload, status: live ? "connected" : "invalid", email: grant.email || mailbox.email },
      error: null,
    });
  } catch (error) {
    if (error instanceof NylasError && error.kind === "grant_invalid") {
      await markMailboxInvalid(mailbox.id);
      return NextResponse.json({
        ...base,
        connected: false,
        mailbox: { ...payload, status: "invalid" },
        error: error.message,
      });
    }
    // Nylas being unreachable is not the same as the mailbox being gone — say
    // so, and leave the stored status alone.
    const message = error instanceof NylasError ? error.message : "Nylas lookup failed";
    return NextResponse.json({ ...base, connected: mailbox.status === "connected", mailbox: payload, error: message });
  }
}

export async function DELETE(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const removed = await deleteMailbox(tenant.orgId);
  if (!removed) {
    return NextResponse.json({ error: "No mailbox is connected" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
