import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import {
  AGENTDB_PROVIDER,
  AGENTDB_REQUIRED_FIELDS,
  envAgentDbCredentials,
} from "@/lib/agentdb";
import {
  clearOrgCredentials,
  describeCredentials,
  setOrgCredentials,
} from "@/lib/provider-credentials";

// Reads/writes secrets per request — never statically prerender or cache.
export const dynamic = "force-dynamic";

/**
 * This agent's own AgentDB MCP key.
 *
 * GET    → whether a key is set and where it came from. Never the value.
 * PUT    → give this agent its own key.
 * DELETE → drop it; the agent falls back to the deployment's internal key.
 *
 * Secrets go in and never come back out. Re-entering is the recovery path, and
 * a mask would still leak length.
 *
 * Worth knowing what a key changes: the internal-key path must assert which
 * organization it is acting for, and this build has no Clerk to tell it — so it
 * sends a placeholder and AgentDB refuses. A key was issued inside a workspace,
 * so it carries that answer with it.
 */
const credentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "MCP key is required"),
  mcpUrl: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});

function summary(orgId: string) {
  return describeCredentials(
    orgId,
    AGENTDB_PROVIDER,
    [...AGENTDB_REQUIRED_FIELDS],
    envAgentDbCredentials,
  );
}

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  await getOrCreateProfile(tenant.orgId);
  return NextResponse.json(await summary(tenant.orgId));
}

export async function PUT(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", errors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const env = envAgentDbCredentials();
  const values = {
    apiKey: parsed.data.apiKey,
    // Falls back to the deployment's endpoint, so a manager only has to paste
    // the key in the common case.
    mcpUrl: (parsed.data.mcpUrl ?? env.mcpUrl).replace(/\s+/g, ""),
  };

  try {
    await setOrgCredentials({
      organizationId: tenant.orgId,
      provider: AGENTDB_PROVIDER,
      secrets: values,
      // Not a secret, and the screen needs it to show which instance this agent
      // is pointed at.
      metadata: { mcpUrl: values.mcpUrl },
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
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const removed = await clearOrgCredentials(tenant.orgId, AGENTDB_PROVIDER);
  if (!removed) {
    return NextResponse.json({ error: "This agent has no key of its own" }, { status: 404 });
  }
  return NextResponse.json(await summary(tenant.orgId));
}
