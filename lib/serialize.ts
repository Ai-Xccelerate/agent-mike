import { conversations, messages } from "@/db/schema";

export function serializeMessage(message: typeof messages.$inferSelect) {
  return {
    id: message.id,
    sender_type: message.senderType,
    sender_name: message.senderName,
    body: message.body,
    citations: message.citations ?? [],
    created_at: message.createdAt.toISOString(),
  };
}

export function serializeConversation(
  conversation: typeof conversations.$inferSelect,
  conversationMessages: Array<typeof messages.$inferSelect> = [],
) {
  return {
    id: conversation.id,
    ticket_number: conversation.ticketNumber,
    channel: conversation.channel,
    customer_name: conversation.customerName,
    customer_email: conversation.customerEmail,
    subject: conversation.subject,
    status: conversation.status,
    priority: conversation.priority,
    assigned_to: conversation.assignedTo,
    confidence: conversation.confidence,
    summary: conversation.summary,
    created_at: conversation.createdAt.toISOString(),
    updated_at: conversation.updatedAt.toISOString(),
    messages: conversationMessages.map(serializeMessage),
  };
}

export function serializeKnowledge(
  document: {
    id: string;
    conceptId: string;
    type: string;
    title: string;
    description: string | null;
    resource: string | null;
    tags: string[];
    status: string;
    sourceTimestamp: string | null;
    ingestedAt: Date;
  },
  chunkCount: number,
) {
  return {
    id: document.id,
    concept_id: document.conceptId,
    type: document.type,
    title: document.title,
    description: document.description,
    resource: document.resource,
    tags: document.tags,
    status: document.status,
    source_timestamp: document.sourceTimestamp,
    ingested_at: document.ingestedAt.toISOString(),
    chunk_count: chunkCount,
  };
}

export function ticketRef(conversation: typeof conversations.$inferSelect) {
  if (conversation.ticketNumber) return `EAPX-${conversation.ticketNumber}`;
  return "EAPX-" + conversation.id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function applyOutcome(
  conversation: typeof conversations.$inferSelect,
  profile: { displayName: string; managerName: string },
  answer: { escalated: boolean; resolved?: boolean; priority?: string },
) {
  if (answer.resolved) {
    return {
      status: "resolved",
      priority: "normal",
      assignedTo: profile.displayName,
    };
  }
  if (answer.escalated) {
    return {
      status: "needs_human",
      priority: answer.priority || "high",
      assignedTo: profile.managerName,
    };
  }
  return {
    status: "open",
    priority: "normal",
    assignedTo: profile.displayName,
  };
}
