import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/db/schema";
import { POST } from "@/app/api/v1/conversations/[id]/raise-ticket/route";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";
import { getIdentityAdapter, setIdentityAdapter } from "@/lib/identity";

const jira = vi.hoisted(() => ({ raises: vi.fn(async () => true), record: vi.fn(async (_input: unknown) => ({ key: "SUP-77", created: true, title: "Cannot finish email code" })) }));
vi.mock("@/lib/tools-integrations/atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tools-integrations/atlassian")>()),
  helpdeskRaisesTickets: jira.raises,
  recordHandoffInJira: jira.record,
}));

const previous = getIdentityAdapter();
let orgId: string;

const as = (role: "owner" | "member") =>
  setIdentityAdapter({
    resolveManagerRequest: async () => ({ orgId, userId: "m", role, source: "test" }),
    resolveWidgetRequest: async () => null,
  });
const call = (id: string) => POST(new NextRequest(`http://x/api/v1/conversations/${id}/raise-ticket`, { method: "POST" }), { params: { id } });

beforeEach(async () => {
  orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, "Raise ticket org");
  jira.raises.mockClear().mockResolvedValue(true);
  jira.record.mockClear();
});
afterEach(() => setIdentityAdapter(previous));

async function waitingConversation() {
  const row = await insertConversationWithTicket({ organizationId: orgId, channel: "widget", customerName: "Dana", customerEmail: "dana@acme.org" });
  await db.insert(messages).values({ conversationId: row.id, senderType: "customer", senderName: "Dana", body: "I never get the code" });
  return row;
}

describe("a manager raising the ticket", () => {
  it("raises it from what the customer typed, marked as manager-raised and not on the customer's behalf", async () => {
    as("owner");
    const row = await waitingConversation();
    const res = await call(row.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ key: "SUP-77" });
    const input = jira.record.mock.calls[0][0] as { raisedByManager: boolean; verifiedCustomer?: unknown; latestMessage: string };
    expect(input).toMatchObject({ raisedByManager: true, latestMessage: "I never get the code" });
    expect(input.verifiedCustomer).toBeUndefined();
    expect((await db.select().from(conversations).where(eq(conversations.id, row.id)))[0].status).toBe("needs_human");
  });

  it("is for admins, for this organization's conversations, and only once", async () => {
    const row = await waitingConversation();
    as("member");
    expect((await call(row.id)).status).toBe(403);
    as("owner");
    expect((await call(crypto.randomUUID())).status).toBe(404);
    await db.update(conversations).set({ externalTicketKey: "SUP-1" }).where(eq(conversations.id, row.id));
    expect((await call(row.id)).status).toBe(409);
    expect(jira.record).not.toHaveBeenCalled();
  });

  it("says so when ticket raising is off or the helpdesk refuses", async () => {
    as("owner");
    const row = await waitingConversation();
    jira.raises.mockResolvedValueOnce(false);
    expect((await call(row.id)).status).toBe(409);
    jira.record.mockResolvedValueOnce({ failed: "Jira said no" } as never);
    const refused = await call(row.id);
    expect(refused.status).toBe(502);
    expect(((await refused.json()) as { error: string }).error).toBe("Jira said no");
  });
});
