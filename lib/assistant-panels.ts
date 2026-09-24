import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailDomains, knowledgeDocuments, workerProfiles } from "@/db/schema";
import { integrationStatuses } from "@/lib/integrations";
import { getMailbox } from "@/lib/mailbox-repository";
import { resolveNylasCredentials } from "@/lib/nylas";
import { getConnectionForOrg } from "@/lib/tools-integrations/connection-repository";
import { INTEGRATIONS, INTEGRATION_TYPES } from "@/lib/tools-integrations/registry";
import { listSkillsForOrg } from "@/lib/tools-integrations/skills-catalog";
import { getAuthConfigId } from "@/lib/tools-integrations/auth-configs";

/** Whether this server can start a sign-in for a system at all (its auth config is set). */
function canConnect(system: string): boolean {
  try {
    getAuthConfigId(system);
    return true;
  } catch {
    return false;
  }
}

/**
 * Interactive panels the admin Assistant can show inside a chat reply, so a
 * manager can see what's available and act on it without leaving the
 * conversation. Every button maps to one of the Assistant's own propose_*
 * tools (see PANEL_ACTION_TOOLS in assistant-agent.ts): a click creates a
 * proposal with the same validation as a typed request, and nothing changes
 * until the manager approves it on the usual approval card.
 */

export const PANEL_KINDS = ["skills", "knowledge", "integrations", "tools", "channels", "email_domains"] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

export function isPanelKind(value: unknown): value is PanelKind {
  return typeof value === "string" && (PANEL_KINDS as readonly string[]).includes(value);
}

export type PanelAction = {
  label: string;
  /** A propose_* tool name; the server re-validates everything on click. */
  tool: string;
  args: Record<string, unknown>;
  variant?: "primary" | "secondary";
};

export type PanelItem = {
  id: string;
  title: string;
  description?: string;
  status?: { label: string; tone: "success" | "warning" | "neutral" | "error" };
  /** Extra text the manager can expand in place (e.g. an article's body). */
  detail?: string;
  note?: string;
  actions: PanelAction[];
};

export type Panel = {
  kind: PanelKind;
  title: string;
  description: string;
  items: PanelItem[];
  emptyText?: string;
  settingsHref: string;
};

const SYSTEM_LABELS: Record<string, string> = {
  zoho: "Zoho",
  jira: "Jira",
  linear: "Linear",
  gmail: "Gmail",
  outlook: "Outlook",
  googlecalendar: "Google Calendar",
};

export function systemLabel(system: string): string {
  return SYSTEM_LABELS[system] ?? system;
}

const PANEL_REASON = "Requested from a panel in the Assistant";

/** propose_settings_change needs every field present; only one is ever set from a panel. */
function settingsArgs(changes: Record<string, unknown>) {
  const none = {
    displayName: null, name: null, avatarInitials: null, accentColor: null, timezone: null, emailSignature: null,
    jobDescription: null, systemPromptTemplate: null, model: null, maxAgentTurns: null, confidenceThreshold: null,
    requireUserVerification: null, internetSearch: null,
  };
  return { changes: { ...none, ...changes }, reason: PANEL_REASON };
}

async function readProfile(organizationId: string) {
  const [profile] = await db.select().from(workerProfiles).where(eq(workerProfiles.organizationId, organizationId)).limit(1);
  return profile ?? null;
}

async function skillsPanel(organizationId: string): Promise<Panel> {
  const profile = await readProfile(organizationId);
  const skills = await listSkillsForOrg(organizationId, profile?.enabledSkills ?? []);
  return {
    kind: "skills",
    title: "Skills",
    description: "Instructions the worker follows for specific situations.",
    settingsHref: "/settings/skills",
    emptyText: "No skills are available yet.",
    items: skills.map((skill) => {
      const blocked = !skill.requirementsMet;
      const needs = skill.requires
        .map((type) => INTEGRATION_TYPES.find((entry) => entry.type === type)?.name ?? type)
        .join(" and ");
      const actions: PanelAction[] = [];
      if (skill.enabled) {
        actions.push({ label: "Turn off", tool: "propose_skill_change", args: { skillId: skill.id, enabled: false, reason: PANEL_REASON }, variant: "secondary" });
      } else if (!blocked) {
        actions.push({ label: "Turn on", tool: "propose_skill_change", args: { skillId: skill.id, enabled: true, reason: PANEL_REASON }, variant: "primary" });
      } else {
        for (const type of skill.requires) {
          const vendor = INTEGRATIONS.find((integration) => integration.integrationType === type && canConnect(integration.system));
          if (vendor) {
            actions.push({
              label: `Connect ${systemLabel(vendor.system)}`,
              tool: "propose_connect_integration",
              args: { integrationType: type, system: vendor.system, reason: PANEL_REASON },
              variant: "secondary",
            });
          }
        }
      }
      return {
        id: skill.id,
        title: skill.name,
        description: skill.description,
        status: skill.enabled
          ? blocked
            ? { label: "On, but inactive", tone: "warning" as const }
            : { label: "On", tone: "success" as const }
          : { label: "Off", tone: "neutral" as const },
        note: blocked ? `Needs ${needs} connected.` : skill.source === "custom" ? "Custom skill" : undefined,
        actions,
      };
    }),
  };
}

