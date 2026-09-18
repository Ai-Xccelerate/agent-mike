import { Agent, run, tool } from "@openai/agents";
import type { Tool } from "@openai/agents";
import { z } from "zod";
import { and, desc, eq, gte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, workerProfiles } from "@/db/schema";
import { retrieveKnowledge } from "@/lib/retrieval";
import { ingestOkf, wrapAsOkf } from "@/lib/knowledge";
import { modelUnavailabilityReason, type ModelUnavailabilityReason } from "@/lib/env";
import { ASSISTANT_CHAT_WORKFLOW, runTracedAgent } from "@/lib/agent-tracing";
import { logAndRunTool } from "@/lib/tools-integrations/logged-tool";
import {
  createPendingApproval,
  decideApproval,
  listPendingApprovals,
  recordApprovalResult,
  type ToolApproval,
} from "@/lib/tools-integrations/approval-repository";

/**
 * The manager's own conversations with this admin assistant never count as
 * "real" traffic for its own tools to report on — same reasoning as Inbox
 * excluding Playground's test conversations, just applied to a second
 * internal-only channel.
 */
export const INTERNAL_CONVERSATION_CHANNELS = ["chat", "assistant"] as const;

type Profile = typeof workerProfiles.$inferSelect;

export const PROPOSE_ROLE_CHANGE_TOOL_NAME = "propose_role_change";
export const PROPOSE_TONE_CHANGE_TOOL_NAME = "propose_tone_change";
export const PROPOSE_ESCALATION_TERMS_CHANGE_TOOL_NAME = "propose_escalation_terms_change";
export const PROPOSE_CHANNEL_CHANGE_TOOL_NAME = "propose_channel_change";
export const PROPOSE_SKILL_CHANGE_TOOL_NAME = "propose_skill_change";
export const PROPOSE_ACTION_TOOL_NAME = "propose_action";
export const PROPOSE_SEND_REPLY_TOOL_NAME = "propose_send_reply";
export const PROPOSE_UPDATE_TICKET_STATUS_TOOL_NAME = "propose_update_ticket_status";
export const PROPOSE_PUBLISH_KNOWLEDGE_ARTICLE_TOOL_NAME = "propose_publish_knowledge_article";
export const CONFIRM_PENDING_CHANGE_TOOL_NAME = "confirm_pending_change";
export const CANCEL_PENDING_CHANGE_TOOL_NAME = "cancel_pending_change";

function assistantToolFailed(text: string): string | null {
  if (text.startsWith("Could not complete that:") || text.startsWith("That failed:")) return text;
  return null;
}

function loggedAssistantTool(
  organizationId: string,
  toolId: string,
  input: Record<string, unknown>,
  run: () => Promise<string>,
): Promise<string> {
  return logAndRunTool(
    { organizationId, toolId, calledBy: "assistant", input },
    run,
    { errorIf: assistantToolFailed },
  );
}

/**
 * Every Tier 3/4 write goes through the same two-step shape: a `propose_*`
 * tool that validates and records the intent (never writes real data), and
 * the shared confirm/cancel pair below that actually applies it. The model
 * is instructed to propose in one turn and only call confirm in a later
 * turn, after the manager's own explicit "yes" - a soft, prompt-level
 * convention (matching Jules), not a hard code-enforced gate, but backed by
 * real server-side state (toolApprovals) rather than relying purely on the
 * model remembering what it proposed.
 */
const TOOL_CONFIGURE_ROLE = "assistant_configure_role";
const TOOL_CONFIGURE_TONE = "assistant_configure_tone";
const TOOL_CONFIGURE_ESCALATION_TERMS = "assistant_configure_escalation_terms";
const TOOL_CONFIGURE_CHANNEL = "assistant_configure_channel";
const TOOL_CONFIGURE_SKILL = "assistant_configure_skill";
const TOOL_ACTION_SEND_REPLY = "assistant_action_send_reply";
const TOOL_ACTION_UPDATE_TICKET_STATUS = "assistant_action_update_ticket_status";
const TOOL_ACTION_PUBLISH_KNOWLEDGE = "assistant_action_publish_knowledge";

const CONFIGURE_TOOL_IDS = new Set([
  TOOL_CONFIGURE_ROLE,
  TOOL_CONFIGURE_TONE,
  TOOL_CONFIGURE_ESCALATION_TERMS,
  TOOL_CONFIGURE_CHANNEL,
  TOOL_CONFIGURE_SKILL,
]);
const ACTION_TOOL_IDS = new Set([
  TOOL_ACTION_SEND_REPLY,
  TOOL_ACTION_UPDATE_TICKET_STATUS,
  TOOL_ACTION_PUBLISH_KNOWLEDGE,
]);

