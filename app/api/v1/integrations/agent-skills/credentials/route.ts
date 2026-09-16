import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import {
  SKILLS_PROVIDER,
  SKILLS_REQUIRED_FIELDS,
  envSkillsCredentials,
  normalizeSkillsCredentials,
} from "@/lib/skills-repository";
import {
  clearOrgCredentials,
  describeCredentials,
  setOrgCredentials,
} from "@/lib/provider-credentials";

// Reads/writes secrets per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

/**
 * This agent's own key for the skill repository.
 *
 * GET    → whether a key is set and where it came from. Never the value.
 * PUT    → give this agent its own key.
 * DELETE → drop it; the agent falls back to the fleet's.
 *
 * Secrets go in and never come back out. Re-entering is the recovery path, and
 * a mask would still leak length.
 */
const credentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required"),
  apiUrl: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});

function summary(orgId: string) {
  return describeCredentials(orgId, SKILLS_PROVIDER, [...SKILLS_REQUIRED_FIELDS], envSkillsCredentials);
}

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  await getOrCreateProfile(tenant.orgId);
  return NextResponse.json(await summary(tenant.orgId));
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

  const values = normalizeSkillsCredentials(parsed.data);

  try {
    await setOrgCredentials({
      organizationId: tenant.orgId,
      provider: SKILLS_PROVIDER,
      secrets: values,
      // Not a secret, and the screen needs it to show which repository this
      // agent is pointed at.
      metadata: { apiUrl: values.apiUrl },
      updatedBy: tenant.userId,
    });
  } catch (error) {
    // The one failure a manager cannot fix from here: no key to encrypt with.
    const message = error instanceof Error ? error.message : "Could not save the key";
    return NextResponse.json(
      { error: "Could not store the key", errors: { apiKey: message } },
      { status: 500 },
    );
  }

  return NextResponse.json(await summary(tenant.orgId));
}

export async function DELETE(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const removed = await clearOrgCredentials(tenant.orgId, SKILLS_PROVIDER);
  if (!removed) {
    return NextResponse.json({ error: "This agent has no key of its own" }, { status: 404 });
  }
  return NextResponse.json(await summary(tenant.orgId));
}
