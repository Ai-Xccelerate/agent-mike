import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { workerProfiles } from "@/db/schema";
import { knowledgeDocuments, organizations } from "@/db/schema";
import { db } from "@/lib/db";
import { ensureOrganization } from "@/lib/bootstrap";
import { buildAssistantTools, SHOW_DRAFT_TOOL_NAME } from "@/lib/assistant-agent";
import { configAuditCard, isAssistantCard, makeCard, type AssistantCard } from "@/lib/assistant-cards";
import { describeCards } from "@/lib/assistant-turn";

type Profile = typeof workerProfiles.$inferSelect;

async function invokeTool(tools: unknown[], name: string, input: Record<string, unknown>): Promise<string> {
  const found = tools.find((tool) => (tool as { name?: string }).name === name) as
    | { invoke: (context: unknown, raw: string) => Promise<string> }
    | undefined;
  if (!found) throw new Error(`${name} tool not found`);
  return found.invoke(undefined, JSON.stringify(input));
}

describe("read tools show a card only when asked to", () => {
  let orgId: string;

  beforeEach(async () => {
    orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Assistant cards test");
    await db.insert(knowledgeDocuments).values([
      { organizationId: orgId, conceptId: "refund-policy", title: "Refund policy", body: "# Refund policy\nThirty days.", checksum: "a" },
      { organizationId: orgId, conceptId: "shipping", title: "Shipping", body: "# Shipping\nTwo days.", checksum: "b" },
    ]);
  });

  afterEach(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  function toolsCollecting(cards: AssistantCard[]) {
    const profile = { organizationId: orgId, displayName: "Mike", managerName: "Charan" } as Profile;
    return buildAssistantTools(profile, orgId, crypto.randomUUID(), { readOnly: true, onCard: (card) => cards.push(card) });
  }

  it("emits a knowledge_list card for show: true", async () => {
    const cards: AssistantCard[] = [];
    const text = await invokeTool(toolsCollecting(cards), "list_knowledge_documents", { titleContains: "refund", show: true });
    expect(text).toContain("Refund policy");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "knowledge_list",
      data: { titleContains: "refund", matchedFilter: true, total: 1, articles: [{ conceptId: "refund-policy", title: "Refund policy" }] },
    });
  });

  it("lists every article when the filter misses, and says so", async () => {
    const cards: AssistantCard[] = [];
    await invokeTool(toolsCollecting(cards), "list_knowledge_documents", { titleContains: "returns", show: true });
    expect(cards[0]).toMatchObject({ kind: "knowledge_list", data: { matchedFilter: false, total: 2 } });
  });

  it("emits nothing for a lookup the model makes for its own context", async () => {
    const cards: AssistantCard[] = [];
    const text = await invokeTool(toolsCollecting(cards), "list_knowledge_documents", { titleContains: null, show: false });
    expect(text).toContain("2 article(s)");
    expect(cards).toHaveLength(0);
  });

  it("shows a draft as a card, even for a read-only member", async () => {
    const cards: AssistantCard[] = [];
    const text = await invokeTool(toolsCollecting(cards), SHOW_DRAFT_TOOL_NAME, {
      format: "chat",
      ticketNumber: null,
      subject: null,
      body: "Thanks for waiting. Your refund is on its way.",
    });
    expect(text).toContain("Don't repeat it");
    expect(cards[0]).toMatchObject({
      kind: "draft",
      data: { format: "chat", ticketNumber: null, conversationId: null, body: "Thanks for waiting. Your refund is on its way." },
    });
  });
});

describe("card helpers", () => {
  it("takes internal tool names out of audit fixes", () => {
    const card = configAuditCard([
      { severity: "blocker", area: "Role", issue: "Default role.", fix: "I can propose a role (propose_role_change) if you tell me what it handles." },
      { severity: "tip", area: "Skills", fix: "Connect Jira, or I can propose turning the skill off (propose_skill_change).", issue: "Inactive." },
    ]);
    expect(card.kind).toBe("config_audit");
    const fixes = card.kind === "config_audit" ? card.data.findings.map((finding) => finding.fix) : [];
    expect(fixes).toEqual([
      "I can propose a role if you tell me what it handles.",
      "Connect Jira, or I can propose turning the skill off.",
    ]);
  });

  it("describes cards for the model's history, including a draft's text", () => {
    const text = describeCards([
      makeCard("ticket_list", {
        filter: { status: null, sinceDays: null },
        tickets: [
          { conversationId: "a", ticketNumber: 1042, customerName: "Ana", subject: null, status: "open", priority: "normal", channel: "email", updatedAt: "" },
        ],
      }),
      makeCard("draft", { format: "email", ticketNumber: 1042, conversationId: "a", subject: "Re: refund", body: "Hi Ana," }),
    ]);
    expect(text).toContain("#1042");
    expect(text).toContain("Hi Ana,");
  });

  it("recognizes stored cards and rejects anything else", () => {
    expect(isAssistantCard(makeCard("panel", { panel: "skills" }))).toBe(true);
    expect(isAssistantCard({ id: "x", kind: "chart", data: {} })).toBe(false);
    expect(isAssistantCard("panel")).toBe(false);
  });
});