function describePendingChange(toolId: string, input: Record<string, unknown>): string {
  switch (toolId) {
    case TOOL_CONFIGURE_ROLE:
      return `change the role to: "${input.newValue}"`;
    case TOOL_CONFIGURE_TONE:
      return `change the tone to: "${input.newValue}"`;
    case TOOL_CONFIGURE_ESCALATION_TERMS:
      return `replace the escalation terms with: ${(input.newTerms as string[]).join(", ")}`;
    case TOOL_CONFIGURE_CHANNEL:
      return `turn the ${input.channel} channel ${input.enabled ? "on" : "off"}`;
    case TOOL_CONFIGURE_SKILL:
      return `${input.enabled ? "enable" : "disable"} the "${input.skillId}" skill`;
    case TOOL_ACTION_SEND_REPLY:
      return `send this reply to ticket #${input.ticketNumber}: "${input.replyText}"`;
    case TOOL_ACTION_UPDATE_TICKET_STATUS:
      return `mark ticket #${input.ticketNumber} as ${input.newStatus}`;
    case TOOL_ACTION_PUBLISH_KNOWLEDGE:
      return `publish a new knowledge article titled "${input.title}"`;
    default:
      return "make this change";
  }
}

/**
 * Applies a pending approval's stored input for real. Called only from the
 * confirm tool, only once a manager has explicitly said yes to what
 * describePendingChange() described.
 */
async function applyPendingChange(
  organizationId: string,
  toolId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (toolId === TOOL_CONFIGURE_ROLE) {
    await db.update(workerProfiles).set({ role: input.newValue as string, updatedAt: new Date() }).where(eq(workerProfiles.organizationId, organizationId));
    return { role: input.newValue };
  }
  if (toolId === TOOL_CONFIGURE_TONE) {
    await db.update(workerProfiles).set({ tone: input.newValue as string, updatedAt: new Date() }).where(eq(workerProfiles.organizationId, organizationId));
    return { tone: input.newValue };
  }
  if (toolId === TOOL_CONFIGURE_ESCALATION_TERMS) {
    await db
      .update(workerProfiles)
      .set({ escalationTerms: input.newTerms as string[], updatedAt: new Date() })
      .where(eq(workerProfiles.organizationId, organizationId));
    return { escalationTerms: input.newTerms };
  }
  if (toolId === TOOL_CONFIGURE_CHANNEL) {
    const [current] = await db.select().from(workerProfiles).where(eq(workerProfiles.organizationId, organizationId)).limit(1);
    const channelsConfig = { ...current.channelsConfig, [input.channel as string]: input.enabled as boolean };
    await db.update(workerProfiles).set({ channelsConfig, updatedAt: new Date() }).where(eq(workerProfiles.organizationId, organizationId));
    return { channelsConfig };
  }
  if (toolId === TOOL_CONFIGURE_SKILL) {
    const [current] = await db.select().from(workerProfiles).where(eq(workerProfiles.organizationId, organizationId)).limit(1);
    const skillId = input.skillId as string;
    const enabled = input.enabled as boolean;
    const enabledSkills = enabled
      ? Array.from(new Set([...current.enabledSkills, skillId]))
      : current.enabledSkills.filter((id) => id !== skillId);
    await db.update(workerProfiles).set({ enabledSkills, updatedAt: new Date() }).where(eq(workerProfiles.organizationId, organizationId));
    return { enabledSkills };
  }
  if (toolId === TOOL_ACTION_SEND_REPLY) {
    const ticketNumber = input.ticketNumber as number;
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.organizationId, organizationId), eq(conversations.ticketNumber, ticketNumber)))
      .limit(1);
    if (!conversation) return { error: `No conversation found with ticket number ${ticketNumber}.` };
    const [current] = await db.select().from(workerProfiles).where(eq(workerProfiles.organizationId, organizationId)).limit(1);
    await db.insert(messages).values({
      conversationId: conversation.id,
      senderType: "manager",
      senderName: current.managerName,
      body: input.replyText as string,
    });
    await db.update(conversations).set({ status: "open", updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
    return { sent: true, ticketNumber };
  }
  if (toolId === TOOL_ACTION_UPDATE_TICKET_STATUS) {
    const ticketNumber = input.ticketNumber as number;
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.organizationId, organizationId), eq(conversations.ticketNumber, ticketNumber)))
      .limit(1);
    if (!conversation) return { error: `No conversation found with ticket number ${ticketNumber}.` };
    await db
      .update(conversations)
      .set({ status: input.newStatus as string, updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    return { ticketNumber, status: input.newStatus };
  }
  if (toolId === TOOL_ACTION_PUBLISH_KNOWLEDGE) {
    const title = input.title as string;
    const conceptId = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || `article-${Date.now()}`;
    const doc = await ingestOkf(organizationId, conceptId, wrapAsOkf(conceptId, title, input.body as string));
    return { conceptId: doc.conceptId, title: doc.title };
  }
  return { error: "Unknown pending change type." };
}

