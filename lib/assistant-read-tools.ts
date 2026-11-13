import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/db/schema";
import { getOrCreateProfile } from "@/lib/bootstrap";
import { listCannedReplies } from "@/lib/canned-replies";
import { featureEnabled } from "@/lib/features";
import { listChanges } from "@/lib/change-log";
import { enabledEvalCases, listEvalCases } from "@/lib/eval-cases";
import { listEvalRuns } from "@/lib/eval-replay";
import { listManagers } from "@/lib/managers";
import type { OverviewPeriod } from "@/lib/overview";
import { groupReviewItems, loadReviewItems } from "@/lib/review-queue";
import type { QueueId } from "@/lib/tickets";

/**
 * Read-only lookups for the pages the Assistant had no way to see: Overview,
 * Tickets, the review queue, canned replies, test cases, recent changes and
 * the human managers. They return plain text for the model to answer from
 * (no cards), and none of them changes anything.
 *
 * INTERNAL_CONVERSATION_CHANNELS lives in assistant-agent.ts, which imports
 * this file, and overview.ts and tickets.ts import assistant-agent in turn, so
 * the channel list is repeated here and those two are loaded when a tool runs,
 * not when the module loads.
 */
const INTERNAL_CHANNELS = ["chat", "assistant", "eval"];