async function knowledgePanel(organizationId: string): Promise<Panel> {
  const docs = await db
    .select({ conceptId: knowledgeDocuments.conceptId, title: knowledgeDocuments.title, body: knowledgeDocuments.body })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, organizationId))
    .orderBy(asc(knowledgeDocuments.title));
  return {
    kind: "knowledge",
    title: "Knowledge base",
    description: "Articles the worker searches and cites. Attach a file below to add or update one.",
    settingsHref: "/settings/knowledge",
    emptyText: "The knowledge base is empty. Attach a file and choose \"Add to knowledge base\" to start.",
    items: docs.slice(0, 50).map((doc) => ({
      id: doc.conceptId,
      title: doc.title,
      description: doc.body.replace(/^#.*$/m, "").replace(/\s+/g, " ").trim().slice(0, 140),
      detail: doc.body.length > 4000 ? `${doc.body.slice(0, 4000)}…` : doc.body,
      actions: [],
    })),
  };
}

async function integrationsPanel(organizationId: string): Promise<Panel> {
  const items: PanelItem[] = [];
  for (const { type, name } of INTEGRATION_TYPES) {
    const vendors = INTEGRATIONS.filter((integration) => integration.integrationType === type);
    if (vendors.length === 0) continue;
    const row = await getConnectionForOrg(organizationId, type);
    const label = row ? systemLabel(row.system) : vendors.map((vendor) => systemLabel(vendor.system)).join(" or ");
    const actions: PanelAction[] = [];
    let status: PanelItem["status"];
    if (row?.status === "active") {
      status = { label: "Connected", tone: "success" };
      actions.push({ label: "Disconnect", tool: "propose_disconnect_integration", args: { integrationType: type, reason: PANEL_REASON }, variant: "secondary" });
    } else {
      status =
        row?.status === "pending"
          ? { label: "Waiting for sign-in", tone: "warning" }
          : row?.status === "failed"
            ? { label: "Failed", tone: "error" }
            : { label: "Not connected", tone: "neutral" };
      for (const vendor of vendors.filter((item) => canConnect(item.system))) {
        actions.push({
          label: `${row ? "Retry" : "Connect"} ${systemLabel(vendor.system)}`,
          tool: "propose_connect_integration",
          args: { integrationType: type, system: vendor.system, reason: PANEL_REASON },
          variant: "primary",
        });
      }
    }
    const unavailable = row?.status !== "active" && vendors.every((vendor) => !canConnect(vendor.system));
    items.push({
      id: type,
      title: name,
      description: label,
      status,
      note: unavailable ? "Sign-in for this isn't set up on this server yet." : undefined,
      actions,
    });
  }

  const [mailbox, nylas] = await Promise.all([getMailbox(organizationId), resolveNylasCredentials(organizationId)]);
  const mailboxConnected = mailbox?.status === "connected";
  items.push({
    id: "mailbox",
    title: "Mailbox",
    description: mailboxConnected ? `Sends email as ${mailbox?.email ?? "the connected address"}` : "The address the worker sends email from.",
    status: mailboxConnected
      ? { label: "Connected", tone: "success" }
      : mailbox
        ? { label: "Reconnect needed", tone: "error" }
        : { label: nylas ? "Not connected" : "Not configured", tone: "neutral" },
    note: nylas ? undefined : "The mailbox provider isn't set up on this server yet.",
    actions:
      nylas && !mailboxConnected
        ? [{ label: mailbox ? "Reconnect mailbox" : "Connect mailbox", tool: "propose_connect_mailbox", args: { reason: PANEL_REASON }, variant: "primary" }]
        : [],
  });

  return {
    kind: "integrations",
    title: "Integrations",
    description: "Business systems the worker can look things up in. Connecting opens a sign-in window.",
    settingsHref: "/settings/integrations",
    items,
  };
}

