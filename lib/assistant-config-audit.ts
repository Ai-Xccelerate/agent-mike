import { and, count, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, emailDomains, knowledgeDocuments, workerProfiles } from "@/db/schema";
import { getMailbox } from "@/lib/mailbox-repository";
import { integrationStatuses, type IntegrationStatus } from "@/lib/integrations";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { listSkillsForOrg, type SkillCatalogItem } from "@/lib/tools-integrations/skills-catalog";
import { INTEGRATION_TYPES } from "@/lib/tools-integrations/registry";

type Profile = typeof workerProfiles.$inferSelect;

/**
 * A fresh read of everything the admin Assistant needs to explain or audit
 * this worker's setup. Always re-read at call time rather than trusting the
 * profile loaded at the start of the request - a change confirmed earlier in
 * the same turn must show up here.
 */
export type ConfigurationSnapshot = {
  profile: Profile;
  knowledgeCount: number;
  mailbox: { connected: boolean; email: string | null } | null;
  integrationConnections: Record<string, string | null>;
  internalIntegrations: IntegrationStatus[];
  skills: SkillCatalogItem[];
  emailDomains: { approved: number; pending: number };
  realConversationCount: number;
};

const DEFAULT_ROLE = "Configure this worker's role and responsibilities.";
const DEFAULT_DISPLAY_NAME = "AI Worker";
const DEFAULT_MANAGER_NAME = "Manager";
const ALLOWED_MODELS = new Set(["gpt-5.6-luna", "gpt-5.6-sol"]);
const INTERNAL_CHANNELS = ["chat", "assistant"];

export async function loadConfigurationSnapshot(organizationId: string): Promise<ConfigurationSnapshot | null> {
  const [profile] = await db.select().from(workerProfiles).where(eq(workerProfiles.organizationId, organizationId)).limit(1);
  if (!profile) return null;

  const [knowledgeRows, mailbox, connections, internalIntegrations, skills, domainRows, conversationRows] =
    await Promise.all([
      db.select({ n: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.organizationId, organizationId)),
      getMailbox(organizationId),
      Promise.all(
        INTEGRATION_TYPES.map(async ({ type }) => {
          const row = await getConnectionForOrg(organizationId, type);
          return [type, row ? row.status : null] as const;
        }),
      ),
      integrationStatuses(profile.integrationsConfig, organizationId),
      listSkillsForOrg(organizationId, profile.enabledSkills),
      db.select({ status: emailDomains.status }).from(emailDomains).where(eq(emailDomains.organizationId, organizationId)),
      db
        .select({ n: count() })
        .from(conversations)
        .where(and(eq(conversations.organizationId, organizationId), notInArray(conversations.channel, INTERNAL_CHANNELS))),
    ]);

  return {
    profile,
    knowledgeCount: Number(knowledgeRows[0]?.n ?? 0),
    mailbox: mailbox ? { connected: mailbox.status === "connected", email: mailbox.email ?? null } : null,
    integrationConnections: Object.fromEntries(connections),
    internalIntegrations,
    skills,
    emailDomains: {
      approved: domainRows.filter((row) => row.status === "approved").length,
      pending: domainRows.filter((row) => row.status === "pending").length,
    },
    realConversationCount: Number(conversationRows[0]?.n ?? 0),
  };
}

export function formatConfigurationSnapshot(snapshot: ConfigurationSnapshot): string {
  const { profile } = snapshot;
  const on = (config: Record<string, boolean>) =>
    Object.entries(config)
      .filter(([, value]) => value)
      .map(([name]) => name)
      .join(", ") || "(none)";
  const enabledSkills = snapshot.skills.filter((skill) => skill.enabled);
  return [
    `Customer-facing name: ${profile.displayName}`,
    `Status: ${profile.status} (stored only; pausing does not stop replies yet)`,
    `Role: ${profile.role}`,
    `Job description: ${profile.jobDescription || "(none)"}`,
    `Tone: ${profile.tone}`,
    `Model: ${profile.model}; max turns per reply: ${profile.maxAgentTurns}; confidence threshold: ${profile.confidenceThreshold}`,
    `Escalation phrases: ${profile.escalationTerms.join(", ") || "(none configured)"}`,
    `Require user verification: ${profile.requireUserVerification ? "on" : "off"}`,
    `Assistant actions: ${profile.assistantActionsEnabled ? "on" : "off"}`,
    `Human manager: ${profile.managerName}${profile.managerEmail ? ` <${profile.managerEmail}>` : " (no email)"}`,
    `Channels on: ${on(profile.channelsConfig)}`,
    `General tools on: ${on(profile.toolsConfig)}`,
    `Mailbox: ${snapshot.mailbox ? (snapshot.mailbox.connected ? `connected (${snapshot.mailbox.email ?? "unknown address"})` : "needs reconnecting") : "not connected"}`,
    `Integrations: ${
      Object.entries(snapshot.integrationConnections)
        .filter(([, status]) => status)
        .map(([type, status]) => `${type}=${status}`)
        .join(", ") || "(none connected)"
    }`,
    `Internal tools: ${snapshot.internalIntegrations
      .map((item) => `${item.name} ${item.active ? "active" : item.enabled ? "on but unavailable" : "off"}`)
      .join(", ")}`,
    `Skills enabled: ${
      enabledSkills.map((skill) => `${skill.name} [${skill.id}]${skill.requirementsMet ? "" : " (inactive: needs " + skill.requires.join(", ") + ")"}`).join(", ") ||
      "(none)"
    }`,
    `Skills available but off: ${snapshot.skills.filter((skill) => !skill.enabled).map((skill) => `${skill.name} [${skill.id}]`).join(", ") || "(none)"}`,
    `Knowledge articles: ${snapshot.knowledgeCount}`,
    `Email domains: ${snapshot.emailDomains.approved} approved, ${snapshot.emailDomains.pending} pending`,
    `Real customer conversations so far: ${snapshot.realConversationCount}`,
  ].join("\n");
}

