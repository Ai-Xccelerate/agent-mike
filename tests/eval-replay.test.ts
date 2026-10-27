import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, evalRuns, workerManagers, workerProfiles } from "@/db/schema";
import { GET as listCases, POST as createCase } from "@/app/api/v1/eval-cases/route";
import { DELETE as deleteCase, PATCH as patchCase } from "@/app/api/v1/eval-cases/[id]/route";
import { GET as listRuns, POST as startRun } from "@/app/api/v1/eval-runs/route";
import { ensureOrganization, getOrCreateProfile } from "@/lib/bootstrap";
import { EVAL_CASE_LIMITS, createEvalCase, redactForCase, suggestExpectation } from "@/lib/eval-cases";
import { startReplay, verdictFor } from "@/lib/eval-replay";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { sendAsWorker } from "@/lib/outbound";
import { recordHandoffInJira } from "@/lib/tools-integrations/atlassian";

const runAgentMock = vi.hoisted(() => vi.fn());
const judgeSays = vi.hoisted(() => ({ value: { score: 0.9, reason: "Same steps" } as unknown }));

vi.mock("@/lib/outbound", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/outbound")>()), sendAsWorker: vi.fn(async () => ({ id: "sent" })) }));
vi.mock("@/lib/agent", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent")>()), runAgent: runAgentMock }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: vi.fn(async () => ({ matches: [], sources: [] })) }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  recordHandoffInJira: vi.fn(async () => ({ key: "SUP-1", created: true })),
  helpdeskRaisesTickets: vi.fn(async () => true),
  helpdeskTicketsEveryConversation: vi.fn(async () => true),
}));
vi.mock("@/lib/conversation-memory", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/conversation-memory")>()), maybeRefreshConversationSummary: vi.fn(async (_p: unknown, current: unknown) => current) }));
vi.mock("@/lib/ticket-classifier", () => ({ classifyConversation: vi.fn(async () => ({ done: false, reason: "not_needed" })), summarizeForHandoff: vi.fn(async () => "summary") }));
vi.mock("@openai/agents", async (importOriginal) => ({ ...(await importOriginal<typeof import("@openai/agents")>()), run: vi.fn(async () => ({ finalOutput: judgeSays.value })) }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), modelUnavailabilityReason: () => null }));

const previous = getIdentityAdapter();
let orgId: string;
let role: "owner" | "member" = "owner";

const json = (method: string, body?: unknown) =>
  new NextRequest("http://x/api/v1/eval-cases", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body), duplex: "half" as const }) });

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  role = "owner";
  await ensureOrganization(orgId, "Replay org");
  setIdentityAdapter({ resolveManagerRequest: async () => ({ orgId, userId: "m1", role, source: "test" }), resolveWidgetRequest: async () => null });
  vi.mocked(sendAsWorker).mockClear();
  vi.mocked(recordHandoffInJira).mockClear();
  runAgentMock.mockReset();
  judgeSays.value = { score: 0.9, reason: "Same steps" };
});
afterEach(() => setIdentityAdapter(previous));

const answer = { answer: "Open Providers and choose New.", confidence: 0.9, escalate: false, citations: ["Add a Provider"] };
const handoff = { answer: "I'm bringing in a teammate.", confidence: 0.3, escalate: true, citations: [] };

describe("test cases", () => {
  it("takes personal details out before saving, and wants an expectation", async () => {
    const made = await createEvalCase(orgId, "m1", { question: "Hi, I'm Dana (dana@acme.org, 416-555-0199). How do I add a provider?", reference: "Open Providers and choose New. Ask dana@acme.org.", expectHandover: false });
    if (!made.ok) throw new Error("setup");
    expect(made.evalCase.question).not.toMatch(/dana@acme|416-555/);
    expect(made.evalCase.reference).not.toContain("dana@acme.org");
    expect((await createEvalCase(orgId, "m1", { question: "How do I add a provider?" })).ok).toBe(false);
    expect(redactForCase("Call 416-555-0199 or write dana@acme.org")).toBe("Call [phone] or write [email]");
  });

  it("suggests an expectation from a review item for the manager to confirm", () => {
    expect(suggestExpectation({ kind: "bad_rating", reasons: ["Should have handed over"], correction: null, answer: "x" })).toEqual({ reference: null, expectHandover: true });
    expect(suggestExpectation({ kind: "bad_rating", reasons: ["Wrong answer"], correction: "Use the New button.", answer: "x" })).toEqual({ reference: "Use the New button.", expectHandover: false });
    expect(suggestExpectation({ kind: "team_answer", reasons: [], correction: null, answer: "Restart the site." })).toEqual({ reference: "Restart the site.", expectHandover: false });
    expect(suggestExpectation({ kind: "no_article", reasons: [], correction: null, answer: "x" })).toEqual({ reference: null, expectHandover: null });
  });

  it("is managed by admins, read by members, and kept to the organization", async () => {
    const created = (await (await createCase(json("POST", { question: "How do I add a provider?", reference: "Open Providers.", expectHandover: false }))).json()) as { id: string };
    expect(await (await patchCase(json("PATCH", { enabled: false }), { params: { id: created.id } })).json()).toMatchObject({ enabled: false });
    role = "member";
    expect(await (await listCases(json("GET"))).json()).toMatchObject({ canChange: false });
    expect((await createCase(json("POST", { question: "Another one?", expectHandover: true }))).status).toBe(403);
    role = "owner";
    expect((await deleteCase(json("DELETE"), { params: { id: created.id } })).status).toBe(200);
    expect((await deleteCase(json("DELETE"), { params: { id: created.id } })).status).toBe(404);
    for (let i = 0; i < EVAL_CASE_LIMITS.perOrganization; i++) await createEvalCase(orgId, "m1", { question: `Question number ${i}?`, expectHandover: true });
    expect((await createCase(json("POST", { question: "One too many?", expectHandover: true }))).status).toBe(409);
  });
});