function buildConfigureTools(organizationId: string, conversationId: string): Tool[] {
  return [
    tool({
      name: PROPOSE_ROLE_CHANGE_TOOL_NAME,
      description:
        "Propose changing this worker's Role text. Does not apply anything - creates a pending " +
        "change and describes it back to the manager. Only call this after reading the current role " +
        "with get_worker_configuration if you have not already seen it this conversation.",
      parameters: z.object({ newValue: z.string().describe("The full new role text"), reason: z.string() }),
      execute: async ({ newValue, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_ROLE_CHANGE_TOOL_NAME, { newValue, reason }, async () => {
          const approval = await createPendingApproval({ organizationId, conversationId, toolId: TOOL_CONFIGURE_ROLE, input: { newValue, reason } });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_CONFIGURE_ROLE, { newValue })}. Waiting for confirmation.`;
        }),
    }),
    tool({
      name: PROPOSE_TONE_CHANGE_TOOL_NAME,
      description: "Propose changing this worker's Tone text. Does not apply anything.",
      parameters: z.object({ newValue: z.string().describe("The full new tone text"), reason: z.string() }),
      execute: async ({ newValue, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_TONE_CHANGE_TOOL_NAME, { newValue, reason }, async () => {
          const approval = await createPendingApproval({ organizationId, conversationId, toolId: TOOL_CONFIGURE_TONE, input: { newValue, reason } });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_CONFIGURE_TONE, { newValue })}. Waiting for confirmation.`;
        }),
    }),
    tool({
      name: PROPOSE_ESCALATION_TERMS_CHANGE_TOOL_NAME,
      description:
        "Propose replacing the full list of escalation terms/phrases (the guardrail). Does not apply " +
        "anything. Read the current list first with get_worker_configuration so you propose a complete " +
        "replacement, not just the delta.",
      parameters: z.object({ newTerms: z.array(z.string()).describe("The complete new list of escalation terms"), reason: z.string() }),
      execute: async ({ newTerms, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_ESCALATION_TERMS_CHANGE_TOOL_NAME, { newTerms, reason }, async () => {
          const approval = await createPendingApproval({
            organizationId,
            conversationId,
            toolId: TOOL_CONFIGURE_ESCALATION_TERMS,
            input: { newTerms, reason },
          });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_CONFIGURE_ESCALATION_TERMS, { newTerms })}. Waiting for confirmation.`;
        }),
    }),
    tool({
      name: PROPOSE_CHANNEL_CHANGE_TOOL_NAME,
      description: "Propose turning one channel (chat, email, or voice) on or off. Does not apply anything.",
      parameters: z.object({ channel: z.enum(["chat", "email", "voice"]), enabled: z.boolean(), reason: z.string() }),
      execute: async ({ channel, enabled, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_CHANNEL_CHANGE_TOOL_NAME, { channel, enabled, reason }, async () => {
          const approval = await createPendingApproval({
            organizationId,
            conversationId,
            toolId: TOOL_CONFIGURE_CHANNEL,
            input: { channel, enabled, reason },
          });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_CONFIGURE_CHANNEL, { channel, enabled })}. Waiting for confirmation.`;
        }),
    }),
    tool({
      name: PROPOSE_SKILL_CHANGE_TOOL_NAME,
      description:
        "Propose enabling or disabling one skill by id (see get_worker_configuration for the list of " +
        "enabled skill ids). Does not apply anything.",
      parameters: z.object({ skillId: z.string(), enabled: z.boolean(), reason: z.string() }),
      execute: async ({ skillId, enabled, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_SKILL_CHANGE_TOOL_NAME, { skillId, enabled, reason }, async () => {
          const approval = await createPendingApproval({
            organizationId,
            conversationId,
            toolId: TOOL_CONFIGURE_SKILL,
            input: { skillId, enabled, reason },
          });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_CONFIGURE_SKILL, { skillId, enabled })}. Waiting for confirmation.`;
        }),
    }),
  ];
}

function buildActionTools(profile: Profile, organizationId: string, conversationId: string): Tool[] {
  if (!profile.assistantActionsEnabled) {
    const disabledMessage =
      "Actions are turned off for this worker. Turn on \"Let the Assistant take actions\" in " +
      "Settings > Guardrails first, then try again.";
    return [
      tool({
        name: PROPOSE_ACTION_TOOL_NAME,
        description:
          "Attempt to send a reply, change a ticket's status, or publish a knowledge article. Actions " +
          "are currently disabled for this worker - calling this will explain that rather than doing " +
          "anything.",
        parameters: z.object({ actionType: z.string(), details: z.string() }),
        execute: async ({ actionType, details }) =>
          loggedAssistantTool(organizationId, PROPOSE_ACTION_TOOL_NAME, { actionType, details }, async () => disabledMessage),
      }),
    ];
  }

  return [
    tool({
      name: PROPOSE_SEND_REPLY_TOOL_NAME,
      description:
        "Propose sending a reply directly to a real customer on a specific ticket. Does not send " +
        "anything yet - creates a pending action and describes it back to the manager.",
      parameters: z.object({
        ticketNumber: z.number().describe("The ticket to reply to"),
        replyText: z.string().describe("The exact reply text to send"),
        reason: z.string(),
      }),
      execute: async ({ ticketNumber, replyText, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_SEND_REPLY_TOOL_NAME, { ticketNumber, replyText, reason }, async () => {
          const approval = await createPendingApproval({
            organizationId,
            conversationId,
            toolId: TOOL_ACTION_SEND_REPLY,
            input: { ticketNumber, replyText, reason },
          });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_ACTION_SEND_REPLY, { ticketNumber, replyText })}. Waiting for confirmation.`;
        }),
    }),
    tool({
      name: PROPOSE_UPDATE_TICKET_STATUS_TOOL_NAME,
      description: "Propose resolving, closing, reopening, or escalating a specific ticket. Does not apply anything yet.",
      parameters: z.object({
        ticketNumber: z.number(),
        newStatus: z.enum(["open", "needs_human", "resolved", "closed"]),
        reason: z.string(),
      }),
      execute: async ({ ticketNumber, newStatus, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_UPDATE_TICKET_STATUS_TOOL_NAME, { ticketNumber, newStatus, reason }, async () => {
          const approval = await createPendingApproval({
            organizationId,
            conversationId,
            toolId: TOOL_ACTION_UPDATE_TICKET_STATUS,
            input: { ticketNumber, newStatus, reason },
          });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_ACTION_UPDATE_TICKET_STATUS, { ticketNumber, newStatus })}. Waiting for confirmation.`;
        }),
    }),
    tool({
      name: PROPOSE_PUBLISH_KNOWLEDGE_ARTICLE_TOOL_NAME,
      description:
        "Propose creating and publishing a new knowledge base article. Does not publish anything yet.",
      parameters: z.object({
        title: z.string(),
        body: z.string().describe("Full markdown body of the article"),
        reason: z.string(),
      }),
      execute: async ({ title, body, reason }) =>
        loggedAssistantTool(organizationId, PROPOSE_PUBLISH_KNOWLEDGE_ARTICLE_TOOL_NAME, { title, body, reason }, async () => {
          const approval = await createPendingApproval({
            organizationId,
            conversationId,
            toolId: TOOL_ACTION_PUBLISH_KNOWLEDGE,
            input: { title, body, reason },
          });
          return `Proposed (id ${approval.id}): ${describePendingChange(TOOL_ACTION_PUBLISH_KNOWLEDGE, { title })}. Waiting for confirmation.`;
        }),
    }),
  ];
}

function buildConfirmationTools(organizationId: string, managerName: string, conversationId: string): Tool[] {
  return [
    tool({
      name: CONFIRM_PENDING_CHANGE_TOOL_NAME,
      description:
        "Apply the most recently proposed change or action for real. Call this ONLY when the " +
        "manager's current message is a clear, explicit affirmative (e.g. \"yes\", \"do it\", \"go " +
        "ahead\", \"confirmed\") replying to something YOU proposed in your immediately preceding " +
        "turn. Never call this in the same turn as a propose_* tool, and never call it speculatively.",
      parameters: z.object({}),
      execute: async () =>
        loggedAssistantTool(organizationId, CONFIRM_PENDING_CHANGE_TOOL_NAME, {}, async () => {
          const pending = await listPendingApprovals(organizationId, conversationId);
          const approval = pending[0];
          if (!approval) return "There's nothing pending to confirm.";
          if (!CONFIGURE_TOOL_IDS.has(approval.toolId) && !ACTION_TOOL_IDS.has(approval.toolId)) {
            return "There's nothing pending to confirm.";
          }
          await decideApproval(approval.id, "approved", managerName);
          try {
            const result = await applyPendingChange(organizationId, approval.toolId, approval.input);
            await recordApprovalResult(approval.id, result, null);
            if (result.error) return `Could not complete that: ${result.error}`;
            return `Done — ${describePendingChange(approval.toolId, approval.input)}.`;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "unknown error";
            await recordApprovalResult(approval.id, null, errorMessage);
            return `That failed: ${errorMessage}`;
          }
        }),
    }),
    tool({
      name: CANCEL_PENDING_CHANGE_TOOL_NAME,
      description:
        "Discard the most recently proposed change or action without applying it. Call this when the " +
        "manager declines, changes their mind, or asks for something different instead.",
      parameters: z.object({}),
      execute: async () =>
        loggedAssistantTool(organizationId, CANCEL_PENDING_CHANGE_TOOL_NAME, {}, async () => {
          const pending = await listPendingApprovals(organizationId, conversationId);
          const approval = pending[0];
          if (!approval) return "There's nothing pending to cancel.";
          await decideApproval(approval.id, "rejected", managerName);
          return "Cancelled — nothing was changed.";
        }),
    }),
  ];
}

/**
 * Tier 1 (read), Tier 2 (draft, via instructions only - no dedicated tools
 * needed since drafting is plain generation once the model has context from
 * the read tools), Tier 3 (configure) and Tier 4 (act, gated by
 * profile.assistantActionsEnabled) all share one tool list and one
 * confirm/cancel pair.
 */
export function buildAssistantTools(profile: Profile, organizationId: string, conversationId: string): Tool[] {
  return [
    tool({
      name: "query_conversations",
      description:
        "Look up real customer conversations (email and website channels only — never this " +
        "assistant's own conversations, never Playground test conversations). Read-only. Use it " +
        "to answer questions like how many conversations are open, or which ones are escalated.",
      parameters: z.object({
        status: z
          .enum(["open", "needs_human", "resolved", "closed"])
          .nullable()
          .describe("Filter by status, or null for every status"),
        sinceDays: z
          .number()
          .nullable()
          .describe("Only include conversations updated within this many days, or null for no limit"),
        limit: z.number().min(1).max(50).describe("Max rows to return (cap at 50)"),
      }),
      execute: async ({ status, sinceDays, limit }) => {
        const conditions = [
          eq(conversations.organizationId, organizationId),
          notInArray(conversations.channel, [...INTERNAL_CONVERSATION_CHANNELS]),
        ];
        if (status) conditions.push(eq(conversations.status, status));
        if (sinceDays) {
          const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
          conditions.push(gte(conversations.updatedAt, since));
        }
        const rows = await db
          .select({
            ticketNumber: conversations.ticketNumber,
            channel: conversations.channel,
            customerName: conversations.customerName,
            subject: conversations.subject,
            status: conversations.status,
            priority: conversations.priority,
            updatedAt: conversations.updatedAt,
          })
          .from(conversations)
          .where(and(...conditions))
          .orderBy(desc(conversations.updatedAt))
          .limit(Math.min(limit, 50));

        if (rows.length === 0) return "No conversations match that filter.";
        return (
          `${rows.length} conversation(s):\n` +
          rows
            .map(
              (r) =>
                `#${r.ticketNumber} [${r.status}${r.priority !== "normal" ? `, ${r.priority}` : ""}] ` +
                `${r.customerName} — ${r.subject ?? "(no subject)"} (${r.channel}, updated ${r.updatedAt.toISOString()})`,
            )
            .join("\n")
        );
      },
    }),

    tool({
      name: "summarize_conversation",
      description:
        "Fetch the full message transcript of one real customer conversation by its ticket number, " +
        "so you can summarize or answer questions about it. Read-only.",
      parameters: z.object({
        ticketNumber: z.number().describe("The conversation's ticket number, e.g. 1042"),
      }),
      execute: async ({ ticketNumber }) => {
        const [conversation] = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.organizationId, organizationId),
              eq(conversations.ticketNumber, ticketNumber),
            ),
          )
          .limit(1);
        if (!conversation) return `No conversation found with ticket number ${ticketNumber}.`;

        const rows = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversation.id))
          .orderBy(messages.createdAt);

        const transcript = rows.map((m) => `${m.senderName} (${m.senderType}): ${m.body}`).join("\n");
        return (
          `Ticket #${conversation.ticketNumber} — ${conversation.customerName}, ` +
          `status: ${conversation.status}\n\n${transcript || "(no messages)"}`
        );
      },
    }),

    tool({
      name: "search_knowledge",
      description: "Search this worker's knowledge base for a topic. Read-only.",
      parameters: z.object({
        query: z.string().describe("What to search for in the knowledge base"),
      }),
      execute: async ({ query }) => {
        const { matches } = await retrieveKnowledge(profile, query);
        if (matches.length === 0) return "No knowledge documents matched that search.";
        return matches
          .map((m) => `### ${m.title}${m.heading ? ` — ${m.heading}` : ""}\n${m.content}`)
          .join("\n\n");
      },
    }),

    tool({
      name: "get_worker_configuration",
      description:
        "Read this worker's current live configuration: role, tone, escalation rules, which channels " +
        "are on, and which skills are enabled. Read-only — does not change anything.",
      parameters: z.object({}),
      execute: async () => {
        return [
          `Role: ${profile.role}`,
          `Tone: ${profile.tone}`,
          `Escalates on: ${profile.escalationTerms.join(", ") || "(none configured)"}`,
          `Channels on: ${
            Object.entries(profile.channelsConfig)
              .filter(([, on]) => on)
              .map(([name]) => name)
              .join(", ") || "(none)"
          }`,
          `Skills enabled: ${profile.enabledSkills.join(", ") || "(none)"}`,
          `Model: ${profile.model}`,
        ].join("\n");
      },
    }),

    ...buildConfigureTools(organizationId, conversationId),
    ...buildActionTools(profile, organizationId, conversationId),
    ...buildConfirmationTools(organizationId, profile.managerName, conversationId),
  ];
}

