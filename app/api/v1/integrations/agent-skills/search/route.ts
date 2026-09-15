import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { agentSkillsStatus, readAgentSkillsSettings } from "@/lib/integrations";
import { SkillsRepositoryError, searchSkills } from "@/lib/skills-repository";

// Calls out per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * Preview what the repository would return for a task description.
 *
 * The same call the worker makes at chat time, run by hand. Worth having on
 * the settings screen: this integration is the one where a manager cannot see
 * in advance which skills the worker will reach for, so being able to ask
 * "what would it find for this?" is the only way to judge it before enabling.
 *
 * Bodies are not returned — a search result is a candidate, and the screen
 * only needs to show what was matched.
 */
export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  const status = agentSkillsStatus(profile.integrationsConfig);

  if (!status.available) {
    return NextResponse.json(
      { error: status.unavailableReason, results: [] },
      { status: 422 },
    );
  }

  const query = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!query) {
    return NextResponse.json(
      { error: "Describe a task to search for", results: [] },
      { status: 422 },
    );
  }

  const settings = readAgentSkillsSettings(profile.integrationsConfig);

  try {
    const results = await searchSkills({
      query,
      category: settings.category,
      limit: settings.maxResults,
    });
    return NextResponse.json({ results, error: null });
  } catch (error) {
    const message =
      error instanceof SkillsRepositoryError ? error.message : "Skill repository search failed";
    return NextResponse.json({ results: [], error: message }, { status: 502 });
  }
}
