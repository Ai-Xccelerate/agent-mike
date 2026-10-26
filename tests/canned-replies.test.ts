import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/canned-replies/route";
import { DELETE, PATCH } from "@/app/api/v1/canned-replies/[id]/route";
import { ensureOrganization } from "@/lib/bootstrap";
import { buildInstructions } from "@/lib/agent";
import { CANNED_LIMITS, cannedRepliesBlock, createCannedReply } from "@/lib/canned-replies";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";

const previous = getIdentityAdapter();
let orgId: string;
let role: "owner" | "member" = "owner";

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  role = "owner";
  await ensureOrganization(orgId, "Canned org");
  setIdentityAdapter({ resolveManagerRequest: async () => ({ orgId, userId: "m", role, source: "test" }), resolveWidgetRequest: async () => null });
});
afterEach(() => setIdentityAdapter(previous));

const json = (method: string, body?: unknown) =>
  new NextRequest("http://x/api/v1/canned-replies", { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body), duplex: "half" as const }) });
const reply = { title: "Fix date", situation: "A customer asks when a bug will be fixed", reply: "I can't give a date, but I've passed it to the team and they'll update you here." };

describe("canned replies", () => {
  it("lets an admin add, change, switch off and delete one, and a member only read", async () => {
    const created = (await (await POST(json("POST", reply))).json()) as { id: string };
    expect(created).toMatchObject({ title: "Fix date", enabled: true });
    const patched = await PATCH(json("PATCH", { enabled: false, reply: "New wording" }), { params: { id: created.id } });
    expect(await patched.json()).toMatchObject({ enabled: false, reply: "New wording" });
    role = "member";
    expect(((await (await GET(json("GET"))).json()) as { replies: unknown[]; canChange: boolean })).toMatchObject({ canChange: false });
    expect((await POST(json("POST", reply))).status).toBe(403);
    expect((await DELETE(json("DELETE"), { params: { id: created.id } })).status).toBe(403);
    role = "owner";
    expect((await DELETE(json("DELETE"), { params: { id: created.id } })).status).toBe(200);
    expect((await DELETE(json("DELETE"), { params: { id: created.id } })).status).toBe(404);
  });

  it("refuses empty or oversized text and more than the limit", async () => {
    expect((await POST(json("POST", { ...reply, reply: "" }))).status).toBe(422);
    expect((await POST(json("POST", { ...reply, reply: "x".repeat(CANNED_LIMITS.reply + 1) }))).status).toBe(422);
    for (let i = 0; i < CANNED_LIMITS.perOrganization; i++) await createCannedReply(orgId, reply);
    expect((await POST(json("POST", reply))).status).toBe(409);
  });

  it("never shows one organization's replies to another", async () => {
    await createCannedReply(orgId, reply);
    const other = `org-${crypto.randomUUID()}`;
    await ensureOrganization(other, "Other");
    expect(await cannedRepliesBlock(other)).toBe("");
    expect(await cannedRepliesBlock(orgId)).toContain("I can't give a date");
  });

  it("puts only switched-on replies in the instructions, and nothing when there are none", async () => {
    expect(await cannedRepliesBlock(orgId)).toBe("");
    const off = await createCannedReply(orgId, { ...reply, title: "Off", reply: "Switched off wording", enabled: false });
    await createCannedReply(orgId, reply);
    const block = await cannedRepliesBlock(orgId);
    expect(block).toContain("When: A customer asks when a bug will be fixed");
    expect(block).not.toContain("Switched off wording");
    expect(off?.enabled).toBe(false);
  });

  it("reach the worker's instructions, above the part that changes every turn", async () => {
    const profile = { displayName: "Eva", role: "Support", tone: "friendly", managerName: "Sam", confidenceThreshold: 0.6, escalationTerms: [], enabledSkills: [] } as never;
    await createCannedReply(orgId, reply);
    const instructions = await buildInstructions(profile, "Acme", [], orgId);
    expect(instructions).toContain("Approved wording from the team");
    expect(instructions).toContain("Say: I can't give a date");
    expect(instructions.indexOf("Approved wording")).toBeLessThan(instructions.indexOf("Reminder: if the reference material above"));
    const none = await buildInstructions(profile, "Acme", [], `org-${crypto.randomUUID()}`);
    expect(none).not.toContain("Approved wording");
  });
});
