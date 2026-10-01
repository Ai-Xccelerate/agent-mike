import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { publicAppUrl } from "@/lib/env";
import { isOrgAdmin } from "@/lib/org-roles";
import { isPanelKind, type PanelKind } from "@/lib/assistant-panels";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import type { TenantContext } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import {
  runAssistantAgent,
  maybeRefreshAssistantSummary,
  generateAssistantTitle,
  livePendingApprovals,
  toPendingActionView,
  REPLAY_MESSAGE_LIMIT,
  type AssistantAgentResult,
  type AssistantDecision,
  type AssistantStreamEvent,
  type AssistantUiAction,
  type AssistantHistoryTurn,
} from "@/lib/assistant-agent";
import {
  ATTACHMENT_MAX_FILES,
  attachmentFilenames,
  bindAttachments,
  isAttachmentIntent,
  type AssistantAttachmentIntent,
} from "@/lib/assistant-attachments";
import type { AssistantCard } from "@/lib/assistant-cards";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches the customer-facing chat route's cap — same reasoning, same limit. */
const MAX_MESSAGE_LENGTH = 10000;

type MessageRow = typeof messages.$inferSelect;

export type AssistantTurnResponse = {
  conversation_id: string;
  message: MessageRow;
  user_message: MessageRow;
  conversation_title: string | null;
  pending_actions: ReturnType<typeof toPendingActionView>[];
  tools_used: string[];
  changes_applied: boolean;
  connect_link: AssistantAgentResult["connectLink"] | null;
  can_change: boolean;
};

export type AssistantTurnOutcome =
  | { ok: true; response: AssistantTurnResponse }
  | { ok: false; status: number; body: Record<string, unknown> };

export type AssistantTurnOptions = {
  /** Streams the reply while it's made (the AG-UI route); the JSON route leaves it unset. */
  onEvent?: (event: AssistantStreamEvent) => void;
  /** Id for the stored reply, so a streamed message and its saved row share one id. */
  replyId?: string;
};

function refuse(status: number, body: Record<string, unknown>): AssistantTurnOutcome {
  return { ok: false, status, body };
}

/**
 * One manager turn with the admin Assistant: validate the request, find or
 * create the assistant conversation, store the manager's message, run the
 * assistant, store its reply (text, panels, cards), and keep the rolling
 * summary and title up to date. Shared by the JSON route
 * (/api/v1/assistant/chat) and the streaming AG-UI route
 * (/api/v1/assistant/agui), which take the same body fields.
 *
 * Conversations here use channel "assistant" so they never mix with real
 * customer traffic or Playground's "chat" test conversations.
 */
