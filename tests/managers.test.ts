import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, workerProfiles } from "@/db/schema";
import { GET, POST } from "@/app/api/v1/managers/route";
import { DELETE, PATCH } from "@/app/api/v1/managers/[id]/route";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { insertConversationWithTicket, runCustomerTurn } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { MANAGER_LIMITS, createManager, listManagers, resolveRecipients, suggestedAssigneeNote, validateManagerChoice } from "@/lib/managers";
import { sendAsWorker } from "@/lib/outbound";
import { addInternalTicketNote } from "@/lib/tools-integrations/atlassian";

const runAgentMock = vi.hoisted(() => vi.fn());
const choiceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/outbound", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/outbound")>()), sendAsWorker: vi.fn(async () => ({ id: "sent" })) }));
vi.mock("@/lib/agent", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent")>()), runAgent: runAgentMock }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
// The model that picks the person: what choiceMock returns is what it "says"; null means it failed.
vi.mock("@openai/agents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@openai/agents")>()),
  run: vi.fn(async () => {
    const said = await choiceMock();
    if (said === null) throw new Error("model failed");
    return { finalOutput: said };
  }),
}));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), modelUnavailabilityReason: () => null }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => ({ key: "SUP-9", created: true, title: "Printing broken" })),
  addInternalTicketNote: vi.fn(async () => true),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversation-memory")>()),
  maybeRefreshConversationSummary: vi.fn(async (_p: unknown, current: unknown) => current),
}));
vi.mock("@/lib/ticket-classifier", () => ({
  classifyConversation: vi.fn(async () => ({ done: false, reason: "not_needed" })),
  summarizeForHandoff: vi.fn(async () => "Printing is broken for the office."),
}));

const previous = getIdentityAdapter();
let orgId: string;
let role: "owner" | "member" = "owner";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://x/api/v1/managers", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body), duplex: "half" as const }) });

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  role = "owner";
  await ensureOrganization(orgId, "Managers org");
  setIdentityAdapter({ resolveManagerRequest: async () => ({ orgId, userId: "m", role, source: "test" }), resolveWidgetRequest: async () => null });
  vi.mocked(sendAsWorker).mockClear();
  vi.mocked(addInternalTicketNote).mockClear();
  runAgentMock.mockReset();
  choiceMock.mockReset();
});
afterEach(() => setIdentityAdapter(previous));

const person = (name: string, extra: Record<string, unknown> = {}) => ({ name, email: `${name.toLowerCase()}@eapexpert.example`, areas: `${name}'s area`, ...extra });

describe("the manager list", () => {
  it("lets an admin add, change, switch off and remove people, and a member only read", async () => {
    const created = (await (await POST(json("POST", person("Asif", { areas: "V3, MyAPP" })))).json()) as { id: string };
    const backup = (await (await POST(json("POST", person("Alex", { backupId: created.id })))).json()) as { id: string; backupId: string };
    expect(backup.backupId).toBe(created.id);
    expect(await (await PATCH(json("PATCH", { enabled: false }), { params: { id: created.id } })).json()).toMatchObject({ enabled: false });
    role = "member";
    expect(await (await GET(json("GET"))).json()).toMatchObject({ canChange: false });
    expect((await POST(json("POST", person("Mia")))).status).toBe(403);
    role = "owner";
    expect((await DELETE(json("DELETE"), { params: { id: created.id } })).status).toBe(200);
    expect((await listManagers(orgId)).find((m) => m.id === backup.id)?.backupId).toBeNull();
    expect((await DELETE(json("DELETE"), { params: { id: created.id } })).status).toBe(404);
  });

  it("refuses a bad email, a backup that is not in the list or is the person themselves, and too many people", async () => {
    expect((await POST(json("POST", { ...person("Asif"), email: "nope" }))).status).toBe(422);
    expect((await POST(json("POST", person("Asif", { backupId: crypto.randomUUID() })))).status).toBe(422);
    const own = (await (await POST(json("POST", person("Asif")))).json()) as { id: string };
    expect((await PATCH(json("PATCH", { backupId: own.id }), { params: { id: own.id } })).status).toBe(422);
    for (let i = 0; i < MANAGER_LIMITS.perOrganization - 1; i++) await createManager(orgId, { ...person(`P${i}`), email: `p${i}@x.example` });
    expect((await POST(json("POST", person("Over")))).status).toBe(409);
  });

  it("never shows one organization's people to another", async () => {
    await createManager(orgId, person("Asif"));
    const other = `org-${crypto.randomUUID()}`;
    await ensureOrganization(other, "Other");
    expect(await listManagers(other)).toEqual([]);
  });
});

