import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { conversations, messages } from "@/db/schema";
import { runAgent } from "@/lib/agent";
import { sendEmail } from "@/lib/agentmail";
import { nextTicketNumber } from "@/lib/conversations";
import { db } from "@/lib/db";
import { json, withTenant } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { applyOutcome, serializeMessage, ticketRef } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withTenant(
    req,
    async (tenant) => {
      const payload = (await req.json()) as {
        message?: string;
        conversation_id?: string;
        customer_name?: string;
        customer_email?: string | null;
      };
      const text = (payload.message || "").trim();
      if (!text) return json({ error: "message is required" }, 422);

      const profile = await getProfile(tenant.orgId);
      const customerName = payload.customer_name || "Website visitor";
      let conversation = payload.conversation_id
        ? (
            await db
              .select()
              .from(conversations)
              .where(
                and(
                  eq(conversations.id, payload.conversation_id),
                  eq(conversations.organizationId, tenant.orgId),
                ),
              )
              .limit(1)
          )[0]
        : undefined;

      const history = conversation
        ? await db.select().from(messages).where(eq(messages.conversationId, conversation.id))
        : [];

      if (!conversation) {
        const [created] = await db
          .insert(conversations)
          .values({
            id: randomUUID(),
            organizationId: tenant.orgId,
            channel: "chat",
            customerName,
            customerEmail: payload.customer_email || null,
            subject: text.slice(0, 90),
            ticketNumber: await nextTicketNumber(tenant.orgId),
          })
          .returning();
        conversation = created;
      }

      await db.insert(messages).values({
        id: randomUUID(),
        conversationId: conversation.id,
        senderType: "customer",
        senderName: customerName,
        body: text,
      });

      const answer = await runAgent(
        tenant.orgId,
        profile,
        text,
        history.map((item) => ({ senderType: item.senderType, body: item.body })),
      );

      const [mikeMessage] = await db
        .insert(messages)
        .values({
          id: randomUUID(),
          conversationId: conversation.id,
          senderType: "agent",
          senderName: profile.displayName,
          body: answer.text,
          citations: answer.citations,
          metadata: { confidence: answer.confidence, reason: answer.reason },
        })
        .returning();

      const outcome = applyOutcome(conversation, profile, answer);
      await db
        .update(conversations)
        .set({
          ...outcome,
          confidence: answer.confidence,
          summary: text.slice(0, 240),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));

      if (answer.escalated && profile.managerEmail) {
        try {
          const [fresh] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, conversation.id))
            .limit(1);
          const ref = ticketRef(fresh);
          const who = fresh.customerEmail
            ? `${fresh.customerName} <${fresh.customerEmail}>`
            : fresh.customerName;
          await sendEmail(
            profile.managerEmail,
            `[Escalation ${ref}] ${fresh.subject.slice(0, 60)}`,
            [
              "Agent Mike escalated a support conversation and needs a human to respond.",
              "",
              `**Ticket:** ${ref}`,
              `**Reference ID:** ${fresh.id}`,
              `**Channel:** ${fresh.channel}`,
              `**Customer:** ${who}`,
              `**Reason:** ${answer.reason || "Escalation"}`,
              "",
              "**Customer's message:**",
              text,
              "",
              "**Mike's reply to the customer:**",
              answer.text,
              "",
              `Please review and respond on ticket ${ref}.`,
            ].join("\n"),
          );
        } catch (err) {
          console.warn("[chat] manager notification failed", err);
        }
      }

      return json({
        conversation_id: conversation.id,
        message: serializeMessage(mikeMessage),
        status: outcome.status,
        confidence: answer.confidence,
        escalated: answer.escalated,
      });
    },
    "widget",
  );
}
