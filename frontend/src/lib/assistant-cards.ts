import type { Message as AguiMessage } from "@ag-ui/client";
import type { AssistantPanelKind, Message } from "@/lib/worker-api";

/**
 * Rich cards in admin Assistant replies, mirroring the API's
 * lib/assistant-cards.ts. Over AG-UI each card is a `render_<kind>` tool
 * call whose arguments are the card's data; CopilotKit renders it with the
 * matching renderer (components/worker/assistant-cards). A stored reply keeps
 * its cards, and toAguiMessages turns a stored chat back into the same shape
 * so a reloaded chat renders exactly like a live one.
 */

export type TicketSummary = {
  conversationId: string;
  ticketNumber: number;
  customerName: string;
  subject: string | null;
  status: string;
  priority: string;
  channel: string;
  updatedAt: string;
};

export type TicketListCard = {
  filter: { status: string | null; sinceDays: number | null };
  tickets: TicketSummary[];
};

export type TicketCard = TicketSummary & {
  humanControlled: boolean;
  messageCount: number;
  latest: { senderName: string; senderType: string; body: string; createdAt: string }[];
};

export type KnowledgeResultsCard = {
  query: string;
  matches: { title: string; heading: string | null; snippet: string }[];
};

export type KnowledgeListCard = {
  titleContains: string | null;
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

export type AuditFinding = { severity: "blocker" | "warning" | "tip"; area: string; issue: string; fix: string };

export type ConfigAuditCard = { findings: AuditFinding[] };

export type PanelCard = { panel: AssistantPanelKind };

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

export function cardToolName(kind: AssistantCardKind): string {
  return `render_${kind}`;
}

/** Older replies stored only panel kinds; show those as panel cards too. */
function cardsOf(message: Message): AssistantCard[] {
  if (message.cards?.length) return message.cards;
  return (message.panels ?? []).map((panel) => ({ id: `${message.id}-panel-${panel}`, kind: "panel" as const, data: { panel } }));
}

/** A stored Assistant chat as AG-UI messages: each reply's cards become its tool calls. */
export function toAguiMessages(messages: Message[]): AguiMessage[] {
  const out: AguiMessage[] = [];
  for (const message of messages) {
    if (message.senderType !== "agent") {
      out.push({ id: message.id, role: "user", content: message.body });
      continue;
    }
    const cards = cardsOf(message);
    out.push({
      id: message.id,
      role: "assistant",
      content: message.body,
      ...(cards.length
        ? {
            toolCalls: cards.map((card) => ({
              id: card.id,
              type: "function" as const,
              function: { name: cardToolName(card.kind), arguments: JSON.stringify(card.data) },
            })),
          }
        : {}),
    });
    for (const card of cards) {
      out.push({ id: `${card.id}-result`, role: "tool", toolCallId: card.id, content: "shown" });
    }
  }
  return out;
}
