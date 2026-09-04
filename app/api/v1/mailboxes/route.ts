import { NextRequest } from "next/server";
import { json, withTenant } from "@/lib/http";
import {
  mailboxByOrgId,
  serializeMailbox,
  upsertMailboxForOrg,
} from "@/lib/nylas-mailboxes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current org's Nylas mailbox (org from Clerk JWT). */
export async function GET(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const mailbox = await mailboxByOrgId(tenant.orgId);
    return json({ mailbox: serializeMailbox(mailbox) });
  });
}

/** Bind a Nylas grant to the signed-in org. */
export async function PUT(req: NextRequest) {
  return withTenant(req, async (tenant) => {
    const payload = (await req.json()) as {
      grant_id?: string;
      email?: string;
      active?: boolean;
    };
    try {
      const mailbox = await upsertMailboxForOrg(tenant.orgId, {
        grantId: payload.grant_id || "",
        email: payload.email || "",
        active: payload.active,
      });
      return json({ mailbox: serializeMailbox(mailbox) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("another organization") ? 409 : 422;
      return json({ error: message }, status);
    }
  });
}
