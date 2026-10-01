import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { processInboundEmail, receiveComposioWebhook } from "@/lib/email-channel";

// Webhook deliveries are per request and must never be cached.
export const dynamic = "force-dynamic";

/**
 * Composio webhooks: inbound email for every organization's Gmail account
 * connected under Settings > Integrations.
 *
 * Public (no session): each delivery is verified against the Composio
 * project's webhook secret (COMPOSIO_WEBHOOK_SECRET). Subscribe this URL to
 * trigger events in the Composio project; the GMAIL_NEW_GMAIL_MESSAGE trigger
 * is created per account when Gmail is connected.
 */
export async function POST(req: NextRequest) {
  const outcome = await receiveComposioWebhook(req);

  if (outcome.kind === "rejected") {
    // The reason stays in the log: telling the caller would say whether a
    // connected account belongs to an organization here.
    console.warn(`[webhooks/composio] rejected: ${outcome.reason}`);
    return NextResponse.json({ error: "Invalid webhook delivery" }, { status: 401 });
  }
  if (outcome.kind === "ignored") {
    console.info(`[webhooks/composio] ignored: ${outcome.reason}`);
  }
  if (outcome.kind === "stored") {
    console.info(
      `[webhooks/composio] stored email for org ${outcome.organizationId}, conversation ${outcome.conversationId}`,
    );
    // Answered after the response, as for Nylas: an agent turn takes seconds,
    // and the stored message's unique external id makes a retry a no-op.
    void processInboundEmail(outcome).catch((error) => {
      console.error("[webhooks/composio] processing failed", error);
    });
  }
  return NextResponse.json({ ok: true });
}
