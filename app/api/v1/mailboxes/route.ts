import { NextRequest } from "next/server";
import { json, withTenant } from "@/lib/http";
import {
  envNylasGrantId,
  envNylasMailboxEmail,
  mailboxByOrgId,
  serializeMailbox,
  upsertMailboxForOrg,
} from "@/lib/nylas-mailboxes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current org's Nylas mailbox (org from Clerk JWT). Grant id stays server-side. */
export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const mailbox = await mailboxByOrgId(tenant.orgId);
    const grantConfigured = Boolean(envNylasGrantId());
    return json({
      mailbox: serializeMailbox(mailbox),
      grant_from_env: grantConfigured,
    });
  });
}

/** Bind the env Nylas grant to the signed-in org (email from body or env). */
export async function PUT(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const payload = (await req.json()) as {
      email?: string;
      active?: boolean;
    };
    const grantId = envNylasGrantId();
    if (!grantId) {
      return json(
        { error: "NYLAS_GRANT_ID is not configured on the API service" },
        503,
      );
    }
    const email = (payload.email || envNylasMailboxEmail() || "").trim();
    try {
      const mailbox = await upsertMailboxForOrg(tenant.orgId, {
        grantId,
        email,
        active: payload.active,
      });
      return json({
        mailbox: serializeMailbox(mailbox),
        grant_from_env: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("another organization") ? 409 : 422;
      return json({ error: message }, status);
    }
  });
}
