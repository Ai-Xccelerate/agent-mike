import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import { getMailboxByGrantId, saveMailbox } from "@/lib/mailbox-repository";
import { getGrant, NylasError, resolveNylasCredentials } from "@/lib/nylas";

// Talks to Nylas per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

const attachSchema = z.object({
  grantId: z.string().trim().uuid("Paste the grant ID from the Nylas dashboard (Grants)"),
});

/**
 * Settings > Tools > Mailbox > "Use an existing Nylas mailbox".
 *
 * For a mailbox that already exists in the org's Nylas application (a Nylas
 * agent account such as support@yourdomain, or a grant made outside this
 * screen), so there is no sign-in to go through. The grant is checked with
 * the org's own Nylas application (or the fleet's) before it is saved, and a
 * grant can belong to one organization only.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  await getOrCreateProfile(tenant.orgId);

  const parsed = attachSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", errors: fieldErrors(parsed.error) }, { status: 422 });
  }
  const { grantId } = parsed.data;

  const credentials = await resolveNylasCredentials(tenant.orgId);
  if (!credentials) {
    const message = "Add your Nylas client ID and API key first.";
    return NextResponse.json({ error: message, errors: { grantId: message } }, { status: 422 });
  }

  const existing = await getMailboxByGrantId(grantId);
  if (existing && existing.organizationId !== tenant.orgId) {
    const message = "This grant can't be used here.";
    return NextResponse.json({ error: message, errors: { grantId: message } }, { status: 409 });
  }

  let grant;
  try {
    grant = await getGrant(credentials.values, grantId);
  } catch (error) {
    const message =
      error instanceof NylasError && (error.status === 404 || error.kind === "grant_invalid")
        ? "Nylas doesn't know this grant in your application. Check the ID and the application."
        : "Could not reach Nylas to check this grant. Try again.";
    return NextResponse.json({ error: message, errors: { grantId: message } }, { status: 422 });
  }
  if (grant.status !== "valid") {
    const message = `Nylas reports this grant as "${grant.status}". Reconnect it in Nylas first.`;
    return NextResponse.json({ error: message, errors: { grantId: message } }, { status: 422 });
  }

  const mailbox = await saveMailbox({
    organizationId: tenant.orgId,
    grantId: grant.grantId,
    email: grant.email,
    provider: grant.provider || null,
    connectedBy: tenant.userId,
  });
  return NextResponse.json({ connected: true, email: mailbox.email, provider: mailbox.provider });
}