describe("who is told", () => {
  const asif = { id: "a", name: "Asif", email: "asif@x.example", backupId: "b", notifyOnCritical: false, enabled: true };
  const alex = { id: "b", name: "Alex", email: "alex@x.example", backupId: null, notifyOnCritical: true, enabled: true };
  const fallback = { name: "Support Team", email: "team@x.example" };

  it("tells the routed person, and their backup while they are switched off", () => {
    expect(resolveRecipients({ managers: [asif, alex], routedId: "a", critical: false, fallback }).recipients).toEqual([{ email: "asif@x.example", name: "Asif", why: "routed" }]);
    const away = resolveRecipients({ managers: [{ ...asif, enabled: false }, alex], routedId: "a", critical: false, fallback });
    expect(away.recipients).toEqual([{ email: "alex@x.example", name: "Alex", why: "backup" }]);
    expect(away.assignee).toEqual({ id: "b", name: "Alex" });
  });

  it("adds the Critical group on Critical, once per address", () => {
    const result = resolveRecipients({ managers: [asif, alex], routedId: "a", critical: true, fallback });
    expect(result.recipients.map((r) => r.email)).toEqual(["asif@x.example", "alex@x.example"]);
    expect(resolveRecipients({ managers: [asif, alex], routedId: "b", critical: true, fallback }).recipients).toHaveLength(1);
  });

  it("falls back to the single manager when nobody matches, nobody is on, or backups loop", () => {
    expect(resolveRecipients({ managers: [asif, alex], routedId: null, critical: false, fallback }).recipients).toEqual([{ email: "team@x.example", name: "Support Team", why: "default" }]);
    const loop = [{ ...asif, enabled: false, backupId: "b" }, { ...alex, enabled: false, backupId: "a" }];
    expect(resolveRecipients({ managers: loop, routedId: "a", critical: false, fallback }).recipients[0].why).toBe("default");
    expect(resolveRecipients({ managers: [], routedId: null, critical: false, fallback: { name: "x", email: null } }).recipients).toEqual([]);
  });

  it("keeps only an id that is in the list, and writes the internal note", () => {
    expect(validateManagerChoice({ managerId: "made-up", critical: true }, [asif])).toEqual({ managerId: null, critical: true });
    expect(validateManagerChoice({ managerId: " a ", critical: false }, [asif])).toEqual({ managerId: "a", critical: false });
    const note = suggestedAssigneeNote({ recipients: [], assignee: { id: "a", name: "Asif" }, critical: true, chosen: { name: "Asif", areas: "V3", backupName: "Alex", away: false } });
    expect(note).toContain("Suggested assignee: Asif (covers: V3).");
    expect(note).toContain("Backup: Alex.");
    expect(note).toContain("Critical");
  });
});

describe("routing a real handover", () => {
  async function handOver(message: string) {
    await getOrCreateProfile(orgId);
    await db.update(workerProfiles).set({ managerName: "Support Team", managerEmail: "team@eapexpert.example" }).where(eq(workerProfiles.organizationId, orgId));
    const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", subject: message });
    const [userMessage] = await db.insert(messages).values({ conversationId: row.id, senderType: "customer", senderName: "Visitor", body: message }).returning();
    await runCustomerTurn({ organizationId: orgId, profile: await getOrCreateProfile(orgId), conversation: row, priorMessages: [], userMessage, speakerName: "Visitor" });
    return (await db.select().from(conversations).where(eq(conversations.id, row.id)))[0];
  }
  const handoff = { answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] };

  it("emails the person chosen by area, assigns the conversation to them and leaves an internal note on the ticket", async () => {
    const asif = await createManager(orgId, person("Asif", { areas: "V3, MyAPP" }));
    if (!asif.ok) throw new Error("setup");
    runAgentMock.mockResolvedValue(handoff);
    choiceMock.mockResolvedValue({ managerId: asif.manager.id, critical: false });
    const conversation = await handOver("The V3 report page is blank");
    expect(sendAsWorker).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendAsWorker).mock.calls[0][0];
    expect(sent.to).toEqual([{ email: "asif@eapexpert.example", name: "Asif" }]);
    expect(sent.body).toContain("Routed to Asif");
    expect(sent.subject).not.toContain("[Critical]");
    expect(conversation).toMatchObject({ assignedTo: "Asif", routedManagerId: asif.manager.id, status: "needs_human" });
    expect(addInternalTicketNote).toHaveBeenCalledWith(orgId, "SUP-9", expect.stringContaining("Suggested assignee: Asif"));
  });

  it("emails the Critical group as well on a Critical handover, and flags it", async () => {
    const asif = await createManager(orgId, person("Asif"));
    const lead = await createManager(orgId, person("Lead", { notifyOnCritical: true }));
    if (!asif.ok || !lead.ok) throw new Error("setup");
    runAgentMock.mockResolvedValue(handoff);
    choiceMock.mockResolvedValue({ managerId: asif.manager.id, critical: true });
    await handOver("Nobody in the whole office can log in");
    const sent = vi.mocked(sendAsWorker).mock.calls[0][0];
    expect(sent.to.map((r) => r.email).sort()).toEqual(["asif@eapexpert.example", "lead@eapexpert.example"]);
    expect(sent.subject).toContain("[Critical]");
    expect(sent.body).toContain("CRITICAL");
  });

  it("tells the profile's single manager when the list is empty or the worker cannot choose", async () => {
    runAgentMock.mockResolvedValue(handoff);
    const conversation = await handOver("Something is wrong");
    expect(vi.mocked(sendAsWorker).mock.calls[0][0].to).toEqual([{ email: "team@eapexpert.example", name: "Support Team" }]);
    expect(conversation).toMatchObject({ assignedTo: "Support Team", routedManagerId: null });
    expect(addInternalTicketNote).not.toHaveBeenCalled();

    vi.mocked(sendAsWorker).mockClear();
    await createManager(orgId, person("Asif"));
    choiceMock.mockResolvedValue(null);
    await handOver("Another problem");
    expect(vi.mocked(sendAsWorker).mock.calls[0][0].to).toEqual([{ email: "team@eapexpert.example", name: "Support Team" }]);
  });

  it("does not route or email when the worker answers it herself", async () => {
    await createManager(orgId, person("Asif"));
    runAgentMock.mockResolvedValue({ answer: "Here is how.", confidence: 0.9, escalate: false, citations: [] });
    await handOver("How do I add a provider?");
    expect(sendAsWorker).not.toHaveBeenCalled();
    expect(choiceMock).not.toHaveBeenCalled();
  });
});
