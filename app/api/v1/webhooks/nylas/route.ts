import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { processInboundEmail, receiveNylasWebhook } from "@/lib/email-channel";

// Webhook deliveries are per request and must never be cached.
export const dynamic = "force-dynamic";

/**
 * Nylas webhooks: inbound email for every organization's connected mailbox.
 *
 * Public (no session): each delivery is verified against the webhook secret
 * of the organization whose grant it names. Register this URL on the Nylas
 * application with only the message.created trigger, compression off.
 */

/** Nylas checks a new webhook URL by expecting its `challenge` echoed back verbatim. */
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (!challenge) return NextResponse.json({ ok: true });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const outcome = await receiveNylasWebhook(raw, req.headers.get("x-nylas-signature"));

  if (outcome.kind === "rejected") {
    // The reason stays in the log: telling the caller would say whether a
    // grant id belongs to an organization here.
    console.warn(`[webhooks/nylas] rejected: ${outcome.reason}`);
    return NextResponse.json({ error: "Invalid webhook delivery" }, { status: 401 });
  }
  if (outcome.kind === "stored") {
    // Answered after the response: Nylas retries slow deliveries, and an
    // agent turn can take several seconds. The stored message's unique
    // external id already makes any retry a no-op.
    void processInboundEmail(outcome).catch((error) => {
      console.error("[webhooks/nylas] processing failed", error);
    });
  }
  return NextResponse.json({ ok: true });
}