export async function runAssistantTurn(
  req: NextRequest,
  tenant: TenantContext,
  body: Record<string, unknown> | null,
  options: AssistantTurnOptions = {},
): Promise<AssistantTurnOutcome> {
  let conversationId = body?.conversation_id as string | undefined;
  // A new chat can arrive with an id the browser generated, so the page can
  // put the chat in its address (and survive a reload or navigation) before
  // the reply comes back.
  const newConversationId = typeof body?.new_conversation_id === "string" ? body.new_conversation_id : undefined;
  if (newConversationId && !UUID_RE.test(newConversationId)) {
    return refuse(400, { error: "new_conversation_id must be a UUID" });
  }

  const rawAttachments = Array.isArray(body?.attachments) ? (body.attachments as unknown[]) : [];
  const attachmentRefs: { id: string; intent: AssistantAttachmentIntent }[] = [];
  for (const entry of rawAttachments) {
    const ref = entry as { id?: unknown; intent?: unknown } | null;
    if (!ref || typeof ref.id !== "string" || !isAttachmentIntent(ref.intent)) {
      return refuse(400, { error: "Each attachment needs an id and an intent (context, knowledge, or skill)" });
    }
    attachmentRefs.push({ id: ref.id, intent: ref.intent });
  }
  if (attachmentRefs.length > ATTACHMENT_MAX_FILES) {
    return refuse(422, { error: `Attach up to ${ATTACHMENT_MAX_FILES} files per message.` });
  }

  const rawDecision = body?.approval_decision as { decision?: unknown; approval_ids?: unknown } | undefined;
  let decision: AssistantDecision | undefined;
  if (rawDecision) {
    const ids = rawDecision.approval_ids;
    if (
      (rawDecision.decision !== "approve" && rawDecision.decision !== "cancel") ||
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === "string")
    ) {
      return refuse(400, { error: "approval_decision needs decision (approve|cancel) and approval_ids" });
    }
    if (!conversationId) {
      return refuse(400, { error: "approval_decision needs a conversation_id" });
    }
    decision = { decision: rawDecision.decision, approvalIds: ids as string[] };
  }

  // A panel button: which proposal tool, with what arguments. The run
  // whitelists the tool and re-validates the arguments like any proposal.
  const rawUiAction = body?.ui_action as { tool?: unknown; args?: unknown; label?: unknown } | undefined;
  let uiAction: AssistantUiAction | undefined;
  if (rawUiAction) {
    if (typeof rawUiAction.tool !== "string" || !rawUiAction.args || typeof rawUiAction.args !== "object") {
      return refuse(400, { error: "ui_action needs tool and args" });
    }
    uiAction = { tool: rawUiAction.tool, args: rawUiAction.args as Record<string, unknown> };
  }
  let showPanel: PanelKind | undefined;
  if (body?.show_panel !== undefined) {
    if (!isPanelKind(body.show_panel)) return refuse(400, { error: "Unknown panel" });
    showPanel = body.show_panel;
  }

  // A card click carries no typed text; record it as what the manager did.
  let message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message && decision) message = decision.decision === "approve" ? "Approve" : "Cancel";
  if (!message && attachmentRefs.length > 0) message = "(Attached files)";
  if (!message && uiAction) message = typeof rawUiAction?.label === "string" ? rawUiAction.label : "Panel action";
  if (!message) {
    return refuse(400, { error: "message is required" });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return refuse(422, {
      error: "Message is too long",
      errors: {
        message: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters — this one is ${message.length.toLocaleString()}.`,
      },
    });
  }

  const profile = await getOrCreateProfile(tenant.orgId);

  let conversation;
  if (!conversationId && newConversationId) {
    // A retry of a send that already created this chat reuses it; an id that
    // belongs to anything else is refused rather than adopted.
    const [existing] = await db.select().from(conversations).where(eq(conversations.id, newConversationId)).limit(1);
    if (existing) {
      if (existing.organizationId !== tenant.orgId || existing.channel !== "assistant") {
        return refuse(409, { error: "That conversation id is already in use" });
      }
      conversationId = existing.id;
    }
  }
  if (conversationId) {
    // Scoped to this org's own assistant threads: an id from another org, or
    // a real customer conversation, must never be written into from here.
    [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.organizationId, tenant.orgId),
          eq(conversations.channel, "assistant"),
        ),
      )
      .limit(1);
    if (!conversation) {
      return refuse(404, { error: "Conversation not found" });
    }
  }

  const priorMessages = conversation
    ? await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt)
    : [];

  let pendingTitle: Promise<string> | null = null;
  if (!conversation) {
    conversation = await insertConversationWithTicket({
      ...(newConversationId ? { id: newConversationId } : {}),
      organizationId: tenant.orgId,
      channel: "assistant",
      customerName: profile.managerName,
      subject: message.slice(0, 120),
    });

    // A files-only first message has no words to title from; use the file names.
    pendingTitle =
      typeof body?.message === "string" && body.message.trim()
        ? generateAssistantTitle(profile, message)
        : attachmentFilenames(tenant.orgId, attachmentRefs.map((ref) => ref.id)).then(
            (names) => (names.length ? names.join(", ") : message).slice(0, 120),
          );
  }

  const attachments = await bindAttachments(tenant.orgId, conversation.id, attachmentRefs);
  if (attachments.length !== attachmentRefs.length) {
    return refuse(422, { error: "One or more attached files couldn't be found. Remove them and attach again." });
  }

  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderType: "manager",
      senderName: profile.managerName,
      body: message,
      attachments: attachments.map((file) => ({ id: file.id, filename: file.filename, intent: file.intent })),
    })
    .returning();

  // Only the most recent REPLAY_MESSAGE_LIMIT messages are replayed verbatim
  // - anything older is represented by conversation.summary instead, so a
  // long-running conversation doesn't grow the model input forever.
  const recentHistory: AssistantHistoryTurn[] = priorMessages.slice(-REPLAY_MESSAGE_LIMIT).map(historyTurn);

  // Cards already shown before a run fails are still kept with the reply.
  const shownCards: AssistantCard[] = [];
  const outer = options.onEvent;
  const onEvent = outer
    ? (event: AssistantStreamEvent) => {
        if (event.type === "card") shownCards.push(event.card);
        outer(event);
      }
    : undefined;

  let result: AssistantAgentResult;
  try {
    result = await runAssistantAgent(profile, tenant.orgId, conversation.id, message, recentHistory, conversation.summary, {
      attachments,
      decision,
      uiAction,
      showPanel,
      appOrigin: publicAppUrl() || req.nextUrl.origin,
      userId: tenant.userId,
      canChange: isOrgAdmin(tenant.role),
      onEvent,
    });
  } catch (error) {
    // A raw agent-run failure (e.g. MaxTurnsExceededError from a longer
    // propose-then-confirm exchange) shouldn't surface as an unhandled 500 -
    // the manager's message is already persisted above either way.
    const detail = error instanceof Error ? error.message : "unknown error";
    result = {
      answer:
        "I ran into a problem completing that (" +
        detail +
        "). If you were confirming or cancelling a pending change, check whether it went through before trying again.",
      cards: shownCards,
    };
  }

  const cards = result.cards ?? [];
  const [reply] = await db
    .insert(messages)
    .values({
      ...(options.replyId ? { id: options.replyId } : {}),
      conversationId: conversation.id,
      senderType: "agent",
      senderName: `${profile.displayName} Assistant`,
      body: result.answer,
      panels: result.panels ?? [],
      cards,
    })
    .returning();

  // Maintenance pass: fold anything that just fell out of the replay window
  // into the rolling summary. Runs after the turn so it never delays the
  // manager's answer, and a failure here (see maybeRefreshAssistantSummary)
  // can't break the response that already went out.
  const allTurns: AssistantHistoryTurn[] = [...priorMessages, userMessage, reply].map(historyTurn);
  const summaryState = await maybeRefreshAssistantSummary(
    profile,
    { summary: conversation.summary, summarizedMessageCount: conversation.summarizedMessageCount },
    allTurns,
  );

  const generatedTitle = pendingTitle ? await pendingTitle.catch(() => null) : null;
  if (generatedTitle) conversation.subject = generatedTitle;

  await db
    .update(conversations)
    .set({
      updatedAt: new Date(),
      summary: summaryState.summary,
      summarizedMessageCount: summaryState.summarizedMessageCount,
      ...(generatedTitle ? { subject: generatedTitle } : {}),
    })
    .where(eq(conversations.id, conversation.id));

  // Recomputed rather than trusting result.pendingActions: after a failed
  // run it's absent, but a proposal may still have been recorded.
  const pendingActions = result.pendingActions ?? (await livePendingApprovals(tenant.orgId, conversation.id)).map(toPendingActionView);

  return {
    ok: true,
    response: {
      conversation_id: conversation.id,
      message: reply,
      user_message: userMessage,
      conversation_title: conversation.subject,
      pending_actions: pendingActions,
      tools_used: result.toolsUsed ?? [],
      changes_applied: Boolean(result.changesApplied),
      connect_link: result.connectLink ?? null,
      can_change: isOrgAdmin(tenant.role),
    },
  };
}

/** A stored message as history for the model: its text plus what its cards showed. */
function historyTurn(m: MessageRow): AssistantHistoryTurn {
  return {
    senderType: m.senderType === "agent" ? "agent" : "manager",
    senderName: m.senderName,
    body: [m.body, describeCards(m.cards ?? [])].filter(Boolean).join("\n"),
  };
}

/**
 * A short stand-in for a reply's cards, so the replayed history and the
 * rolling summary know what the manager was shown (a cards-only reply has
 * no text at all).
 */
export function describeCards(cards: AssistantCard[]): string {
  return cards
    .map((card) => {
      switch (card.kind) {
        case "ticket_list":
          return `(Showed ${card.data.tickets.length} conversation(s): ${card.data.tickets.map((t) => `#${t.ticketNumber}`).join(", ") || "none"})`;
        case "ticket":
          return `(Showed ticket #${card.data.ticketNumber})`;
        case "knowledge_results":
          return `(Showed knowledge results for "${card.data.query}": ${card.data.matches.map((m) => m.title).join(", ") || "none"})`;
        case "knowledge_list":
          return `(Showed ${card.data.total} knowledge article(s))`;
        case "config":
          return "(Showed the worker's configuration)";
        case "config_audit":
          return `(Showed a setup check with ${card.data.findings.length} finding(s))`;
        case "panel":
          return `(Showed the ${card.data.panel.replace("_", " ")} panel)`;
        case "draft":
          return `(Showed a draft${card.data.ticketNumber ? ` for ticket #${card.data.ticketNumber}` : ""}:\n${card.data.body})`;
      }
    })
    .join("\n");
}

export function newReplyId(): string {
  return randomUUID();
}
