import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { fieldErrors } from "@/lib/identity-fields";
import { agentWikiPatchSchema, agentWikiStatus, mergeAgentWikiSettings } from "@/lib/integrations";
import {
  AgentWikiError,
  isAgentWikiConfigured,
  listSpaces,
  listTools,
  resolveSearchTool,
} from "@/lib/agent-wiki";

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * GET  → the integration's status, plus the live tool surface and the spaces
 *        the key reaches when it is active, so the screen can show what the
 *        key can actually do rather than a hardcoded promise.
 * PATCH→ toggle it on/off, scope it to a space, or allow writing.
 *
 * An Agent Wiki outage degrades to an error string rather than failing the
 * request: the settings screen must still render, and must still let you
 * toggle Agent Wiki back off, when Agent Wiki is down.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = agentWikiStatus(profile.integrationsConfig);

  if (!status.active) {
    return NextResponse.json({
      ...status,
      tools: [],
      spaces: [],
      key_can_write: null,
      search_tool: null,
      error: null,
    });
  }

  try {
    const tools = await listTools();
    // Spaces sit behind their own permission, so a key can list tools and still
    // fail here. That is information, not a failed request.
    const spaces = await listSpaces().catch(() => []);
    return NextResponse.json({
      ...status,
      tools,
      spaces,
      // Whether the key itself was created with write permission. The screen
      // needs this to explain why "allow writing" may be on and still refused.
      key_can_write: tools.some((tool) => tool.writes),
      search_tool: resolveSearchTool(tools),
      error: null,
    });
  } catch (error) {
    const message = error instanceof AgentWikiError ? error.message : "Agent Wiki lookup failed";
    return NextResponse.json({
      ...status,
      tools: [],
      spaces: [],
      key_can_write: null,
      search_tool: null,
      error: message,
    });
  }
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = agentWikiPatchSchema.safeParse(body);
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
  if (parsed.data.enabled === true && !isAgentWikiConfigured()) {
    return NextResponse.json(
      {
        error: "Agent Wiki is not configured on this server",
        errors: {
          enabled:
            "Set AGENT_WIKI_MCP_URL and AGENT_WIKI_API_KEY on the API service. Create the key in Agent Wiki under Settings > API keys.",
        },
      },
      { status: 422 },
    );
  }

  const current = agentWikiStatus(profile.integrationsConfig);
  // Allowing writes on an integration that is off would store a permission
  // that silently takes effect the moment someone switches it on.
  if (parsed.data.allowWrite === true && !(parsed.data.enabled ?? current.enabled)) {
    return NextResponse.json(
      {
        error: "Agent Wiki is off",
        errors: { allowWrite: "Switch Agent Wiki on before allowing it to change pages." },
      },
      { status: 422 },
    );
  }

  const integrationsConfig = mergeAgentWikiSettings(profile.integrationsConfig, parsed.data);

  const [updated] = await db
    .update(workerProfiles)
    .set({ integrationsConfig, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  return NextResponse.json(agentWikiStatus(updated.integrationsConfig));
}
