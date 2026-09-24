import { NextResponse } from "next/server";
import { publicAppUrl } from "@/lib/env";
import { isOrgAdmin } from "@/lib/org-roles";
import { isPanelKind, type PanelKind } from "@/lib/assistant-panels";
import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";
import {
  runAssistantAgent,
  maybeRefreshAssistantSummary,
  generateAssistantTitle,
  livePendingApprovals,
  toPendingActionView,
  REPLAY_MESSAGE_LIMIT,
  type AssistantDecision,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches the customer-facing chat route's cap — same reasoning, same limit. */
const MAX_MESSAGE_LENGTH = 10000;

// Reads/writes the DB per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

/**
 * The admin assistant's own chat endpoint — deliberately not the customer
 * chat route. That route simulates how the worker answers a customer
 * (guardrails, escalation, "I'm bringing in {manager}"); this one is the
 * manager asking their own assistant a question, answered by a distinct
 * agent (lib/assistant-agent.ts) with read-only tools over the org's data.
 * Conversations here use channel "assistant" so they never mix with real
 * customer traffic or Playground's "chat" test conversations.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "Invalid or missing site token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  let conversationId = body?.conversation_id as string | undefined;
  // A new chat can arrive with an id the browser generated, so the page can
  // put the chat in its address (and survive a reload or navigation) before
  // the reply comes back.
  const newConversationId = typeof body?.new_conversation_id === "string" ? body.new_conversation_id : undefined;
  if (newConversationId && !UUID_RE.test(newConversationId)) {
    return NextResponse.json({ error: "new_conversation_id must be a UUID" }, { status: 400 });
  }

  const rawAttachments = Array.isArray(body?.attachments) ? (body.attachments as unknown[]) : [];
  const attachmentRefs: { id: string; intent: AssistantAttachmentIntent }[] = [];
  for (const entry of rawAttachments) {
    const ref = entry as { id?: unknown; intent?: unknown } | null;
    if (!ref || typeof ref.id !== "string" || !isAttachmentIntent(ref.intent)) {
      return NextResponse.json({ error: "Each attachment needs an id and an intent (context, knowledge, or skill)" }, { status: 400 });
    }
    attachmentRefs.push({ id: ref.id, intent: ref.intent });
  }
  if (attachmentRefs.length > ATTACHMENT_MAX_FILES) {
    return NextResponse.json({ error: `Attach up to ${ATTACHMENT_MAX_FILES} files per message.` }, { status: 422 });
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
      return NextResponse.json({ error: "approval_decision needs decision (approve|cancel) and approval_ids" }, { status: 400 });
    }
    if (!conversationId) {
      return NextResponse.json({ error: "approval_decision needs a conversation_id" }, { status: 400 });
    }
    decision = { decision: rawDecision.decision, approvalIds: ids as string[] };
  }

  // A panel button: which proposal tool, with what arguments. The run
  // whitelists the tool and re-validates the arguments like any proposal.
  const rawUiAction = body?.ui_action as { tool?: unknown; args?: unknown; label?: unknown } | undefined;
  let uiAction: AssistantUiAction | undefined;
  if (rawUiAction) {
    if (typeof rawUiAction.tool !== "string" || !rawUiAction.args || typeof rawUiAction.args !== "object") {
      return NextResponse.json({ error: "ui_action needs tool and args" }, { status: 400 });
    }
    uiAction = { tool: rawUiAction.tool, args: rawUiAction.args as Record<string, unknown> };
  }
  let showPanel: PanelKind | undefined;
  if (body?.show_panel !== undefined) {
    if (!isPanelKind(body.show_panel)) return NextResponse.json({ error: "Unknown panel" }, { status: 400 });
    showPanel = body.show_panel;
  }

  // A card click carries no typed text; record it as what the manager did.
  let message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message && decision) message = decision.decision === "approve" ? "Approve" : "Cancel";
  if (!message && attachmentRefs.length > 0) message = "(Attached files)";
  if (!message && uiAction) message = typeof rawUiAction?.label === "string" ? rawUiAction.label : "Panel action";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: "Message is too long",
        errors: {
          message: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters — this one is ${message.length.toLocaleString()}.`,
        },
      },
      { status: 422 },
    );
  }

  const profile = await getOrCreateProfile(tenant.orgId);

  let conversation;
  if (!conversationId && newConversationId) {
    // A retry of a send that already created this chat reuses it; an id that
    // belongs to anything else is refused rather than adopted.
    const [existing] = await db.select().from(conversations).where(eq(conversations.id, newConversationId)).limit(1);
    if (existing) {
      if (existing.organizationId !== tenant.orgId || existing.channel !== "assistant") {
        return NextResponse.json({ error: "That conversation id is already in use" }, { status: 409 });
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
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  const priorMessages = conversation
    ? await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt)
    : [];

  let pendingTitle: Promise<string> | null = null;
  if (!conversation) {
    const ticketResult = await db.execute<{ next_ticket: number }>(
      sql`select coalesce(max(ticket_number), 1000) + 1 as next_ticket from conversations where organization_id = ${tenant.orgId}`,
    );
    const nextTicket = Number(ticketResult.rows[0]?.next_ticket ?? 1001);

    // Saved straight away with a provisional title, so a page that reloads
    // mid-reply can already find the chat; the generated title follows.
    [conversation] = await db
      .insert(conversations)
      .values({
        ...(newConversationId ? { id: newConversationId } : {}),
        organizationId: tenant.orgId,
        ticketNumber: nextTicket,
        channel: "assistant",
        customerName: profile.managerName,
        subject: message.slice(0, 120),
      })
      .returning();

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
    return NextResponse.json(
      { error: "One or more attached files couldn't be found. Remove them and attach again." },
      { status: 422 },
    );
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
  const recentHistory: AssistantHistoryTurn[] = priorMessages.slice(-REPLAY_MESSAGE_LIMIT).map((m) => ({
    senderType: m.senderType === "agent" ? "agent" : "manager",
    senderName: m.senderName,
    body: m.body,
  }));

  let result;
  try {
    result = await runAssistantAgent(profile, tenant.orgId, conversation.id, message, recentHistory, conversation.summary, {
      attachments,
      decision,
      uiAction,
      showPanel,
      appOrigin: publicAppUrl() || req.nextUrl.origin,
      userId: tenant.userId,
      canChange: isOrgAdmin(tenant.role),
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
    };
  }

  const [reply] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderType: "agent",
      senderName: `${profile.displayName} Assistant`,
      body: result.answer,
      panels: result.panels ?? [],
    })
    .returning();

  // Maintenance pass: fold anything that just fell out of the replay window
  // into the rolling summary. Runs after the turn so it never delays the
  // manager's answer, and a failure here (see maybeRefreshAssistantSummary)
  // can't break the response that already went out.
  const allTurns: AssistantHistoryTurn[] = [...priorMessages, userMessage, reply].map((m) => ({
    senderType: m.senderType === "agent" ? "agent" : "manager",
    senderName: m.senderName,
    body: m.body,
  }));
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

  return NextResponse.json({
    conversation_id: conversation.id,
    message: reply,
    user_message: userMessage,
    conversation_title: conversation.subject,
    pending_actions: pendingActions,
    tools_used: result.toolsUsed ?? [],
    changes_applied: Boolean(result.changesApplied),
    connect_link: result.connectLink ?? null,
    can_change: isOrgAdmin(tenant.role),
  });
}
