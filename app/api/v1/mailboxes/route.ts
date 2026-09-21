import { NextRequest, NextResponse } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getMailbox, saveMailbox } from "@/lib/mailbox-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(mailbox: Awaited<ReturnType<typeof getMailbox>>) {
  if (!mailbox) return null;
  return {
    id: mailbox.id,
    organization_id: mailbox.organizationId,
    email: mailbox.email,
    active: mailbox.status === "connected",
    created_at: mailbox.createdAt,
    updated_at: mailbox.updatedAt,
  };
}

/** Legacy Mike endpoint retained while clients migrate to `/mailbox`. */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  return NextResponse.json({
    mailbox: serialize(await getMailbox(tenant.orgId)),
    grant_from_env: Boolean((process.env.NYLAS_GRANT_ID || "").trim()),
  });
}

/**
 * Binds Mike's pre-existing env grant to the authenticated org. New
 * installations should use `/mailbox/connect` hosted OAuth instead.
 */
export async function PUT(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const grantId = (process.env.NYLAS_GRANT_ID || "").trim();
  if (!grantId) {
    return NextResponse.json(
      { error: "NYLAS_GRANT_ID is not configured on the API service" },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = (body?.email || process.env.NYLAS_MAILBOX_EMAIL || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email is required" }, { status: 422 });
  }
  const mailbox = await saveMailbox({
    organizationId: tenant.orgId,
    grantId,
    email,
    provider: null,
    connectedBy: tenant.userId,
  });
  return NextResponse.json({ mailbox: serialize(mailbox), grant_from_env: true });
}