function buildAssistantInstructions(profile: Profile, managerName: string): string {
  return (
    `You are the admin assistant for ${profile.displayName}, an AI worker configured for this ` +
    `organization. You are talking to ${managerName}, the manager who runs this worker, not a customer.\n\n` +
    "You can do four things:\n" +
    "1. Answer questions - look up real conversations, summarize one by ticket number, search the " +
    "knowledge base, report the worker's current configuration. Nothing to confirm, just answer.\n" +
    "2. Draft - write a reply, a knowledge article, or an email when asked. This is just generation: " +
    "put the draft directly in your answer as normal text. Say plainly that the manager needs to send " +
    "or publish it themselves via Inbox/Knowledge for now - drafting does not save or send it anywhere. " +
    "Before stating any specific fact in a draft (a price, a discount, a policy, a deadline), search_knowledge " +
    "for it first. If nothing backs it up, do not invent a plausible-sounding number - either leave a clear " +
    "placeholder like [confirm the discount percentage] or ask the manager for the missing detail instead.\n" +
    "3. Configure - propose a change to the worker's role, tone, escalation terms, channels, or skills " +
    "with the matching propose_* tool. This only records the intent and describes it back; nothing is " +
    "applied.\n" +
    "4. Act - propose sending a real reply, changing a ticket's status, or publishing a knowledge " +
    "article, if those tools are available to you (they are turned off for some workers).\n\n" +
    "For 3 and 4: propose in one turn and STOP - do not call confirm_pending_change in that same " +
    "reply. Only call confirm_pending_change in a LATER turn, and only when the manager's new message " +
    "is a clear, explicit yes to what you just proposed. If they decline or change their mind, call " +
    "cancel_pending_change instead. Never guess at consent from silence or an unrelated reply. Never " +
    "tell the manager something was confirmed, applied, cancelled, or not changed unless you actually " +
    "called confirm_pending_change or cancel_pending_change in this same turn and are reporting its " +
    "real result - do not describe an outcome from memory alone.\n\n" +
    "Be concise and specific. When you report on conversations, cite ticket numbers. Never invent " +
    "data — if a tool returns nothing, say so rather than guessing."
  );
}