function clip(text: string | null | undefined, max: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}...` : flat;
}

const pct = (value: number | null | undefined) => (value == null ? "n/a" : `${Math.round(value * 100)}%`);

/**
 * A few lines on what is going on right now, put in the Assistant's prompt
 * every turn so it starts out knowing the state of the queue and the last
 * test score instead of having to ask itself. Never throws: a failed lookup
 * leaves the line out rather than breaking the chat.
 */
export async function buildSituationBrief(organizationId: string): Promise<string> {
  const lines: string[] = [];
  try {
    const rows = await db
      .select({ status: conversations.status, count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(
        and(
          eq(conversations.organizationId, organizationId),
          notInArray(conversations.channel, INTERNAL_CHANNELS),
          eq(conversations.archived, false),
          inArray(conversations.status, ["open", "needs_human"]),
        ),
      )
      .groupBy(conversations.status);
    const open = rows.find((row) => row.status === "open")?.count ?? 0;
    const waiting = rows.find((row) => row.status === "needs_human")?.count ?? 0;
    lines.push(`Customer conversations right now: ${open} open with the worker, ${waiting} waiting for a person.`);
  } catch {
    /* leave it out */
  }
  try {
    const [run] = await listEvalRuns(organizationId, 1);
    if (run?.status === "done") {
      lines.push(`Last test replay: ${run.passed} of ${run.total} passed (${pct(run.score)}).`);
    }
  } catch {
    /* leave it out */
  }
  return lines.length ? `Right now (live, as of this message):\n- ${lines.join("\n- ")}\n\n` : "";
}

export function buildAssistantReadTools(organizationId: string): Tool[] {
  return [
    tool({
      name: "get_overview",
      description:
        "The numbers on the Overview page for a period: conversations by channel, how many the worker answered " +
        "alone vs handed over, tickets raised, what is waiting for a person now, the most-cited articles, and the " +
        "manager ratings of replies. Use it for 'how is it going', 'how many did it handle', 'what does it get " +
        "asked most'. Read-only.",
      parameters: z.object({
        period: z.enum(["24h", "7d", "30d"]).describe("The window: the last 24 hours, 7 days or 30 days"),
      }),
      execute: async ({ period }) => {
        const { computeOverview } = await import("@/lib/overview");
        const profile = await getOrCreateProfile(organizationId);
        const o = await computeOverview({
          organizationId,
          period: period as OverviewPeriod,
          firstReplyTargetHours: profile.firstReplyTargetHours ?? null,
        });
        const days = { "24h": 1, "7d": 7, "30d": 30 }[period];
        const channels = Object.entries(o.conversations.byChannel)
          .map(([name, count]) => `${name} ${count}`)
          .join(", ");
        const lines = [
          `Overview, last ${days} day${days === 1 ? "" : "s"}:`,
          `- ${o.conversations.total} conversations${channels ? ` (${channels})` : ""}`,
          `- ${o.answeredByWorker} answered by the worker alone, ${o.handedOver} handed to a person`,
          `- ${o.waitingNow} waiting for a person right now`,
          `- ${o.tickets.raised} helpdesk tickets raised${o.tickets.helpdesk ? ` (project ${o.tickets.helpdesk.project})` : " (no helpdesk connected)"}`,
          `- Status: ${o.byStatus.map((s) => `${s.status} ${s.count}`).join(", ")}`,
        ];
        const types = o.tickets.byType.filter((t) => t.count > 0);
        if (types.length) lines.push(`- Ticket request types: ${types.map((t) => `${t.name} ${t.count}`).join(", ")}`);
        if (o.handedOverTopics.length) lines.push(`- Recently handed over about: ${o.handedOverTopics.slice(0, 8).map((t) => clip(t, 60)).join("; ")}`);
        if (o.topSources.length) lines.push(`- Most-cited sources: ${o.topSources.slice(0, 5).map((s) => `${clip(s.title, 60)} (${s.count})`).join("; ")}`);
        lines.push(`- Manager ratings: ${JSON.stringify(o.quality)}`);
        return lines.join("\n");
      },
    }),

    tool({
      name: "get_tickets",
      description:
        "The Tickets page: the queue counts (all open, needs a person, with the worker, with a person, closed) and " +
        "the tickets in one queue with who has each, its request type, priority and helpdesk key. The worker's own " +
        "ticket numbers look like #1023. Use it for 'what is in the queue', 'which tickets are with a person', " +
        "'which ticket failed to reach Jira'. Read-only; for a ticket's messages use summarize_conversation.",
      parameters: z.object({
        queue: z.enum(["all_open", "needs_human", "worker", "human", "closed"]).describe("Which queue to list"),
        limit: z.number().min(1).max(40).describe("How many tickets to list (up to 40)"),
      }),
      execute: async ({ queue, limit }) => {
        const { computeTickets } = await import("@/lib/tickets");
        const payload = await computeTickets({ organizationId });
        const { queues, kpis } = payload;
        const header =
          `Queues: all open ${queues.all_open}, needs a person ${queues.needs_human}, with the worker ${queues.worker}, ` +
          `with a person ${queues.human}, closed ${queues.closed}. ` +
          `Worker handled ${kpis.workerHandledToday} alone and raised ${kpis.raisedToday} tickets in the last 24 hours.` +
          (payload.helpdesk ? ` Helpdesk project: ${payload.helpdesk.project}.` : " No helpdesk connected.");
        const wanted = queue as QueueId;
        const rows = payload.tickets
          .filter((t) => {
            const closed = t.status === "resolved" || t.status === "closed";
            if (wanted === "closed") return closed;
            if (closed) return false;
            if (wanted === "needs_human") return t.status === "needs_human";
            if (wanted === "worker") return t.handler === "worker";
            if (wanted === "human") return t.handler === "human";
            return true;
          })
          .slice(0, limit);
        if (rows.length === 0) return `${header}\n\nNo tickets in that queue.`;
        return (
          `${header}\n\n${rows.length} ticket(s) in ${wanted}:\n` +
          rows
            .map(
              (t) =>
                `#${t.ticketNumber} [${t.status}, with ${t.handler}${t.priority ? `, ${t.priority}` : ""}] ` +
                `${t.customerName}: ${clip(t.subject, 80) || "(no subject)"} (${t.channel}` +
                `${t.requestType ? `, ${t.requestType}` : ""}${t.externalTicketKey ? `, ${t.externalTicketKey}` : ""}` +
                `${t.externalTicketError ? ", helpdesk error" : ""}, updated ${t.updatedAt})`,
            )
            .join("\n")
        );
      },
    }),

    tool({
      name: "get_review_queue",
      description:
        "What the worker got wrong or could not answer lately, grouped by topic: replies a manager rated badly, " +
        "questions with no knowledge article behind them, and answers the team gave by hand. Use it for 'what " +
        "should I fix', 'what is it missing', 'which questions have no article'. Read-only.",
      parameters: z.object({
        groups: z.number().min(1).max(10).describe("How many topic groups to return (up to 10)"),
      }),
      execute: async ({ groups }) => {
        const items = await loadReviewItems(organizationId);
        if (items.length === 0) return "The review queue is empty: nothing rated badly, no unanswered questions, no team answers to learn from.";
        const grouped = groupReviewItems(items).slice(0, groups);
        return (
          `${items.length} item(s) in the last 60 days, in ${grouped.length} group(s) shown:\n` +
          grouped
            .map((g) => {
              const kinds = Object.entries(g.kinds)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${k.replace(/_/g, " ")} ${n}`)
                .join(", ");
              const sample = g.items[0];
              return (
                `- "${g.topic}": ${g.count} (${kinds}). e.g. #${sample.ticketNumber} asked "${clip(sample.question, 120)}"` +
                `${sample.correction ? `; the manager said it should be "${clip(sample.correction, 120)}"` : ""}`
              );
            })
            .join("\n")
        );
      },
    }),

    ...(featureEnabled("cannedReplies")
      ? [
    tool({
      name: "list_canned_replies",
      description:
        "The approved wording the worker leads with when a customer message matches (Settings > Canned replies): " +
        "each one's title, when it applies, and the reply. Read-only.",
      parameters: z.object({}),
      execute: async () => {
        const replies = await listCannedReplies(organizationId);
        if (replies.length === 0) return "No canned replies yet.";
        return replies
          .map((r) => `- ${r.title} (when: ${clip(r.situation, 120)}) -> ${clip(r.reply, 200)}`)
          .join("\n");
      },
    })
      ]
      : []),

    ...(featureEnabled("testCases")
      ? [
    tool({
      name: "get_test_cases",
      description:
        "The saved test questions (Settings > Test cases) and how the latest replays scored. A replay asks every " +
        "enabled case through the real worker and scores the answers against what a good answer says. Use it for " +
        "'how is it testing', 'did my last change help', 'which cases fail'. Read-only.",
      parameters: z.object({}),
      execute: async () => {
        const [cases, enabled, runs] = await Promise.all([
          listEvalCases(organizationId),
          enabledEvalCases(organizationId),
          listEvalRuns(organizationId, 5),
        ]);
        const lines = [`${cases.length} test case(s), ${enabled.length} enabled.`];
        if (runs.length === 0) lines.push("No replay has been run yet.");
        for (const run of runs) {
          lines.push(`- Replay ${run.startedAt.toISOString()}: ${run.status}${run.status === "done" ? `, ${run.passed} of ${run.total} passed (${pct(run.score)})` : ""}${run.error ? `, error: ${clip(run.error, 120)}` : ""}`);
        }
        const latest = runs.find((run) => run.status === "done");
        const failed = ((latest?.results ?? []) as { question?: string; pass?: boolean; reason?: string }[]).filter((r) => r.pass === false);
        if (failed.length) {
          lines.push(`Failed in the latest finished replay:`);
          for (const f of failed.slice(0, 10)) lines.push(`  - "${clip(f.question, 120)}": ${clip(f.reason, 160)}`);
        }
        return lines.join("\n");
      },
    })
      ]
      : []),

    tool({
      name: "get_recent_changes",
      description:
        "The latest changes made to the worker's setup (who changed what, and the test score before and after, " +
        "when a replay ran). Use it for 'what changed', 'who changed the tone', 'did something break after the " +
        "last edit'. Read-only.",
      parameters: z.object({ limit: z.number().min(1).max(20).describe("How many recent changes (up to 20)") }),
      execute: async ({ limit }) => {
        const changes = await listChanges(organizationId, limit);
        if (changes.length === 0) return "No changes recorded yet.";
        return changes
          .map(
            (c) =>
              `- ${c.createdAt.toISOString()} ${c.toolId.replace(/^assistant_/, "").replace(/_/g, " ")} by ${c.appliedBy}` +
              `${c.scoreBefore != null ? `; test score ${pct(c.scoreBefore)} -> ${c.scoreAfter != null ? pct(c.scoreAfter) : c.runStatus ?? "no run"}` : ""}`,
          )
          .join("\n");
      },
    }),

    tool({
      name: "list_human_managers",
      description:
        "The people the worker hands conversations to (Settings > Human manager): name, email, which areas each " +
        "covers, and whether they are enabled. Read-only.",
      parameters: z.object({}),
      execute: async () => {
        const managers = await listManagers(organizationId);
        if (managers.length === 0) return "No extra human managers are set up; handoffs go to the manager contact on the profile.";
        return managers
          .map((m) => `- ${m.name} <${m.email}>${m.enabled ? "" : " (off)"}${m.areas ? `, covers: ${clip(m.areas, 120)}` : ""}`)
          .join("\n");
      },
    }),
  ];
}