export type AuditFinding = {
  severity: "blocker" | "warning" | "tip";
  area: string;
  issue: string;
  /** What fixes it: the Assistant tool that can propose the fix, or where in Settings the manager does it. */
  fix: string;
};

/**
 * Rules for missing or contradictory configuration, derived from what the
 * runtime actually reads (see assistant-product-guide.ts). Each finding says
 * whether the Assistant itself can propose the fix or the manager has to do
 * it in Settings, so the Assistant never offers to change something it has
 * no tool for.
 */
export function auditWorkerConfiguration(snapshot: ConfigurationSnapshot): AuditFinding[] {
  const { profile } = snapshot;
  const findings: AuditFinding[] = [];
  const add = (finding: AuditFinding) => findings.push(finding);

  if (!profile.role.trim() || profile.role.trim() === DEFAULT_ROLE) {
    add({
      severity: "blocker",
      area: "Role",
      issue: "The role is still the default placeholder, so the worker has no real job description and out-of-scope checks can't work.",
      fix: "I can propose a role (propose_role_change) if you tell me what the worker should handle.",
    });
  }
  if (snapshot.knowledgeCount === 0 && !snapshot.internalIntegrations.some((item) => item.active && ["parchment", "scribe", "agent_wiki"].includes(item.key))) {
    add({
      severity: "blocker",
      area: "Knowledge",
      issue: "There are no knowledge articles and no active knowledge source, so the worker has nothing to ground answers in.",
      fix: "Attach a document here and choose 'Add to knowledge base', or upload in Settings > Knowledge.",
    });
  } else if (snapshot.knowledgeCount === 0) {
    add({
      severity: "tip",
      area: "Knowledge",
      issue: "No local knowledge articles; answers rely only on connected sources.",
      fix: "Attach a document here and choose 'Add to knowledge base', or upload in Settings > Knowledge.",
    });
  }
  if (!ALLOWED_MODELS.has(profile.model)) {
    add({
      severity: "blocker",
      area: "Agent configuration",
      issue: `The model "${profile.model}" isn't one of the supported options (gpt-5.6-luna, gpt-5.6-sol).`,
      fix: "I can propose a supported model (propose_settings_change), or pick one in Settings > Agent configuration.",
    });
  }
  if (profile.escalationTerms.length === 0) {
    add({
      severity: "warning",
      area: "Guardrails",
      issue: "No escalation phrases are set, so sensitive topics (refunds, legal, security) aren't routed to a human by topic.",
      fix: "I can propose a starter list (propose_escalation_terms_change).",
    });
  }
  if (profile.managerName.trim() === DEFAULT_MANAGER_NAME) {
    add({
      severity: "warning",
      area: "Human manager",
      issue: "The manager name is still 'Manager', which is what customers hear on a handoff ('I'm bringing in Manager').",
      fix: "I can propose the real name (propose_manager_contact_change).",
    });
  }
  if (profile.displayName.trim() === DEFAULT_DISPLAY_NAME) {
    add({
      severity: "tip",
      area: "Identity",
      issue: "The customer-facing name is still the default 'AI Worker'.",
      fix: "I can propose a new name (propose_settings_change), or change it in Settings > Identity.",
    });
  }
  if (profile.channelsConfig.email && !snapshot.mailbox?.connected) {
    add({
      severity: "blocker",
      area: "Channels",
      issue: snapshot.mailbox
        ? "The Email channel is on but the mailbox connection needs reconnecting, so email can't be sent."
        : "The Email channel is on but no mailbox is connected, so email can't be sent.",
      fix: "Connect the mailbox in Settings > Tools > External tools, or I can propose turning Email off (propose_channel_change).",
    });
  }
  if (profile.channelsConfig.email && snapshot.emailDomains.approved === 0) {
    add({
      severity: "warning",
      area: "Email domains",
      issue: "The Email channel is on but no recipient domains are approved, so every outbound email will be refused.",
      fix: "I can propose approving the domains you email (propose_email_domain_change), or approve them in Settings > Email domains.",
    });
  }
  if (snapshot.emailDomains.pending > 0) {
    add({
      severity: "tip",
      area: "Email domains",
      issue: `${snapshot.emailDomains.pending} email domain request(s) are waiting for a decision.`,
      fix: "Review them in Settings > Email domains.",
    });
  }
  for (const skill of snapshot.skills.filter((item) => item.enabled && !item.requirementsMet)) {
    add({
      severity: "warning",
      area: "Skills",
      issue: `The "${skill.name}" skill is on but inactive because ${skill.requires.join(" and ")} isn't connected.`,
      fix: `Connect ${skill.requires.join(" and ")} in Settings > Integrations, or I can propose turning the skill off (propose_skill_change).`,
    });
  }
  if (profile.requireUserVerification) {
    const verifySkill = snapshot.skills.find((item) => item.id === "verify-customer");
    if (!verifySkill?.enabled) {
      add({
        severity: "warning",
        area: "Guardrails",
        issue: "Require user verification is on, but the verify-customer skill that carries it out is off.",
        fix: "I can propose turning on verify-customer (propose_skill_change); it needs an active CRM connection.",
      });
    }
  }
  if (!profile.managerEmail) {
    add({
      severity: "tip",
      area: "Human manager",
      issue: "No manager email is set. Note that escalation emails aren't sent yet even when it is set; escalations appear in Inbox as 'needs human'.",
      fix: "I can record it (propose_manager_contact_change) so it's ready when notifications ship.",
    });
  }
  if (profile.allowedDomains.length > 0 && profile.channelsConfig.chat) {
    add({
      severity: "warning",
      area: "Guardrails",
      issue: `Only senders from ${profile.allowedDomains.join(", ")} may message the worker, but website/Playground chat visitors have no email on record, so every chat message will be handed to a human.`,
      fix: "Clear Allowed email domains in Settings > Guardrails if chat visitors should be answered.",
    });
  }
  for (const item of snapshot.internalIntegrations.filter((entry) => entry.enabled && !entry.available)) {
    add({
      severity: "warning",
      area: "Tools",
      issue: `${item.name} is switched on but unavailable: ${item.unavailableReason ?? "server credentials are missing"}.`,
      fix: "This needs server configuration by whoever runs the deployment.",
    });
  }
  for (const item of snapshot.internalIntegrations.filter((entry) => entry.active && ["agentdb", "artifacts"].includes(entry.key))) {
    add({
      severity: "tip",
      area: "Tools",
      issue: `${item.name} is on, but the worker doesn't use it in answers yet.`,
      fix: "No action needed; just don't rely on it yet.",
    });
  }
  if (profile.toolsConfig.browser_use) {
    add({ severity: "tip", area: "Tools", issue: "Browser use is on but isn't wired up yet, so it has no effect.", fix: "No action needed." });
  }
  if (profile.status === "paused") {
    add({
      severity: "warning",
      area: "Identity",
      issue: "Status is set to paused, but pausing isn't enforced yet: the worker still replies to customers.",
      fix: "If you need it to stop replying, turn off its channels instead (I can propose that).",
    });
  }
  for (const [type, status] of Object.entries(snapshot.integrationConnections)) {
    if (status === "failed" || status === "pending") {
      add({
        severity: "warning",
        area: "Integrations",
        issue: `The ${type} integration is ${status === "failed" ? "in a failed state" : "stuck connecting"}.`,
        fix: "Retry or disconnect it in Settings > Integrations.",
      });
    }
  }
  if (!profile.assistantActionsEnabled) {
    add({
      severity: "tip",
      area: "Assistant",
      issue:
        "Assistant actions are off, so this Assistant can draft replies but can't send them, change ticket status, or publish articles itself. (This doesn't affect the worker's own replies to customers.)",
      fix: "Turn on 'Let the Assistant take actions' in Settings > Guardrails if you want that (every action still needs your confirmation).",
    });
  }

  const order = { blocker: 0, warning: 1, tip: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
