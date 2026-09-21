import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import { mergeScribeSettings, scribePatchSchema, scribeStatus } from "@/lib/integrations";
import { ScribeError, isScribeConfigured, listMeetings } from "@/lib/scribe";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * GET  → the integration's status, plus a live peek at the meeting corpus when
 *        it is active, so the screen can show that the token reaches real data.
 * PATCH→ toggle it on/off, or change the evidence window.
 *
 * A Scribe outage degrades to an error string rather than failing the request:
 * the settings screen must still render, and must still let you toggle Scribe
 * back off, when Scribe is down.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = scribeStatus(profile.integrationsConfig);

  if (!status.active) {
    return NextResponse.json({ ...status, meeting_count: null, recent_meetings: [], error: null });
  }

  try {
    const page = await listMeetings(3);
    return NextResponse.json({
      ...status,
      meeting_count: page.total,
      recent_meetings: page.items,
      error: null,
    });
  } catch (error) {
    const message = error instanceof ScribeError ? error.message : "Scribe lookup failed";
    return NextResponse.json({
      ...status,
      meeting_count: null,
      recent_meetings: [],
      error: message,
    });
  }
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = scribePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", errors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Invalid payload", errors: { _: "Provide at least one field to update" } },
      { status: 422 },
    );
  }

  // Turning it on without server credentials would leave a toggle that reads
  // "enabled" while nothing can call out. Refuse, and say which vars are missing.
  if (parsed.data.enabled === true && !isScribeConfigured()) {
    return NextResponse.json(
      {
        error: "Scribe is not configured on this server",
        errors: { enabled: "Set SCRIBE_MCP_URL and SCRIBE_MCP_TOKEN on the API service." },
      },
      { status: 422 },
    );
  }

  const integrationsConfig = mergeScribeSettings(profile.integrationsConfig, parsed.data);

  const [updated] = await db
    .update(workerProfiles)
    .set({ integrationsConfig, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  return NextResponse.json(scribeStatus(updated.integrationsConfig));
}