export interface AssistantAgentResult {
  answer: string;
}

function unavailableAssistantAnswer(reason: ModelUnavailabilityReason): AssistantAgentResult {
  const cause = reason === "demo_mode" ? "demo mode is on" : "no OPENAI_API_KEY configured";
  return {
    answer:
      `I can't reach the model right now (${cause}), so I can't look anything up. ` +
      "Try again once the assistant is fully configured.",
  };
}

export interface AssistantHistoryTurn {
  senderType: "manager" | "agent";
  senderName: string;
  body: string;
}

/**
 * How many of the most recent messages get replayed verbatim on every turn.
 * Anything older than this is folded into `conversations.summary` instead of
 * growing the input forever — smaller than Jules' 80-message window (40
 * turns) since this is a lower-volume, single-org admin surface, not a
 * multi-tenant sales tool; easy to raise later if real usage wants more.
 */
export const REPLAY_MESSAGE_LIMIT = 20;

/**
 * Folded into the input as plain text rather than replayed as SDK message
 * items — the agents SDK's own item shapes are meant to come back out of a
 * prior run, not be hand-authored per turn, and this worker's existing
 * customer-facing runAgent() does not carry history between turns at all.
 * `summary` (if any) stands in for everything older than the replay window.
 */
function buildInputWithHistory(
  history: AssistantHistoryTurn[],
  message: string,
  managerName: string,
  summary: string | null,
): string {
  const summaryBlock = summary ? `Summary of earlier parts of this conversation:\n${summary}\n\n` : "";
  if (history.length === 0) return summaryBlock + message;
  const transcript = history
    .map((turn) => `${turn.senderType === "manager" ? managerName : turn.senderName}: ${turn.body}`)
    .join("\n");
  return `${summaryBlock}Earlier in this conversation:\n${transcript}\n\n${managerName}: ${message}`;
}

