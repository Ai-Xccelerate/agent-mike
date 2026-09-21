import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import { NylasError } from "@/lib/nylas";
import { OutboundBlocked, sendAsWorker } from "@/lib/outbound";

// Sends mail per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  to: z
    .array(z.object({ email: z.string().email("Enter a valid address"), name: z.string().optional() }))
    .min(1, "At least one recipient"),
  subject: z.string().min(1, "Subject is required").max(500),
  body: z.string().min(1, "Body is required"),
  replyToMessageId: z.string().min(1).nullable().optional(),
});

/**
 * Sends as the worker.
 *
 * Everything meaningful happens in `lib/outbound.ts` — this route is only the
 * HTTP shape. A blocked send is 403 with the offending domains named, because
 * "which domain do I need to approve" is the only question the manager will
 * have, and Settings > Email domains is one click from the answer.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);

  // The email channel is the switch that says this worker is allowed to use
  // mail at all. A connected mailbox is capability; this is permission.
  if (!profile.channelsConfig?.email) {
    return NextResponse.json(
      {
        error: "The email channel is off",
        errors: { channel: "Turn on Email under Settings > Channels." },
      },
      { status: 422 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", errors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const result = await sendAsWorker({ orgId: tenant.orgId, ...parsed.data });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OutboundBlocked) {
      return NextResponse.json(
        { error: error.message, reason: error.reason, blockedDomains: error.blockedDomains },
        { status: 403 },
      );
    }
    if (error instanceof NylasError) {
      return NextResponse.json({ error: error.message, reason: error.kind }, { status: 502 });
    }
    throw error;
  }
}
