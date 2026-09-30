import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyEmailWriteApproval, GMAIL_REPLY_TO_THREAD_APPROVAL_TOOL_ID, GMAIL_SEND_EMAIL_APPROVAL_TOOL_ID } from "@/lib/agent";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { applyComposioActionApproval, COMPOSIO_ACTION_APPROVAL_TOOL_ID } from "@/lib/tools-integrations/composio-actions";
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
 * Decide a queued write: the Gmail send/reply tools, or any connected-app
 * action the agent queued through run_integration_action. Rejecting just
 * marks it rejected — nothing ever ran. Approving marks it approved and then
 * runs it for real: that real run (or its failure) is what
 * recordApprovalResult stores, not the approval decision itself.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  // Approving sends real email on the org's behalf, and deciding an Assistant
  // proposal changes (or discards) a settings change: owner/admin only.
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }

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

  if (decision === "approved" && approval.toolId === COMPOSIO_ACTION_APPROVAL_TOOL_ID) {
    const applied = await applyComposioActionApproval(approval.input, tenant.orgId, tenant.userId);
    await recordApprovalResult(approval.id, applied.ok ? { output: applied.output } : null, applied.ok ? null : applied.output);
    return NextResponse.json({ ...decided, applied });
  }

  return NextResponse.json(decided);
}