/**
 * A rule stated once in a long system prompt is easy for the model to skip,
 * especially for a "decline" reply where nothing looks superficially wrong
 * with just acknowledging in text (testing found confirm calls the tool
 * reliably, cancel does not). Restating the live pending item right next to
 * the manager's actual message, every turn one exists, is a much stronger
 * nudge than instructions text alone.
 */
function buildPendingApprovalReminder(approval: ToolApproval): string {
  return (
    `There is a pending, unconfirmed action from earlier in this conversation: ` +
    `${describePendingChange(approval.toolId, approval.input)}. If the manager's message below is a clear ` +
    `yes, you MUST call confirm_pending_change before writing your reply. If it is a clear no, or they want ` +
    `something different, you MUST call cancel_pending_change before writing your reply - do not just ` +
    `describe either outcome in text without having actually called one of those tools this turn. If their ` +
    `message is unrelated to this pending action, ignore this note and answer normally; the pending action ` +
    `simply stays pending.\n\n`
  );
}

/**
 * Testing found the model reliably calls confirm_pending_change for a plain
 * "yes", but for a plain "no" it sometimes just replies as if it had
 * cancelled without calling cancel_pending_change - or, worse, called
 * confirm_pending_change instead, applying a change the manager had just
 * declined. That is not an acceptable failure mode for a real Tier 4 action,
 * so common, unambiguous replies are handled deterministically below instead
 * of trusting the model's tool choice. Only an exact match short-circuits the
 * model; anything else (including a nuanced or wordier reply) still goes to
 * the model as before, backed by buildPendingApprovalReminder above.
 */