describe("the verdict on a case", () => {
  it("passes a hand-over only when one was expected, and an answer only when it matches the reference", () => {
    expect(verdictFor({ reference: null, expectHandover: true }, { handedOver: true }, null).pass).toBe(true);
    expect(verdictFor({ reference: null, expectHandover: true }, { handedOver: false }, null).pass).toBe(false);
    expect(verdictFor({ reference: "Use New.", expectHandover: false }, { handedOver: true }, null)).toMatchObject({ pass: false, reason: "Handed over instead of answering" });
    expect(verdictFor({ reference: "Use New.", expectHandover: false }, { handedOver: false }, { score: 0.9, reason: "ok" }).pass).toBe(true);
    expect(verdictFor({ reference: "Use New.", expectHandover: false }, { handedOver: false }, { score: 0.4, reason: "missing a step" }).pass).toBe(false);
    expect(verdictFor({ reference: "Use New.", expectHandover: false }, { handedOver: false }, null).reason).toBe("The answer could not be scored");
    expect(verdictFor({ reference: null, expectHandover: false }, { handedOver: false }, null).pass).toBe(true);
  });
});

describe("replaying the cases", () => {
  async function seed() {
    await createEvalCase(orgId, "m1", { question: "How do I add a provider?", reference: "Open Providers and choose New.", expectHandover: false });
    await createEvalCase(orgId, "m1", { question: "Nobody can log in at all", expectHandover: true });
  }

  it("scores them through the real pipeline, and sends, routes and tickets nothing", async () => {
    await db.insert(workerManagers).values({ organizationId: orgId, name: "Asif", email: "asif@x.example", areas: "providers" });
    await getOrCreateProfile(orgId);
    await db.update(workerProfiles).set({ managerName: "Team", managerEmail: "team@x.example", emailManagerOnHandoff: true }).where(eq(workerProfiles.organizationId, orgId));
    await seed();
    // runAgent(profile, organizationName, message, ...): the third argument is what the customer asked.
    runAgentMock.mockImplementation(async (_profile: unknown, _org: unknown, message: string) => (/log in/i.test(message) ? handoff : answer));
    const started = await startReplay({ organizationId: orgId, triggeredBy: "m1", awaitFinish: true });
    if (!started.ok) throw new Error(started.error);
    const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, started.runId));
    expect(run).toMatchObject({ status: "done", total: 2, passed: 2, score: 1 });
    const results = run.results as { question: string; pass: boolean; handedOver: boolean; score: number | null }[];
    expect(results.find((r) => /add a provider/i.test(r.question))).toMatchObject({ pass: true, handedOver: false, score: 0.9 });
    expect(results.find((r) => /log in/i.test(r.question))).toMatchObject({ pass: true, handedOver: true });
    // Nothing left the building.
    expect(sendAsWorker).not.toHaveBeenCalled();
    expect(recordHandoffInJira).not.toHaveBeenCalled();
    // And no conversation remains.
    expect(await db.select().from(conversations).where(eq(conversations.organizationId, orgId))).toEqual([]);
  });

  it("fails a case that gives a different answer, and one that hands over when it should answer", async () => {
    await seed();
    judgeSays.value = { score: 0.2, reason: "Different steps" };
    runAgentMock.mockResolvedValue(answer);
    const started = await startReplay({ organizationId: orgId, triggeredBy: "m1", awaitFinish: true });
    if (!started.ok) throw new Error(started.error);
    const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, started.runId));
    // The provider case is answered but judged different; the log-in case was expected to hand over and answered instead.
    expect(run).toMatchObject({ passed: 0, score: 0 });
  });

  it("refuses with no cases, or while another replay is running, and only an admin may start one", async () => {
    expect(await startReplay({ organizationId: orgId, triggeredBy: "m1" })).toMatchObject({ ok: false, status: 422 });
    await seed();
    await db.insert(evalRuns).values({ organizationId: orgId, triggeredBy: "m1" });
    expect(await startReplay({ organizationId: orgId, triggeredBy: "m1" })).toMatchObject({ ok: false, status: 409 });
    role = "member";
    expect((await startRun(json("POST"))).status).toBe(403);
    expect(await (await listRuns(json("GET"))).json()).toMatchObject({ canChange: false });
  });
});
