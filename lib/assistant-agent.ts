import { Agent, run, tool } from "@openai/agents";
import type { Tool } from "@openai/agents";
import { z } from "zod";
import { and, desc, eq, gte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { retrieveKnowledge } from "@/lib/retrieval";
import { isDemoMode } from "@/lib/env";
import type { workerProfiles } from "@/db/schema";

/**
 * The manager's own conversations with this admin assistant never count as
 * "real" traffic for its own tools to report on — same reasoning as Inbox
 * excluding Playground's test conversations, just applied to a second
 * internal-only channel.
 */
export const INTERNAL_CONVERSATION_CHANNELS = ["chat", "assistant"] as const;

type Profile = typeof workerProfiles.$inferSelect;

/**
 * Tier 1 only: every tool here reads the organization's own data and writes
 * nothing. Configure (Tier 3) and Act (Tier 4) are a later pass — see the
 * Admin Assistant Chat plan doc.
 */
function buildAssistantTools(profile: Profile, organizationId: string): Tool[] {
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
  ];
}

function buildAssistantInstructions(profile: Profile, managerName: string): string {
  return (
    `You are the admin assistant for ${profile.displayName}, an AI worker configured for this ` +
    `organization. You are talking to ${managerName}, the manager who runs this worker, not a customer.\n\n` +
    "Your job right now is narrow: answer questions and summarize using the tools available to you. " +
    "You can look up real conversations, summarize a specific one by ticket number, search the " +
    "knowledge base, and report the worker's current configuration. You cannot change any settings, " +
    "draft or send anything, or take any action yet — if asked to do one of those, say plainly that " +
    "you can only answer questions for now and that capability is coming later.\n\n" +
    "Be concise and specific. When you report on conversations, cite ticket numbers. Never invent " +
    "data — if a tool returns nothing, say so rather than guessing."
  );
}

export interface AssistantAgentResult {
  answer: string;
}

function demoAssistantAnswer(): AssistantAgentResult {
  return {
    answer:
      "I can't reach the model right now (no OPENAI_API_KEY configured), so I can't look anything up. " +
      "Try again once the assistant is fully configured.",
  };
}

export interface AssistantHistoryTurn {
  senderType: "manager" | "agent";
  senderName: string;
  body: string;
}

/**
 * Folded into the input as plain text rather than replayed as SDK message
 * items — the agents SDK's own item shapes are meant to come back out of a
 * prior run, not be hand-authored per turn, and this worker's existing
 * customer-facing runAgent() does not carry history between turns at all.
 * A short prior-turns preamble is enough for "summarize that ticket, then
 * ask a follow-up" without taking on RunState persistence.
 */
function buildInputWithHistory(history: AssistantHistoryTurn[], message: string, managerName: string): string {
  if (history.length === 0) return message;
  const transcript = history
    .map((turn) => `${turn.senderType === "manager" ? managerName : turn.senderName}: ${turn.body}`)
    .join("\n");
  return `Earlier in this conversation:\n${transcript}\n\n${managerName}: ${message}`;
}

export async function runAssistantAgent(
  profile: Profile,
  organizationId: string,
  message: string,
  history: AssistantHistoryTurn[],
): Promise<AssistantAgentResult> {
  if (isDemoMode() || !process.env.OPENAI_API_KEY) {
    return demoAssistantAnswer();
  }

  const agent = new Agent({
    name: `${profile.displayName} Assistant`,
    instructions: buildAssistantInstructions(profile, profile.managerName),
    model: profile.model,
    tools: buildAssistantTools(profile, organizationId),
    modelSettings: { reasoning: { effort: "none" }, text: { verbosity: "low" } },
  });

  const input = buildInputWithHistory(history, message, profile.managerName);
  const result = await run(agent, input, { maxTurns: Math.max(1, profile.maxAgentTurns || 3) });

  const text = typeof result.finalOutput === "string" ? result.finalOutput : String(result.finalOutput ?? "");
  return { answer: text.trim() };
}