const CONFIRM_EXACT_REPLIES = new Set([
  "yes", "yep", "yeah", "yup", "confirm", "confirmed", "confirm it", "sure", "ok", "okay",
  "do it", "go ahead", "yes do it", "yes go ahead", "yes please", "yes confirm", "please do",
  "approved", "yes send it", "yes publish it", "yes apply it",
]);
const CANCEL_EXACT_REPLIES = new Set([
  "no", "nope", "nah", "cancel", "cancel it", "cancel that", "no cancel that", "no cancel it",
  "actually no", "actually no cancel that", "never mind", "nevermind", "don't", "do not",
  "stop", "hold off", "wait", "skip it", "no thanks", "not now",
]);

/**
 * A second, looser tier for a longer decline that isn't one of the exact
 * phrasings above (e.g. "hold off on that for now, let me check with the
 * customer first") - checked only when nothing in it also reads as a
 * confirmation, so it only ever pushes an uncertain case toward the safer
 * "leave it pending/model decides" outcome, never away from one.
 */
const CANCEL_SUBSTRING_SIGNALS = [
  "hold off", "not right now", "not now", "let's not", "lets not", "don't do that",
  "do not do that", "not yet", "wait on that", "hang on", "skip that for now", "check with",
];
const CONFIRM_SUBSTRING_SIGNALS = ["yes", "confirm", "go ahead", "do it", "approve", "sounds good", "please do"];