async function toolsPanel(organizationId: string): Promise<Panel> {
  const profile = await readProfile(organizationId);
  const internal = profile ? await integrationStatuses(profile.integrationsConfig, organizationId) : [];
  const internetOn = Boolean(profile?.toolsConfig?.internet_search);
  const items: PanelItem[] = [
    {
      id: "internet_search",
      title: "Internet search",
      description: "General web search.",
      status: internetOn ? { label: "On", tone: "success" } : { label: "Off", tone: "neutral" },
      actions: [
        {
          label: internetOn ? "Turn off" : "Turn on",
          tool: "propose_settings_change",
          args: settingsArgs({ internetSearch: !internetOn }),
          variant: internetOn ? "secondary" : "primary",
        },
      ],
    },
  ];
  for (const item of internal) {
    const actions: PanelAction[] = [];
    if (item.enabled) {
      actions.push({ label: "Turn off", tool: "propose_tool_change", args: { key: item.key, enabled: false, reason: PANEL_REASON }, variant: "secondary" });
    } else if (item.available) {
      actions.push({ label: "Turn on", tool: "propose_tool_change", args: { key: item.key, enabled: true, reason: PANEL_REASON }, variant: "primary" });
    }
    items.push({
      id: item.key,
      title: item.name,
      description: item.description,
      status: item.active
        ? { label: "On", tone: "success" }
        : item.enabled
          ? { label: "On, but unavailable", tone: "warning" }
          : { label: "Off", tone: "neutral" },
      note: item.available ? undefined : "Not set up on this server yet.",
      actions,
    });
  }
  return {
    kind: "tools",
    title: "Tools",
    description: "Extra abilities the worker can use while answering.",
    settingsHref: "/settings/tools",
    items,
  };
}

async function channelsPanel(organizationId: string): Promise<Panel> {
  const profile = await readProfile(organizationId);
  const channels = profile?.channelsConfig ?? { chat: true, email: false, voice: false };
  const toggle = (channel: "chat" | "email", on: boolean): PanelAction => ({
    label: on ? "Turn off" : "Turn on",
    tool: "propose_channel_change",
    args: { channel, enabled: !on, reason: PANEL_REASON },
    variant: on ? "secondary" : "primary",
  });
  return {
    kind: "channels",
    title: "Channels",
    description: "Where the worker talks to customers.",
    settingsHref: "/settings/channels",
    items: [
      {
        id: "chat",
        title: "Chat",
        description: "Playground and the website widget.",
        status: channels.chat ? { label: "On", tone: "success" } : { label: "Off", tone: "neutral" },
        actions: [toggle("chat", channels.chat)],
      },
      {
        id: "email",
        title: "Email",
        description: "Sending email from the connected mailbox.",
        status: channels.email ? { label: "On", tone: "success" } : { label: "Off", tone: "neutral" },
        actions: [toggle("email", channels.email)],
      },
      {
        id: "voice",
        title: "Voice",
        description: "Phone conversations.",
        status: { label: "Coming soon", tone: "neutral" },
        actions: [],
      },
    ],
  };
}

async function emailDomainsPanel(organizationId: string): Promise<Panel> {
  const rows = await db
    .select()
    .from(emailDomains)
    .where(eq(emailDomains.organizationId, organizationId))
    .orderBy(asc(emailDomains.domain));
  return {
    kind: "email_domains",
    title: "Email domains",
    description: "Domains the worker may send email to. Ask me to approve a new one.",
    settingsHref: "/settings/email-domains",
    emptyText: "No domains yet. Tell me which domain to approve, like acme.com.",
    items: rows.map((row) => ({
      id: row.id,
      title: row.domain,
      description: row.reason ?? undefined,
      status:
        row.status === "approved"
          ? { label: "Approved", tone: "success" as const }
          : row.status === "pending"
            ? { label: "Waiting for review", tone: "warning" as const }
            : { label: "Revoked", tone: "neutral" as const },
      actions:
        row.status === "approved"
          ? [{ label: "Revoke", tool: "propose_email_domain_change", args: { domain: row.domain, decision: "revoke", reason: PANEL_REASON }, variant: "secondary" as const }]
          : [{ label: "Approve", tool: "propose_email_domain_change", args: { domain: row.domain, decision: "approve", reason: PANEL_REASON }, variant: "primary" as const }],
    })),
  };
}

export async function loadPanel(organizationId: string, kind: PanelKind): Promise<Panel> {
  switch (kind) {
    case "skills":
      return skillsPanel(organizationId);
    case "knowledge":
      return knowledgePanel(organizationId);
    case "integrations":
      return integrationsPanel(organizationId);
    case "tools":
      return toolsPanel(organizationId);
    case "channels":
      return channelsPanel(organizationId);
    case "email_domains":
      return emailDomainsPanel(organizationId);
  }
}

/** A short plain-text version for the model, so its reply can refer to what the panel shows. */
export function summarizePanel(panel: Panel): string {
  if (panel.items.length === 0) return `${panel.title}: ${panel.emptyText ?? "nothing yet"}`;
  return (
    `${panel.title} (shown to the manager as an interactive panel${
      panel.kind === "knowledge" ? "; read-only, articles are added or updated by attaching a file" : ""
    }):\n` +
    panel.items
      .map((item) => `- ${item.title}${item.status ? ` [${item.status.label}]` : ""}${item.note ? ` (${item.note})` : ""}`)
      .join("\n")
  );
}
