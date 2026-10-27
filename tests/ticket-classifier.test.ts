import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, workerProfiles } from "@/db/schema";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { classifyConversation, summarizeForHandoff, validateClassification } from "@/lib/ticket-classifier";
import { DEFAULT_TICKET_SCHEMA, resolveTicketSchema, ticketSchemaPatch } from "@/lib/ticket-schema";
import { helpdeskBreakdownSource } from "@/lib/tools-integrations/atlassian";
import { applyWorkerPatch } from "@/lib/worker-settings";

const runMock = vi.hoisted(() => vi.fn());
const runAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@openai/agents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@openai/agents")>()),
  run: runMock,
}));
vi.mock("@/lib/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent")>()),
  runAgent: runAgentMock,
}));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_profile: unknown, current: unknown) => current),
}));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskBreakdownSource: vi.fn(),
  recordHandoffInJira: vi.fn(async () => null),
}));
vi.mock("@/lib/handoff-notify", () => ({ notifyManager: vi.fn(async () => undefined) }));

const sourceMock = vi.mocked(helpdeskBreakdownSource);
const turns = [
  { speaker: "Website visitor", body: "Nobody in our office can log in since 9am" },
  { speaker: "Eva", body: "I am sorry, checking now" },
];
const chosen = (value: { requestType?: string | null; tier?: string | null; labels?: string[] }) =>
  runMock.mockResolvedValue({ finalOutput: { requestType: null, tier: null, labels: [], ...value } });

let orgId: string;
const savedEnv = { demo: process.env.DEMO_MODE, key: process.env.OPENAI_API_KEY };

async function conversation(values: Partial<typeof conversations.$inferInsert> = {}) {
  return insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerName: "Dana", ...values });
}
async function reload(id: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
  return row;
}
async function classify(row: Awaited<ReturnType<typeof conversation>>, handedOverNow = false) {
  const profile = await getOrCreateProfile(orgId);
  return classifyConversation({ organizationId: orgId, profile, conversation: row, transcript: turns, handedOverNow });
}

beforeEach(async () => {
  process.env.DEMO_MODE = "false";
  process.env.OPENAI_API_KEY = "test-key";
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Classifier org");
  runMock.mockReset();
  runAgentMock.mockReset();
  sourceMock.mockReset();
  sourceMock.mockResolvedValue(null);
});

