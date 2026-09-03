import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { agentProfiles } from "@/db/schema";
import { db } from "@/lib/db";
import { ensureOrganization } from "@/lib/tenant-sync";

export async function getProfile(organizationId: string) {
  await ensureOrganization(organizationId);
  const [existing] = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(agentProfiles)
    .values({ id: randomUUID(), organizationId })
    .returning();
  return created;
}

export function serializeProfile(profile: typeof agentProfiles.$inferSelect) {
  return {
    id: profile.id,
    name: profile.name,
    display_name: profile.displayName,
    email: profile.email,
    role: profile.role,
    tone: profile.tone,
    manager_name: profile.managerName,
    manager_email: profile.managerEmail,
    auto_reply: profile.autoReply,
    confidence_threshold: profile.confidenceThreshold,
    max_agent_turns: profile.maxAgentTurns,
    guardrails: profile.guardrails,
    escalation_terms: profile.escalationTerms,
    updated_at: profile.updatedAt.toISOString(),
  };
}

export const PROFILE_PATCH: Record<string, keyof typeof agentProfiles.$inferInsert> = {
  name: "name",
  display_name: "displayName",
  email: "email",
  role: "role",
  tone: "tone",
  manager_name: "managerName",
  manager_email: "managerEmail",
  auto_reply: "autoReply",
  confidence_threshold: "confidenceThreshold",
  max_agent_turns: "maxAgentTurns",
  guardrails: "guardrails",
  escalation_terms: "escalationTerms",
};
