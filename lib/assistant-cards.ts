import { randomUUID } from "crypto";
import type { AuditFinding, ConfigurationSnapshot } from "@/lib/assistant-config-audit";
import type { KnowledgeMatch } from "@/lib/knowledge";
import type { PanelKind } from "@/lib/assistant-panels";

/**
 * Rich cards the admin Assistant shows in a reply instead of describing
 * results in prose. A read tool emits one when the manager asked to see its
 * results (its `show` argument); the reply text then only adds what the card
 * can't say. Over AG-UI each card is a `render_<kind>` tool call whose
 * arguments are the card's data (see app/api/v1/assistant/agui), and the
 * frontend renders it with CopilotKit's tool-call renderers. Cards are stored
 * on the reply (messages.cards) so a reloaded chat shows the same thing.
 *
 * Card data is a snapshot of what the tool read, unlike panels, which re-read
 * live state: a ticket list should keep showing what the answer was about.
 */

export type TicketListCard = {
  filter: { status: string | null; sinceDays: number | null };
  tickets: {
    conversationId: string;
    ticketNumber: number;
    customerName: string;
    subject: string | null;
    status: string;
    priority: string;
    channel: string;
    updatedAt: string;
  }[];
};

export type TicketCard = {
  conversationId: string;
  ticketNumber: number;
  customerName: string;
  subject: string | null;
  channel: string;
  status: string;
  priority: string;
  humanControlled: boolean;
  messageCount: number;
  updatedAt: string;
  latest: { senderName: string; senderType: string; body: string; createdAt: string }[];
};

export type KnowledgeResultsCard = {
  query: string;
  matches: { title: string; heading: string | null; snippet: string }[];
};

export type KnowledgeListCard = {
  titleContains: string | null;
  /** False when nothing matched the filter and every article is listed instead. */
  matchedFilter: boolean;
  total: number;
  articles: { conceptId: string; title: string }[];
};

export type ConfigCard = {
  displayName: string;
  status: string;
  model: string;
  tone: string;
  channels: string[];
  skills: { enabled: number; total: number; inactive: number };
  knowledgeCount: number;
  mailbox: { connected: boolean; email: string | null } | null;
  integrations: { type: string; status: string }[];
  emailDomains: { approved: number; pending: number };
  guardrails: { confidenceThreshold: number; escalationTerms: number; requireUserVerification: boolean; assistantActions: boolean };
  conversationCount: number;
};

export type ConfigAuditCard = {
  findings: AuditFinding[];
};

export type PanelCard = { panel: PanelKind };

export type DraftCard = {
  format: "email" | "chat" | "article";
  ticketNumber: number | null;
  conversationId: string | null;
  subject: string | null;
  body: string;
};

export type AssistantCardData = {
  ticket_list: TicketListCard;
  ticket: TicketCard;
  knowledge_results: KnowledgeResultsCard;
  knowledge_list: KnowledgeListCard;
  config: ConfigCard;
  config_audit: ConfigAuditCard;
  panel: PanelCard;
  draft: DraftCard;
};

export type AssistantCardKind = keyof AssistantCardData;

export type AssistantCard = {
  [K in AssistantCardKind]: { id: string; kind: K; data: AssistantCardData[K] };
}[AssistantCardKind];

export const CARD_KINDS: readonly AssistantCardKind[] = [
  "ticket_list",
  "ticket",
  "knowledge_results",
  "knowledge_list",
  "config",
  "config_audit",
  "panel",
  "draft",
];

/** The AG-UI tool name a card travels under; the frontend registers a renderer per name. */
export function cardToolName(kind: AssistantCardKind): string {
  return `render_${kind}`;
}

export function makeCard<K extends AssistantCardKind>(kind: K, data: AssistantCardData[K]): AssistantCard {
  return { id: randomUUID(), kind, data } as AssistantCard;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function knowledgeResultsCard(query: string, matches: KnowledgeMatch[]): AssistantCard {
  return makeCard("knowledge_results", {
    query,
    matches: matches.map((match) => ({
      title: match.title,
      heading: match.heading,
      snippet: clip(match.content.replace(/^#+\s.*$/gm, ""), 240),
    })),
  });
}

export function ticketCard(
  conversation: {
    id: string;
    ticketNumber: number;
    customerName: string;
    subject: string | null;
    channel: string;
    status: string;
    priority: string;
    humanControlled: boolean;
    updatedAt: Date;
  },
  rows: { senderName: string; senderType: string; body: string; createdAt: Date }[],
): AssistantCard {
  return makeCard("ticket", {
    conversationId: conversation.id,
    ticketNumber: conversation.ticketNumber,
    customerName: conversation.customerName,
    subject: conversation.subject,
    channel: conversation.channel,
    status: conversation.status,
    priority: conversation.priority,
    humanControlled: conversation.humanControlled,
    messageCount: rows.length,
    updatedAt: conversation.updatedAt.toISOString(),
    latest: rows.slice(-3).map((row) => ({
      senderName: row.senderName,
      senderType: row.senderType,
      body: clip(row.body, 280),
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

export function configCard(snapshot: ConfigurationSnapshot): AssistantCard {
  const { profile } = snapshot;
  const enabledSkills = snapshot.skills.filter((skill) => skill.enabled);
  return makeCard("config", {
    displayName: profile.displayName,
    status: profile.status,
    model: profile.model,
    tone: profile.tone,
    channels: Object.entries(profile.channelsConfig)
      .filter(([, on]) => on)
      .map(([name]) => name),
    skills: {
      enabled: enabledSkills.length,
      total: snapshot.skills.length,
      inactive: enabledSkills.filter((skill) => !skill.requirementsMet).length,
    },
    knowledgeCount: snapshot.knowledgeCount,
    mailbox: snapshot.mailbox,
    integrations: Object.entries(snapshot.integrationConnections)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([type, status]) => ({ type, status })),
    emailDomains: snapshot.emailDomains,
    guardrails: {
      confidenceThreshold: profile.confidenceThreshold,
      escalationTerms: profile.escalationTerms.length,
      requireUserVerification: profile.requireUserVerification,
      assistantActions: profile.assistantActionsEnabled,
    },
    conversationCount: snapshot.realConversationCount,
  });
}

/**
 * Audit fixes are written for the model ("I can propose a role
 * (propose_role_change) if..."); a card shows them to the manager, so the
 * internal tool names come out.
 */
export function configAuditCard(findings: AuditFinding[]): AssistantCard {
  return makeCard("config_audit", {
    findings: findings.map((finding) => ({
      ...finding,
      // Some issues end with a server message that has its own period.
      issue: finding.issue.replace(/\.{2,}$/, "."),
      fix: finding.fix.replace(/\s*\((?:propose|confirm|cancel)_[a-z_]+(?:\s+or\s+(?:propose|confirm|cancel)_[a-z_]+)*\)/g, ""),
    })),
  });
}

/** Rejects anything that isn't a stored card, so a bad row can't break a reloaded chat. */
export function isAssistantCard(value: unknown): value is AssistantCard {
  if (!value || typeof value !== "object") return false;
  const card = value as { id?: unknown; kind?: unknown; data?: unknown };
  return (
    typeof card.id === "string" &&
    typeof card.kind === "string" &&
    (CARD_KINDS as readonly string[]).includes(card.kind) &&
    Boolean(card.data) &&
    typeof card.data === "object"
  );
}
