import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyEmailWriteApproval, GMAIL_REPLY_TO_THREAD_APPROVAL_TOOL_ID, GMAIL_SEND_EMAIL_APPROVAL_TOOL_ID } from "@/lib/agent";
import { getIdentityAdapter } from "@/lib/identity";
import {
  decideApproval,
  getApproval,
  recordApprovalResult,
} from "@/lib/tools-integrations/approval-repository";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

const EMAIL_WRITE_TOOL_IDS = new Set([
  GMAIL_SEND_EMAIL_APPROVAL_TOOL_ID,
  GMAIL_REPLY_TO_THREAD_APPROVAL_TOOL_ID,
]);

/**
 * Decide a queued write (currently: the Gmail send/reply tools). Rejecting
 * just marks it rejected — nothing was ever sent. Approving marks it approved
 * and then, for a known email-write tool id, actually sends it for real:
 * that real send (or its failure) is what recordApprovalResult stores, not
 * the approval decision itself.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);

  const approval = await getApproval(params.id);
  if (!approval || approval.organizationId !== tenant.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const decision = body?.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be \"approved\" or \"rejected\"" }, { status: 422 });
  }

  let decided;
  try {
    decided = await decideApproval(approval.id, decision, tenant.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not decide this approval";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (decision === "approved" && EMAIL_WRITE_TOOL_IDS.has(approval.toolId)) {
    const applied = await applyEmailWriteApproval(approval.toolId, approval.input, tenant.orgId);
    await recordApprovalResult(approval.id, applied.ok ? { output: applied.output } : null, applied.ok ? null : applied.output);
    return NextResponse.json({ ...decided, applied });
  }

  return NextResponse.json(decided);
}