afterEach(() => {
  if (savedEnv.demo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = savedEnv.demo;
  if (savedEnv.key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedEnv.key;
});

describe("validateClassification", () => {
  it("keeps only the worker's own words, spelled the way its list spells them", () => {
    const result = validateClassification(
      { requestType: "problem", tier: "TIER 2", labels: ["Urgent", "made-up", "urgent", "BILLING"] },
      DEFAULT_TICKET_SCHEMA,
      true,
    );
    expect(result).toEqual({ requestType: "Problem", tier: "Tier 2", labels: ["urgent", "billing"], summary: null });
  });

  it("drops a request type or tier the worker does not have, and ignores the request type when a helpdesk chooses it", () => {
    expect(validateClassification({ requestType: "Alien", tier: "Tier 9", labels: [] }, DEFAULT_TICKET_SCHEMA, true)).toEqual({
      summary: null,
      requestType: null,
      tier: null,
      labels: [],
    });
    expect(validateClassification({ requestType: "Problem", tier: "Tier 1", labels: [] }, DEFAULT_TICKET_SCHEMA, false).requestType).toBeNull();
  });
});

describe("ticket schema", () => {
  it("falls back to the defaults for anything the worker has not set", () => {
    expect(resolveTicketSchema(null)).toEqual(DEFAULT_TICKET_SCHEMA);
    expect(resolveTicketSchema({ labels: [] }).labels).toEqual([]);
    expect(resolveTicketSchema({ requestTypes: ["Bug"] }).requestTypes).toEqual(["Bug"]);
  });

  it("refuses blanks, duplicates, an empty tier list and too many entries", () => {
    const ok = { requestTypes: ["Bug"], tiers: ["L1"], labels: [] };
    expect(ticketSchemaPatch.safeParse(ok).success).toBe(true);
    expect(ticketSchemaPatch.safeParse(null).success).toBe(true);
    expect(ticketSchemaPatch.safeParse({ ...ok, labels: [" "] }).success).toBe(false);
    expect(ticketSchemaPatch.safeParse({ ...ok, labels: ["a", "A"] }).success).toBe(false);
    expect(ticketSchemaPatch.safeParse({ ...ok, tiers: [] }).success).toBe(false);
    expect(ticketSchemaPatch.safeParse({ ...ok, requestTypes: [] }).success).toBe(false);
    expect(ticketSchemaPatch.safeParse({ ...ok, labels: Array.from({ length: 31 }, (_, i) => `l${i}`) }).success).toBe(false);
    expect(ticketSchemaPatch.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it("is saved and cleared through the worker settings", async () => {
    const saved = await applyWorkerPatch(orgId, { ticketSchema: { requestTypes: ["Bug"], tiers: ["L1", "L2"], labels: ["vip"] } });
    expect(saved.ok && saved.profile.ticketSchema).toEqual({ requestTypes: ["Bug"], tiers: ["L1", "L2"], labels: ["vip"] });
    const rejected = await applyWorkerPatch(orgId, { ticketSchema: { requestTypes: [], tiers: ["L1"], labels: [] } });
    expect(rejected.ok).toBe(false);
    const cleared = await applyWorkerPatch(orgId, { ticketSchema: null });
    expect(cleared.ok && cleared.profile.ticketSchema).toBeNull();
  });
});

describe("classifyConversation", () => {
  it("sets request type, tier and labels from the worker's lists, marks them as the worker's, and leaves updatedAt alone", async () => {
    chosen({ requestType: "Problem", tier: "Tier 2", labels: ["urgent", "outage", "invented"] });
    const row = await conversation();
    const result = await classify(row);
    expect(result.done).toBe(true);
    const after = await reload(row.id);
    expect(after).toMatchObject({ requestType: "Problem", tier: "Tier 2", labels: ["urgent", "outage"], classificationSource: "worker" });
    expect(after.updatedAt.getTime()).toBe(row.updatedAt.getTime());
  });

  it("uses a worker's own vocabulary instead of the defaults", async () => {
    await applyWorkerPatch(orgId, { ticketSchema: { requestTypes: ["Feature idea", "Bug"], tiers: ["L1", "L2"], labels: ["vip"] } });
    chosen({ requestType: "Bug", tier: "L2", labels: ["vip", "urgent"] });
    const row = await conversation();
    await classify(row);
    expect(await reload(row.id)).toMatchObject({ requestType: "Bug", tier: "L2", labels: ["vip"] });
    // The model was told only the worker's own lists.
    const instructions = String((runMock.mock.calls[0][0] as { instructions: string }).instructions);
    expect(instructions).toContain("- Feature idea");
    expect(instructions).not.toContain("- Question");
  });

  it("chooses the request type from the helpdesk's own list when one is connected, so a how-to is a general question", async () => {
    sourceMock.mockResolvedValue({
      project: "EAPR",
      types: ["Report a Bug", "System Unavailable", "General Questions", "Request a New Feature"],
      priorities: ["High"],
    });
    chosen({ requestType: "general questions", tier: "Tier 1", labels: ["bug"] });
    const row = await conversation();
    await classify(row);
    expect(await reload(row.id)).toMatchObject({ requestType: "General Questions", tier: "Tier 1", labels: ["bug"], classificationSource: "worker" });
    const instructions = String((runMock.mock.calls[0][0] as { instructions: string }).instructions);
    expect(instructions).toContain("- General Questions");
    expect(instructions).toContain("- System Unavailable");
    // The worker's own default list is not offered alongside the desk's.
    expect(instructions).not.toContain("- Feedback");
  });

  it("drops a request type the helpdesk does not have", async () => {
    sourceMock.mockResolvedValue({ project: "EAPR", types: ["Report a Bug", "General Questions"], priorities: [] });
    chosen({ requestType: "Question", tier: "Tier 1" });
    const row = await conversation();
    await classify(row);
    expect(await reload(row.id)).toMatchObject({ requestType: null, tier: "Tier 1" });
  });

  it("leaves the request type unset when the desk files everything as one issue type", async () => {
    sourceMock.mockResolvedValue({ project: "SUP", types: ["[System] Service request"], priorities: [] });
    chosen({ requestType: "[System] Service request", tier: "Tier 2", labels: ["urgent"] });
    const row = await conversation();
    await classify(row);
    expect(await reload(row.id)).toMatchObject({ requestType: null, tier: "Tier 2", labels: ["urgent"] });
    expect(String((runMock.mock.calls[0][0] as { instructions: string }).instructions)).toContain("nothing to choose between");
  });

  it("still classifies when the helpdesk cannot be reached", async () => {
    sourceMock.mockRejectedValue(new Error("Jira is down"));
    chosen({ requestType: "Question", tier: "Tier 1" });
    const row = await conversation();
    expect((await classify(row)).done).toBe(true);
    expect((await reload(row.id)).requestType).toBe("Question");
  });

  it("never overwrites what a person set", async () => {
    chosen({ requestType: "Problem", tier: "Tier 3" });
    const row = await conversation({ requestType: "Billing", tier: "Tier 1", classificationSource: "manual", ticketSummary: "Already summarised." });
    expect(await classify(row)).toEqual({ done: false, reason: "manual" });
    expect(runMock).not.toHaveBeenCalled();
    expect(await reload(row.id)).toMatchObject({ requestType: "Billing", tier: "Tier 1" });
  });

  it("does not run again once there is a tier, unless the conversation was just handed over", async () => {
    const row = await conversation({ tier: "Tier 1", requestType: "Question", labels: ["billing"], classificationSource: "worker", ticketSummary: "Already summarised." });
    expect(await classify(row)).toEqual({ done: false, reason: "not_needed" });
    expect(runMock).not.toHaveBeenCalled();

    chosen({ tier: "Tier 3", labels: ["urgent"] });
    expect((await classify(row, true)).done).toBe(true);
    const after = await reload(row.id);
    expect(after.tier).toBe("Tier 3");
    expect(after.requestType).toBe("Question");
    expect(after.labels).toEqual(["billing", "urgent"]);
    expect(String((runMock.mock.calls[0][0] as { instructions: string }).instructions)).toContain("handed this conversation to a person");
  });

  it("leaves the ticket as it was when the model fails or answers badly", async () => {
    const row = await conversation();
    runMock.mockRejectedValue(new Error("provider outage"));
    expect(await classify(row)).toEqual({ done: false, reason: "failed" });
    runMock.mockResolvedValue({ finalOutput: { nonsense: true } });
    expect(await classify(row)).toEqual({ done: false, reason: "failed" });
    expect(await reload(row.id)).toMatchObject({ requestType: null, tier: null, labels: [], classificationSource: null });
  });

  it("does nothing, and asks nothing, without a model", async () => {
    process.env.DEMO_MODE = "true";
    const row = await conversation();
    expect(await classify(row)).toEqual({ done: false, reason: "no_model" });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("writes a short ticket summary, refreshes it on handover, and still writes it when a person set the classification", async () => {
    chosen({ requestType: "Problem", tier: "Tier 2", summary: "  Jordan from Pinecrest wants a custom report.  " } as never);
    const row = await conversation();
    await classify(row);
    expect((await reload(row.id)).ticketSummary).toBe("Jordan from Pinecrest wants a custom report.");

    chosen({ requestType: "Problem", tier: "Tier 3", summary: "Now handed over with the report details." } as never);
    const manual = await conversation({ requestType: "Billing", tier: "Tier 1", classificationSource: "manual" });
    await classify(manual, true);
    const after = await reload(manual.id);
    expect(after).toMatchObject({ requestType: "Billing", tier: "Tier 1", classificationSource: "manual", ticketSummary: "Now handed over with the report details." });
  });

  it("does not wipe a tier when the model picks none", async () => {
    chosen({ requestType: "Question", tier: "nonsense" });
    const row = await conversation({ tier: "Tier 2" });
    await classify(row, true);
    expect((await reload(row.id)).tier).toBe("Tier 2");
  });
});

describe("a many-part message handed over for one part", () => {
  const turns = [
    { speaker: "Ana", body: "How do I add a provider, run a report and get a quote for 50 users?" },
    { speaker: "Eva", body: "Here are the steps for the first two. I can't confirm pricing, a teammate will." },
  ];

  it("tells the summary writer and the classifier that the ticket is only for what is still unanswered", async () => {
    runMock.mockResolvedValue({ finalOutput: "Ana needs a quote for 50 users. Adding a provider and running a report were already answered." });
    process.env.OPENAI_API_KEY ||= "test-key";
    expect(await summarizeForHandoff(turns)).toContain("quote for 50 users");
    expect(String((runMock.mock.calls[0][0] as { instructions: string }).instructions)).toContain("only for what is still unanswered");

    runMock.mockClear();
    chosen({ requestType: "Request", tier: "Tier 1", labels: [] });
    await classify(await conversation());
    expect(String((runMock.mock.calls[0][0] as { instructions: string }).instructions)).toContain("only for what is still unanswered");
  });
});

describe("a customer turn", () => {
  async function turn(conversationId: string, body: string) {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    const prior = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    const [userMessage] = await db.insert(messages).values({ conversationId, senderType: "customer", senderName: "Dana", body }).returning();
    return runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation: row, priorMessages: prior, userMessage, speakerName: "Dana" });
  }

  it("classifies the ticket after the reply is stored, then again on handover", async () => {
    runAgentMock.mockResolvedValue({ answer: "Try resetting it.", confidence: 0.9, escalate: false, citations: [] });
    chosen({ requestType: "Question", tier: "Tier 1", summary: "Asks how to reset a password." } as never);
    const row = await conversation();

    const first = await turn(row.id, "How do I reset my password?");
    expect(first.reply.body).toBe("Try resetting it.");
    await vi.waitFor(async () => expect((await reload(row.id)).tier).toBe("Tier 1"));
    expect(await reload(row.id)).toMatchObject({ requestType: "Question", classificationSource: "worker" });

    // A second plain answer does not ask the model again.
    runMock.mockClear();
    await turn(row.id, "Thanks, and where is the button?");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(runMock).not.toHaveBeenCalled();

    runAgentMock.mockResolvedValue({ answer: "Bringing in a teammate.", confidence: 0.2, escalate: true, citations: [] });
    chosen({ requestType: "Problem", tier: "Tier 3", labels: ["urgent"] });
    await turn(row.id, "Now nobody can log in at all");
    await vi.waitFor(async () => expect((await reload(row.id)).tier).toBe("Tier 3"));
    expect(await reload(row.id)).toMatchObject({ requestType: "Problem", labels: ["urgent"], status: "needs_human" });
  });

  it("answers the customer even when classification blows up", async () => {
    runAgentMock.mockResolvedValue({ answer: "Here you go.", confidence: 0.9, escalate: false, citations: [] });
    runMock.mockRejectedValue(new Error("provider outage"));
    const row = await conversation();
    const result = await turn(row.id, "Hello");
    expect(result.reply.body).toBe("Here you go.");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await reload(row.id)).tier).toBeNull();
  });
});

describe("a worker profile", () => {
  it("has no ticket schema until one is saved", async () => {
    const profile = await getOrCreateProfile(orgId);
    expect(profile.ticketSchema).toBeNull();
    const [row] = await db.select().from(workerProfiles).where(eq(workerProfiles.id, profile.id));
    expect(row.ticketSchema).toBeNull();
  });
});
