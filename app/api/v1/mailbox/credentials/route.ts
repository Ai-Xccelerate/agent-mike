import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import {
  NYLAS_PROVIDER,
  NYLAS_REQUIRED_FIELDS,
  envNylasCredentials,
  normalizeNylasCredentials,
} from "@/lib/nylas";
import {
  clearOrgCredentials,
  describeCredentials,
  setOrgCredentials,
} from "@/lib/provider-credentials";

// Reads/writes secrets per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

/**
 * This agent's own Nylas application.
 *
 * GET    → whether credentials are set and where they came from. Never values.
 * PUT    → give this agent its own application.
 * DELETE → drop them; the agent falls back to the fleet's.
 *
 * Secrets go in and never come back out. There is no case where the screen
 * needs to read one — re-entering it is the recovery path, and a mask would
 * still leak length.
 */
const credentialsSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID is required"),
  apiKey: z.string().trim().min(1, "API key is required"),
  apiUri: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  await getOrCreateProfile(tenant.orgId);
  return NextResponse.json(
    await describeCredentials(
      tenant.orgId,
      NYLAS_PROVIDER,
      [...NYLAS_REQUIRED_FIELDS],
      envNylasCredentials,
    ),
  );
}

export async function PUT(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", errors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const values = normalizeNylasCredentials(parsed.data);

  try {
    await setOrgCredentials({
      organizationId: tenant.orgId,
      provider: NYLAS_PROVIDER,
      secrets: values,
      // Region is not a secret, and the screen needs it to warn before a
      // change orphans every grant this agent already holds.
      metadata: { apiUri: values.apiUri },
      updatedBy: tenant.userId,
    });
  } catch (error) {
    // The one failure a manager cannot fix from here: no key to encrypt with.
    const message = error instanceof Error ? error.message : "Could not save credentials";
    return NextResponse.json(
      { error: "Could not store credentials", errors: { apiKey: message } },
      { status: 500 },
    );
  }

  return NextResponse.json(
    await describeCredentials(
      tenant.orgId,
      NYLAS_PROVIDER,
      [...NYLAS_REQUIRED_FIELDS],
      envNylasCredentials,
    ),
  );
}

export async function DELETE(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const removed = await clearOrgCredentials(tenant.orgId, NYLAS_PROVIDER);
  if (!removed) {
    return NextResponse.json(
      { error: "This agent has no credentials of its own" },
      { status: 404 },
    );
  }
  return NextResponse.json(
    await describeCredentials(
      tenant.orgId,
      NYLAS_PROVIDER,
      [...NYLAS_REQUIRED_FIELDS],
      envNylasCredentials,
    ),
  );
}