function classifyPendingReply(message: string): "confirm" | "cancel" | null {
  const norm = message
    .trim()
    .toLowerCase()
    .replace(/^(actually|well),?\s*/i, "")
    .replace(/[,]/g, "")
    .replace(/[.!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (CONFIRM_EXACT_REPLIES.has(norm)) return "confirm";
  if (CANCEL_EXACT_REPLIES.has(norm)) return "cancel";

  const hasCancelSignal = CANCEL_SUBSTRING_SIGNALS.some((p) => norm.includes(p));
  const hasConfirmSignal = CONFIRM_SUBSTRING_SIGNALS.some((p) => norm.includes(p));
  if (hasCancelSignal && !hasConfirmSignal) return "cancel";
  return null;
}

export async function runAssistantAgent(
  profile: Profile,
  organizationId: string,
  conversationId: string,
  message: string,
  history: AssistantHistoryTurn[],
  summary: string | null,
): Promise<AssistantAgentResult> {
  const unavailable = modelUnavailabilityReason();
  if (unavailable) {
    return unavailableAssistantAnswer(unavailable);
  }

  const pending = await listPendingApprovals(organizationId, conversationId);
  const approval = pending[0];
  if (approval) {
    const decision = classifyPendingReply(message);
    if (decision === "confirm") {
      await decideApproval(approval.id, "approved", profile.managerName);
      try {
        const result = await applyPendingChange(organizationId, approval.toolId, approval.input);
        await recordApprovalResult(approval.id, result, null);
        if (result.error) return { answer: `Could not complete that: ${result.error}` };
        return { answer: `Done — ${describePendingChange(approval.toolId, approval.input)}.` };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "unknown error";
        await recordApprovalResult(approval.id, null, errorMessage);
        return { answer: `That failed: ${errorMessage}` };
      }
    }
    if (decision === "cancel") {
      await decideApproval(approval.id, "rejected", profile.managerName);
      return { answer: "Cancelled — nothing was changed." };
    }
  }

  const agent = new Agent({
    name: `${profile.displayName} Assistant`,
    instructions: buildAssistantInstructions(profile, profile.managerName),
    model: profile.model,
    tools: buildAssistantTools(profile, organizationId, conversationId),
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });

  const pendingReminder = approval ? buildPendingApprovalReminder(approval) : "";
  const input = pendingReminder + buildInputWithHistory(history, message, profile.managerName, summary);
  // profile.maxAgentTurns tunes the *customer-facing* agent, which is
  // usually one tool call at most. This agent routinely needs several
  // (read a ticket, then propose a change, then synthesize the reply) - a
  // propose-then-confirm turn alone is 2-3 steps before the final answer,
  // so the same low default trips MaxTurnsExceededError. Floor it higher
  // rather than inherit the tighter number.
  const result = await runTracedAgent(
    ASSISTANT_CHAT_WORKFLOW,
    { organizationId, conversationId },
    agent,
    input,
    { maxTurns: Math.max(8, profile.maxAgentTurns || 3) },
  );

  const text = typeof result.finalOutput === "string" ? result.finalOutput : String(result.finalOutput ?? "");
  return { answer: text.trim() };
}

/**
 * A short, human-readable title for a brand-new conversation, generated once
 * from the manager's opening message - same one-shot Agent + run(...,
 * {maxTurns:1}) shape as maybeRefreshAssistantSummary. Falls back to a plain
 * truncation in demo mode / without an API key, or if the model call fails,
 * so conversation creation never depends on this succeeding.
 */
export async function generateAssistantTitle(profile: Profile, message: string): Promise<string> {
  const fallback = message.slice(0, 120);
  if (modelUnavailabilityReason()) return fallback;

  const titler = new Agent({
    name: "Assistant conversation titler",
    instructions:
      "Write a short title (3-6 words) summarizing what this conversation is about, based on the " +
      "manager's opening message. Sentence case, no ending punctuation, no quotes, no filler words.",
    model: profile.model,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });

  try {
    const result = await run(titler, message, { maxTurns: 1 });
    const text = typeof result.finalOutput === "string" ? result.finalOutput : String(result.finalOutput ?? "");
    const title = text.trim().replace(/^["']|["']$/g, "");
    return title || fallback;
  } catch {
    return fallback;
  }
}

export interface AssistantSummaryState {
  summary: string | null;
  summarizedMessageCount: number;
}

/**
 * Rolling summarization: once a conversation has more messages than the
 * replay window, fold the newly-old batch (everything between the last
 * watermark and the new window boundary) into the existing summary, one
 * model call, and advance the watermark. Adapted from Jules'
 * summary_through_sequence_index, using a plain message count instead of a
 * dedicated sequence column — this conversation model orders by timestamp
 * already, so a count-based watermark is enough.
 *
 * Returns the unchanged state if there's nothing new to fold in yet, or if
 * summarization can't run (demo mode / no key) — the replay window alone
 * still bounds cost in that case, just without the older context.
 */
export async function maybeRefreshAssistantSummary(
  profile: Profile,
  current: AssistantSummaryState,
  allMessages: AssistantHistoryTurn[],
): Promise<AssistantSummaryState> {
  const newBoundary = allMessages.length - REPLAY_MESSAGE_LIMIT;
  if (newBoundary <= current.summarizedMessageCount) return current;
  if (modelUnavailabilityReason()) return current;

  const batch = allMessages.slice(current.summarizedMessageCount, newBoundary);
  const batchText = batch
    .map((m) => `${m.senderType === "manager" ? profile.managerName : m.senderName}: ${m.body}`)
    .join("\n");

  const summarizer = new Agent({
    name: "Assistant conversation summarizer",
    instructions:
      "Merge the existing summary (if any) with the new messages into one updated summary of this " +
      "conversation between an admin assistant and a manager. Be factual and concise - a few sentences " +
      "to a short paragraph. Preserve specific facts (ticket numbers, names, decisions) a later turn " +
      "might need; drop pleasantries.",
    model: profile.model,
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });

  const input = current.summary
    ? `Existing summary:\n${current.summary}\n\nNew messages to fold in:\n${batchText}`
    : `Messages to summarize:\n${batchText}`;

  try {
    const result = await run(summarizer, input, { maxTurns: 1 });
    const text = typeof result.finalOutput === "string" ? result.finalOutput : String(result.finalOutput ?? "");
    if (!text.trim()) return current;
    return { summary: text.trim(), summarizedMessageCount: newBoundary };
  } catch {
    // A failed summarization pass shouldn't break the chat turn that
    // triggered it - the replay window still caps cost either way, this
    // conversation just keeps less older context until the next attempt.
    return current;
  }
}
