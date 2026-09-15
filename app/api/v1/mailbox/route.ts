import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import {
  NylasError,
  getGrant,
  isNylasConfigured,
  nylasApiUri,
  nylasRegion,
} from "@/lib/nylas";
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

  const available = isNylasConfigured();
  const mailbox = await getMailbox(tenant.orgId);

  const base = {
    available,
    region: nylasRegion(),
    // Host only — the API key is never serialized.
    api_url: available ? nylasApiUri() : null,
    unavailableReason: available
      ? null
      : "Set NYLAS_CLIENT_ID and NYLAS_API_KEY on the API service.",
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
    const grant = await getGrant(mailbox.grantId);
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
