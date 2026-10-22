import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { feedbackContext, feedbackInputSchema, removeFeedback, saveFeedback } from "@/lib/answer-feedback";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rate one of the worker's replies: { rating: "good" | "bad", reasons?: [...], correction?: "..." }.
 * Any signed-in manager of the organization may; the rating is theirs, so they can change or take it back.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!UUID.test(params.id)) return NextResponse.json({ error: "That reply can't be rated" }, { status: 404 });

  const parsed = feedbackInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return NextResponse.json({ error: "Check the rating", errors }, { status: 422 });
  }

  const profile = await getOrCreateProfile(tenant.orgId);
  const saved = await saveFeedback({
    organizationId: tenant.orgId,
    messageId: params.id,
    ratedBy: tenant.userId,
    feedback: parsed.data,
    context: feedbackContext(profile),
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json(saved.feedback);
}

/** Take back your own rating of a reply. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const removed = await removeFeedback({ organizationId: tenant.orgId, messageId: params.id, ratedBy: tenant.userId });
  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
