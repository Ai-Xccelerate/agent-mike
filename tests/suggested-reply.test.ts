import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, organizations } from "@/db/schema";
import { POST } from "@/app/api/v1/conversations/[id]/suggested-reply/route";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";
import { draftInstructions, parseDraft } from "@/lib/suggested-reply";

const model = vi.hoisted(() => ({ run: vi.fn(), retrieve: vi.fn() }));
vi.mock("@openai/agents", async (importOriginal) => ({ ...(await importOriginal<typeof import("@openai/agents")>()), run: model.run }));
vi.mock("@/lib/retrieval", () => ({ retrieveKnowledge: model.retrieve }));

const previous = getIdentityAdapter();
const previousDemo = process.env.DEMO_MODE;
const previousKey = process.env.OPENAI_API_KEY;
let orgId: string;

const asManager = (org: string) =>
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId: org, userId: "m", role: "member", source: "test" }),
    resolveWidgetRequest: async () => null,
  });
const call = (id: string) => POST(new NextRequest(`http://x/api/v1/conversations/${id}/suggested-reply`, { method: "POST" }), { params: { id } });

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Draft org");
  asManager(orgId);
  process.env.DEMO_MODE = "false";
  process.env.OPENAI_API_KEY = "sk-test";
  model.run.mockReset();
  model.retrieve.mockReset().mockResolvedValue({ matches: [], sources: [] });
});
afterEach(async () => {
  setIdentityAdapter(previous);
  await db.delete(organizations).where(eq(organizations.id, orgId));
  if (previousDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = previousDemo;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

async function conversationWith(question: string, channel = "widget") {
  const row = await insertConversationWithTicket({ organizationId: orgId, channel, customerName: "Dana", customerEmail: null });
  if (question) await db.insert(messages).values({ conversationId: row.id, senderType: "customer", senderName: "Dana", body: question });
  return row;
}

const article = { documentId: "d1", title: "Reset your password", heading: "Steps", content: "Open Settings, choose Security, then Reset password.", rank: 1 };

describe("the suggested reply route", () => {
  it("writes a draft from the help articles and stores nothing", async () => {
    const row = await conversationWith("How do I reset my password?");
    model.retrieve.mockResolvedValue({ matches: [article], sources: [] });
    model.run.mockResolvedValue({ finalOutput: "Open Settings, choose Security, then Reset password. From: Reset your password" });

    const res = await call(row.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { body: string; sources: string[]; needsCheck: boolean };
    expect(body.body).toContain("Reset password");
    expect(body.sources).toEqual(["Reset your password"]);
    expect(body.needsCheck).toBe(false);
    // The model was given the article and asked about the customer's own words.
    expect(model.retrieve.mock.calls[0][1]).toBe("How do I reset my password?");
    expect(model.run.mock.calls[0][0].instructions).toContain("Open Settings, choose Security");
    // Asking for a draft sends nothing and saves nothing.
    expect((await db.select().from(messages).where(eq(messages.conversationId, row.id))).length).toBe(1);
  });

  it("flags a draft no article covered, and drops the marker from the text", async () => {
    const row = await conversationWith("Can you export my data to Salesforce?");
    model.run.mockResolvedValue({ finalOutput: "[[CHECK]]\nLet me check that for you. Which Salesforce plan are you on?" });
    const body = (await (await call(row.id)).json()) as { body: string; needsCheck: boolean };
    expect(body.needsCheck).toBe(true);
    expect(body.body).not.toContain("[[CHECK]]");
    expect(body.body).toMatch(/^Let me check/);
  });

  it("uses the team's recent replies as the voice, only from customer conversations", async () => {
    const earlier = await conversationWith("Where is my invoice?");
    await db.insert(messages).values({ conversationId: earlier.id, senderType: "manager", senderName: "Priya", body: "Hi Dana, it's on its way, give me ten minutes." });
    const practice = await conversationWith("", "chat");
    await db.insert(messages).values({ conversationId: practice.id, senderType: "manager", senderName: "Manager", body: "PLAYGROUND TEST LINE" });
    const row = await conversationWith("Is there a refund window?");
    model.run.mockResolvedValue({ finalOutput: "Hi Dana, yes." });
    await call(row.id);
    const instructions = model.run.mock.calls[0][0].instructions as string;
    expect(instructions).toContain("give me ten minutes");
    expect(instructions).not.toContain("PLAYGROUND TEST LINE");
  });

  it("is for this organization's customer conversations with something to answer", async () => {
    expect((await call(crypto.randomUUID())).status).toBe(404);
    const other = `org-${crypto.randomUUID()}`;
    await ensureOrganization(other, "Other org");
    asManager(other);
    const theirs = await conversationWith("Hello?");
    // A manager of another organization cannot get a draft for this conversation.
    expect((await call(theirs.id)).status).toBe(404);
    asManager(orgId);
    expect((await call((await conversationWith("", "widget")).id)).status).toBe(422);
    expect((await call((await conversationWith("Hi", "assistant")).id)).status).toBe(422);
    await db.delete(organizations).where(eq(organizations.id, other));
    expect(model.run).not.toHaveBeenCalled();
  });

  it("tries once more when the model answers with an empty message, and reports a second blank", async () => {
    const row = await conversationWith("Where do I find my invoices?");
    model.run.mockResolvedValueOnce({ finalOutput: "" }).mockResolvedValueOnce({ finalOutput: "Open Billing, then Invoices." });
    const retried = await call(row.id);
    expect(retried.status).toBe(200);
    expect(((await retried.json()) as { body: string }).body).toBe("Open Billing, then Invoices.");
    expect(model.run).toHaveBeenCalledTimes(2);

    model.run.mockReset().mockResolvedValue({ finalOutput: "   " });
    expect((await call(row.id)).status).toBe(502);
    expect(model.run).toHaveBeenCalledTimes(2);
  });

  it("says so when the model is unavailable or fails, instead of inventing a draft", async () => {
    const row = await conversationWith("Hello there");
    model.run.mockRejectedValue(new Error("provider down"));
    expect((await call(row.id)).status).toBe(502);
    process.env.OPENAI_API_KEY = "";
    const res = await call(row.id);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/not available/);
  });
});

describe("the draft prompt and its parsing", () => {
  const base = { workerName: "Eva", managerName: "Priya", organizationName: "EAP Expert", channel: "widget", role: "Level 1 support", knowledge: "", cannedWording: "", styleExamples: [] };

  it("writes as the team, never as an AI, and bans guessing", () => {
    const text = draftInstructions(base);
    expect(text).toContain("Priya");
    expect(text).toMatch(/never mention being an AI/);
    expect(text).toMatch(/Never invent/);
    expect(text).toContain("none matched");
  });

  it("asks for an email's greeting and sign-off only on email", () => {
    expect(draftInstructions({ ...base, channel: "email" })).toMatch(/greeting/);
    expect(draftInstructions(base)).toMatch(/no greeting block/);
  });

  it("removes em dashes and caps the length", () => {
    expect(parseDraft("Sure — here you go.").body).toBe("Sure, here you go.");
    expect(parseDraft("x".repeat(9000)).body.length).toBe(3900);
    expect(parseDraft("[[check]]\nWhich plan?")).toEqual({ body: "Which plan?", flaggedForCheck: true });
  });
});
